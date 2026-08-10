/**
 * LL97Accumulator — Energy and emissions tracking for LL97 compliance.
 *
 * Tracks cumulative energy consumption and greenhouse gas emissions for the
 * active building as the simulation advances. Each simulated hour increments
 * accumulators based on that building's LL84 annual constants divided by
 * 8,760 hours, with a seasonal adjustment factor derived from outdoor
 * temperature.
 *
 * The active building defaults to window.LL84_CONSTANTS (the real, LL84-
 * verified CTA Training Building) but can be switched to any profile in
 * window.BuildingArchetypes via setActiveBuilding() — see
 * building_archetypes.js for what those represent and why. Switching
 * buildings resets accumulated totals: each building gets its own fresh
 * annual accumulation, the same way a real LL97 report covers one building
 * for one calendar year.
 *
 * LL97 carbon intensity limits are weighted by occupancy-group floor-area
 * proportions (Hotel vs Multifamily Housing), computed live from whichever
 * building is active — not a single flat number. Verified against multiple
 * sources including nyc.gov directly:
 *   - Multifamily Housing (R-2): 6.75 kgCO2e/sf (2024-2029), 3.35 kgCO2e/sf
 *     (2030-2034) — confirmed against nyc.gov and independent sources.
 *   - Hotel: 9.20 / 4.30 kgCO2e/sf — best available estimate; one
 *     third-party source gives 9.50 for 2024 with no 2030 figure to
 *     cross-check, and NYC DOB maintains two valid limit methodologies
 *     (original Building Code occupancy groups vs. newer ESPM property
 *     types, see nyc.gov/site/buildings/codes/REMOVE-greenhouse-gas-
 *     emission-reporting.page) — worth confirming against the authoritative
 *     DOB table before treating as final.
 *   - Penalty rate: $268 per metric ton CO2e over the limit, confirmed
 *     directly on nyc.gov.
 *   - Mixed-use buildings: limit is a floor-area-weighted average across
 *     occupancy groups — confirmed correct methodology.
 *
 * Attached to window.LL97Accumulator (no import/export — Babel standalone).
 */

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  /** Hours in a year — used to derive hourly rates from annual totals */
  var HOURS_PER_YEAR = 8760;

  /** Metric tons to kg conversion */
  var MT_TO_KG = 1000;

  /** LL97 occupancy-group carbon intensity limits (kgCO2e/sqft) — see header for sourcing/confidence notes */
  var HOTEL_LIMIT_2024_KGCO2_PER_SQFT = 9.20;
  var HOTEL_LIMIT_2030_KGCO2_PER_SQFT = 4.30;
  var MULTIFAMILY_LIMIT_2024_KGCO2_PER_SQFT = 6.75;
  var MULTIFAMILY_LIMIT_2030_KGCO2_PER_SQFT = 3.35;

  /** Fallback limits used only if the active building doesn't specify a Hotel/Multifamily floor-area split — the real anchor building's own weighted ratio, a reasonable default for a Manhattan mixed-use property */
  var DEFAULT_LIMIT_2024_KGCO2_PER_SQFT = 7.58;
  var DEFAULT_LIMIT_2030_KGCO2_PER_SQFT = 3.66;

  /** LL97 penalty rate — $268 per metric ton CO2e over the limit, confirmed against nyc.gov */
  var PENALTY_RATE_PER_MTCO2E = 268;

  // ─── Accumulator State ──────────────────────────────────────────────────────

  var totalEnergy_kBTU = 0;
  var electricEnergy_kWh = 0;
  var steamEnergy_kBTU = 0;
  var ghgEmissions_mtCO2e = 0;

  /** Active building: null = default (window.LL84_CONSTANTS, the real anchor building) */
  var activeBuildingId = 'anchor';
  var buildingOverride = null;

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Get LL84 constants from the window global (the real anchor building).
   * @returns {Object|null}
   */
  function getLL84Constants() {
    return window.LL84_CONSTANTS || window.LL84 || null;
  }

  /**
   * Get the currently active building profile — either the explicit
   * override set via setActiveBuilding(), or the default anchor building.
   * @returns {Object|null}
   */
  function getActiveBuildingProfile() {
    if (buildingOverride) return buildingOverride;
    return getLL84Constants();
  }

  /**
   * Compute the LL97 weighted carbon intensity limit for a building profile
   * and compliance period, using floor-area-weighted occupancy-group rates.
   * Falls back to a flat default if the profile doesn't specify a
   * Hotel/Multifamily split.
   * @param {Object} profile - Building profile (needs grossFloorArea_sqft,
   *   hotelFloorArea_sqft, multifamilyFloorArea_sqft)
   * @param {string} period - '2024' or '2030'
   * @returns {number} kgCO2e/sqft
   */
  function computeWeightedLimit(profile, period) {
    var defaultLimit = period === '2030' ? DEFAULT_LIMIT_2030_KGCO2_PER_SQFT : DEFAULT_LIMIT_2024_KGCO2_PER_SQFT;
    if (!profile) return defaultLimit;

    var hotelArea = profile.hotelFloorArea_sqft;
    var mfArea = profile.multifamilyFloorArea_sqft;
    var totalArea = profile.grossFloorArea_sqft;

    if (!hotelArea || !mfArea || !totalArea) {
      return defaultLimit;
    }

    var hotelRate = period === '2030' ? HOTEL_LIMIT_2030_KGCO2_PER_SQFT : HOTEL_LIMIT_2024_KGCO2_PER_SQFT;
    var mfRate = period === '2030' ? MULTIFAMILY_LIMIT_2030_KGCO2_PER_SQFT : MULTIFAMILY_LIMIT_2024_KGCO2_PER_SQFT;

    return (hotelRate * hotelArea + mfRate * mfArea) / totalArea;
  }

  /**
   * Calculate a seasonal energy factor based on outdoor dry bulb temperature.
   *
   * In extreme temperatures (very hot or very cold), HVAC systems work harder,
   * increasing energy consumption. The factor is centered around 1.0 for
   * mild conditions (around 55°F) and increases for extremes.
   *
   * Factor range: approximately 0.7 (mild) to 1.5 (extreme)
   *
   * @param {number} outdoorTemp - Outdoor dry bulb temperature in °F
   * @returns {number} Seasonal adjustment factor (0.7 – 1.5)
   */
  function getSeasonalFactor(outdoorTemp) {
    if (outdoorTemp === undefined || outdoorTemp === null || isNaN(outdoorTemp)) {
      return 1.0;
    }

    // Base temperature for minimal HVAC load
    var baseTemp = 55; // °F — mild condition

    // Distance from the comfort base
    var deviation = Math.abs(outdoorTemp - baseTemp);

    // Linear scaling: factor = 1.0 at baseTemp, increases with deviation
    // Max deviation ~40°F (e.g., 15°F or 95°F) → factor ~1.4
    var factor = 1.0 + (deviation / 100);

    // Clamp to reasonable range
    return Math.max(0.7, Math.min(factor, 1.5));
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Switch the active building. Resets accumulated totals — switching
   * buildings starts a fresh annual accumulation, the same way a real LL97
   * report covers one building for one calendar year; the previous
   * building's accumulated GHG doesn't carry over.
   * @param {string} buildingId - 'anchor' (or falsy) for the real default
   *   building, or any key in window.BuildingArchetypes
   */
  function setActiveBuilding(buildingId) {
    if (!buildingId || buildingId === 'anchor') {
      buildingOverride = null;
      activeBuildingId = 'anchor';
      reset();
      return;
    }
    if (window.BuildingArchetypes && window.BuildingArchetypes[buildingId]) {
      buildingOverride = window.BuildingArchetypes[buildingId];
      activeBuildingId = buildingId;
      reset();
      return;
    }
    console.warn('[LL97Accumulator] Unknown building ID "' + buildingId + '". Keeping current building.');
  }

  /**
   * @returns {string} The currently active building's ID ('anchor' or an
   *   archetype key)
   */
  function getActiveBuildingId() {
    return activeBuildingId;
  }

  /**
   * List all buildings available to switch to, for UI selectors.
   * @returns {Array<{id: string, name: string, description: string, isSynthetic: boolean}>}
   */
  function getAvailableBuildings() {
    var anchor = getLL84Constants();
    var list = [{
      id: 'anchor',
      name: (anchor && anchor.propertyName) || 'CTA Training Building (Real LL84 Data)',
      description: 'The real, LL84-verified building this simulator models — actual reported energy and emissions data.',
      isSynthetic: false
    }];

    if (window.BuildingArchetypes) {
      Object.keys(window.BuildingArchetypes).forEach(function (id) {
        var profile = window.BuildingArchetypes[id];
        list.push({
          id: id,
          name: profile.propertyName,
          description: profile.archetypeDescription,
          isSynthetic: true
        });
      });
    }

    return list;
  }

  /**
   * Increment accumulators by one simulated hour.
   *
   * Uses the active building's LL84 annual totals divided by 8,760 to get
   * base hourly rates, then applies a seasonal factor based on outdoor
   * temperature.
   *
   * @param {Object} hourlyData - Contains at least { outdoorTemp } for seasonal adjustment
   * @param {Object} [ll84Constants] - LL84 constants override (defaults to the active building)
   */
  function tick(hourlyData, ll84Constants) {
    var constants = ll84Constants || getActiveBuildingProfile();
    if (!constants) {
      console.warn('[LL97Accumulator] No LL84 constants available. Skipping tick.');
      return;
    }

    // Base hourly rates from annual totals
    var hourlyElectric = (constants.annualElectric_kWh || 0) / HOURS_PER_YEAR;
    var hourlySteam = (constants.annualSteam_kBTU || 0) / HOURS_PER_YEAR;
    var hourlyEnergy = (constants.annualSiteEnergy_kBTU || 0) / HOURS_PER_YEAR;
    var hourlyGHG = (constants.annualGHG_mtCO2e || 0) / HOURS_PER_YEAR;

    // Apply seasonal factor if outdoor temperature is available
    var outdoorTemp = (hourlyData && hourlyData.outdoorTemp !== undefined)
      ? hourlyData.outdoorTemp
      : null;
    var factor = getSeasonalFactor(outdoorTemp);

    // Increment accumulators
    electricEnergy_kWh += hourlyElectric * factor;
    steamEnergy_kBTU += hourlySteam * factor;
    totalEnergy_kBTU += hourlyEnergy * factor;
    ghgEmissions_mtCO2e += hourlyGHG * factor;
  }

  /**
   * Reset all accumulators to zero.
   * Called on simulation reset, scenario change, or building switch.
   */
  function reset() {
    totalEnergy_kBTU = 0;
    electricEnergy_kWh = 0;
    steamEnergy_kBTU = 0;
    ghgEmissions_mtCO2e = 0;
  }

  /**
   * Get current accumulator values.
   * @returns {Object} { totalEnergy_kBTU, electricEnergy_kWh, steamEnergy_kBTU, ghgEmissions_mtCO2e }
   */
  function getValues() {
    return {
      totalEnergy_kBTU: totalEnergy_kBTU,
      electricEnergy_kWh: electricEnergy_kWh,
      steamEnergy_kBTU: steamEnergy_kBTU,
      ghgEmissions_mtCO2e: ghgEmissions_mtCO2e
    };
  }

  /**
   * Check LL97 compliance status for the active building, for both the
   * 2024-2029 and 2030-2034 compliance periods, including penalty exposure.
   *
   * Compares accumulated GHG emissions against each period's limit
   * (weighted carbon intensity × floor area).
   *
   * @returns {Object} {
   *   buildingId, buildingName,
   *   compliant, currentIntensity_kgCO2PerSqft, limit_kgCO2PerSqft,
   *   annualProjected_mtCO2e, annualLimit_mtCO2e, grossFloorArea_sqft,
   *   percentOfLimit, penaltyExposure2024_usd,
   *   compliant2030, limit2030_kgCO2PerSqft, annualLimit2030_mtCO2e,
   *   percentOfLimit2030, penaltyExposure2030_usd
   * }
   */
  function getComplianceStatus() {
    var constants = getActiveBuildingProfile();
    var grossFloorArea = (constants && constants.grossFloorArea_sqft) || 0;
    var buildingName = (constants && constants.propertyName) || 'Unknown Building';

    // Convert accumulated mtCO2e to kgCO2e, then to intensity
    var accumulated_kgCO2e = ghgEmissions_mtCO2e * MT_TO_KG;
    var currentIntensity = grossFloorArea > 0
      ? accumulated_kgCO2e / grossFloorArea
      : 0;

    var limit2024 = computeWeightedLimit(constants, '2024');
    var limit2030 = computeWeightedLimit(constants, '2030');

    var annualLimit_mtCO2e = (limit2024 * grossFloorArea) / MT_TO_KG;
    var annualLimit2030_mtCO2e = (limit2030 * grossFloorArea) / MT_TO_KG;

    // Projected annual GHG based on current accumulation rate
    var annualProjected = constants && constants.annualGHG_mtCO2e
      ? constants.annualGHG_mtCO2e
      : ghgEmissions_mtCO2e; // fallback to accumulated if no constants

    var percentOfLimit = annualLimit_mtCO2e > 0
      ? (ghgEmissions_mtCO2e / annualLimit_mtCO2e) * 100
      : 0;
    var percentOfLimit2030 = annualLimit2030_mtCO2e > 0
      ? (ghgEmissions_mtCO2e / annualLimit2030_mtCO2e) * 100
      : 0;

    // Penalty exposure: projected annual excess × $268/tCO2e, using the
    // building's actual annual reported/projected GHG (not just whatever
    // has accumulated so far this session) — this is what a real LL97
    // report would compare against each limit.
    var projectedExcess2024_mtCO2e = Math.max(0, annualProjected - annualLimit_mtCO2e);
    var projectedExcess2030_mtCO2e = Math.max(0, annualProjected - annualLimit2030_mtCO2e);
    var penaltyExposure2024_usd = projectedExcess2024_mtCO2e * PENALTY_RATE_PER_MTCO2E;
    var penaltyExposure2030_usd = projectedExcess2030_mtCO2e * PENALTY_RATE_PER_MTCO2E;

    return {
      buildingId: activeBuildingId,
      buildingName: buildingName,

      // 2024-2029 period. "compliant" reflects whether the building's full
      // ANNUAL projected GHG is within the limit (same basis as
      // penaltyExposure) — not whether the GHG accumulated so far in a
      // live, partway-through-the-year simulation happens to be under a
      // full-year limit, which would be trivially true almost always.
      // percentOfLimit is the separate, live "how much of this year's
      // carbon budget has the simulation used so far" progress indicator.
      compliant: annualProjected <= annualLimit_mtCO2e,
      currentIntensity_kgCO2PerSqft: currentIntensity,
      limit_kgCO2PerSqft: limit2024,
      annualProjected_mtCO2e: annualProjected,
      annualLimit_mtCO2e: annualLimit_mtCO2e,
      grossFloorArea_sqft: grossFloorArea,
      percentOfLimit: percentOfLimit,
      penaltyExposure2024_usd: penaltyExposure2024_usd,

      // 2030-2034 period
      compliant2030: annualProjected <= annualLimit2030_mtCO2e,
      limit2030_kgCO2PerSqft: limit2030,
      annualLimit2030_mtCO2e: annualLimit2030_mtCO2e,
      percentOfLimit2030: percentOfLimit2030,
      penaltyExposure2030_usd: penaltyExposure2030_usd
    };
  }

  // ─── Expose as window global ────────────────────────────────────────────────

  window.LL97Accumulator = {
    // State accessors (via getters for live values)
    get totalEnergy_kBTU() { return totalEnergy_kBTU; },
    get electricEnergy_kWh() { return electricEnergy_kWh; },
    get steamEnergy_kBTU() { return steamEnergy_kBTU; },
    get ghgEmissions_mtCO2e() { return ghgEmissions_mtCO2e; },

    // Methods
    tick: tick,
    reset: reset,
    getValues: getValues,
    getComplianceStatus: getComplianceStatus,
    setActiveBuilding: setActiveBuilding,
    getActiveBuildingId: getActiveBuildingId,
    getAvailableBuildings: getAvailableBuildings,

    // Constants (exposed for testing / display)
    HOURS_PER_YEAR: HOURS_PER_YEAR,
    HOTEL_LIMIT_2024_KGCO2_PER_SQFT: HOTEL_LIMIT_2024_KGCO2_PER_SQFT,
    HOTEL_LIMIT_2030_KGCO2_PER_SQFT: HOTEL_LIMIT_2030_KGCO2_PER_SQFT,
    MULTIFAMILY_LIMIT_2024_KGCO2_PER_SQFT: MULTIFAMILY_LIMIT_2024_KGCO2_PER_SQFT,
    MULTIFAMILY_LIMIT_2030_KGCO2_PER_SQFT: MULTIFAMILY_LIMIT_2030_KGCO2_PER_SQFT,
    PENALTY_RATE_PER_MTCO2E: PENALTY_RATE_PER_MTCO2E,

    // Testing helpers
    _getSeasonalFactor: getSeasonalFactor,
    _computeWeightedLimit: computeWeightedLimit
  };
})();
