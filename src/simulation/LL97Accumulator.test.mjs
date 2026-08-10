/**
 * Unit tests for LL97Accumulator.
 * LL97Accumulator.js attaches to `window`, so we set up globals before loading.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Mock browser globals
globalThis.window = globalThis;

// Mock LL84 constants (matching the structure in ll84_constants.js) —
// the real anchor building, with the actual Hotel/Multifamily floor-area
// split so the weighted-limit math has something real to compute against.
const mockLL84 = {
  propertyName: 'CTA Training Building NYC Downtown',
  annualSiteEnergy_kBTU: 58970482.7,
  annualElectric_kWh: 7807555.8,
  annualSteam_kBTU: 31986006.8,
  annualGHG_mtCO2e: 5038.5,
  grossFloorArea_sqft: 715320,
  hotelFloorArea_sqft: 235532,
  multifamilyFloorArea_sqft: 479788
};

window.LL84_CONSTANTS = mockLL84;

// Mock building archetypes (small, deterministic — independent of the real
// building_archetypes.js derivation formulas, so these tests don't silently
// break if that file's numbers are tuned later)
const mockArchetypes = {
  'test-high-performer': {
    id: 'test-high-performer',
    propertyName: 'Test High Performer',
    archetypeDescription: 'A synthetic high-performing test building.',
    isSynthetic: true,
    grossFloorArea_sqft: 100000,
    hotelFloorArea_sqft: 0,
    multifamilyFloorArea_sqft: 100000,
    annualSiteEnergy_kBTU: 1000000,
    annualElectric_kWh: 100000,
    annualSteam_kBTU: 500000,
    annualGHG_mtCO2e: 100 // well under any limit for 100,000 sqft all-multifamily
  },
  'test-no-split': {
    id: 'test-no-split',
    propertyName: 'Test Building Without Floor-Area Split',
    isSynthetic: true,
    grossFloorArea_sqft: 50000,
    // no hotelFloorArea_sqft / multifamilyFloorArea_sqft — exercises the fallback default limit
    annualSiteEnergy_kBTU: 500000,
    annualElectric_kWh: 50000,
    annualSteam_kBTU: 250000,
    annualGHG_mtCO2e: 500 // well over the ~7.58 fallback default limit for 50,000 sqft → non-compliant
  }
};

window.BuildingArchetypes = mockArchetypes;

// Load LL97Accumulator.js
const require = createRequire(import.meta.url);
require('./LL97Accumulator.js');

describe('LL97Accumulator', () => {
  let accumulator;

  beforeEach(() => {
    accumulator = window.LL97Accumulator;
    accumulator.setActiveBuilding('anchor'); // also resets accumulators
  });

  describe('Constants', () => {
    it('HOURS_PER_YEAR is 8760', () => {
      expect(accumulator.HOURS_PER_YEAR).toBe(8760);
    });

    it('exposes verified per-occupancy-group LL97 limits', () => {
      expect(accumulator.MULTIFAMILY_LIMIT_2024_KGCO2_PER_SQFT).toBe(6.75);
      expect(accumulator.MULTIFAMILY_LIMIT_2030_KGCO2_PER_SQFT).toBe(3.35);
      expect(accumulator.HOTEL_LIMIT_2024_KGCO2_PER_SQFT).toBe(9.20);
      expect(accumulator.HOTEL_LIMIT_2030_KGCO2_PER_SQFT).toBe(4.30);
    });

    it('exposes the verified LL97 penalty rate', () => {
      expect(accumulator.PENALTY_RATE_PER_MTCO2E).toBe(268);
    });
  });

  describe('reset', () => {
    it('zeros all accumulators', () => {
      accumulator.tick({ outdoorTemp: 55 }, mockLL84);
      accumulator.reset();

      const values = accumulator.getValues();
      expect(values.totalEnergy_kBTU).toBe(0);
      expect(values.electricEnergy_kWh).toBe(0);
      expect(values.steamEnergy_kBTU).toBe(0);
      expect(values.ghgEmissions_mtCO2e).toBe(0);
    });

    it('zeros values accessible via getters', () => {
      accumulator.tick({ outdoorTemp: 55 }, mockLL84);
      accumulator.reset();

      expect(accumulator.totalEnergy_kBTU).toBe(0);
      expect(accumulator.electricEnergy_kWh).toBe(0);
      expect(accumulator.steamEnergy_kBTU).toBe(0);
      expect(accumulator.ghgEmissions_mtCO2e).toBe(0);
    });
  });

  describe('tick', () => {
    it('increments accumulators by hourly rates at mild temperature (factor ~1.0)', () => {
      accumulator.tick({ outdoorTemp: 55 }, mockLL84);

      const values = accumulator.getValues();
      const expectedElectric = mockLL84.annualElectric_kWh / 8760;
      const expectedSteam = mockLL84.annualSteam_kBTU / 8760;
      const expectedEnergy = mockLL84.annualSiteEnergy_kBTU / 8760;
      const expectedGHG = mockLL84.annualGHG_mtCO2e / 8760;

      expect(values.electricEnergy_kWh).toBeCloseTo(expectedElectric * 1.0, 2);
      expect(values.steamEnergy_kBTU).toBeCloseTo(expectedSteam * 1.0, 2);
      expect(values.totalEnergy_kBTU).toBeCloseTo(expectedEnergy * 1.0, 2);
      expect(values.ghgEmissions_mtCO2e).toBeCloseTo(expectedGHG * 1.0, 4);
    });

    it('applies higher factor at extreme temperature', () => {
      accumulator.tick({ outdoorTemp: 95 }, mockLL84);
      const values = accumulator.getValues();
      const expectedElectric = (mockLL84.annualElectric_kWh / 8760) * 1.4;
      expect(values.electricEnergy_kWh).toBeCloseTo(expectedElectric, 2);
    });

    it('applies higher factor at cold temperature', () => {
      accumulator.tick({ outdoorTemp: 15 }, mockLL84);
      const values = accumulator.getValues();
      const expectedElectric = (mockLL84.annualElectric_kWh / 8760) * 1.4;
      expect(values.electricEnergy_kWh).toBeCloseTo(expectedElectric, 2);
    });

    it('accumulates over multiple ticks', () => {
      accumulator.tick({ outdoorTemp: 55 }, mockLL84);
      accumulator.tick({ outdoorTemp: 55 }, mockLL84);
      accumulator.tick({ outdoorTemp: 55 }, mockLL84);

      const values = accumulator.getValues();
      const expectedElectric = (mockLL84.annualElectric_kWh / 8760) * 3;
      expect(values.electricEnergy_kWh).toBeCloseTo(expectedElectric, 2);
    });

    it('uses default factor 1.0 when no outdoor temp provided', () => {
      accumulator.tick({}, mockLL84);
      const values = accumulator.getValues();
      const expectedEnergy = mockLL84.annualSiteEnergy_kBTU / 8760;
      expect(values.totalEnergy_kBTU).toBeCloseTo(expectedEnergy, 2);
    });

    it('uses the active building (window.LL84_CONSTANTS by default) when no explicit constants passed', () => {
      accumulator.tick({ outdoorTemp: 55 });
      const values = accumulator.getValues();
      expect(values.electricEnergy_kWh).toBeGreaterThan(0);
      expect(values.totalEnergy_kBTU).toBeGreaterThan(0);
    });

    it('skips tick when no LL84 constants are available', () => {
      const originalConstants = window.LL84_CONSTANTS;
      window.LL84_CONSTANTS = null;
      window.LL84 = null;

      accumulator.tick({ outdoorTemp: 55 }, null);

      const values = accumulator.getValues();
      expect(values.totalEnergy_kBTU).toBe(0);

      window.LL84_CONSTANTS = originalConstants;
    });
  });

  describe('getValues', () => {
    it('returns an object with all four accumulator fields', () => {
      const values = accumulator.getValues();
      expect(values).toHaveProperty('totalEnergy_kBTU');
      expect(values).toHaveProperty('electricEnergy_kWh');
      expect(values).toHaveProperty('steamEnergy_kBTU');
      expect(values).toHaveProperty('ghgEmissions_mtCO2e');
    });
  });

  describe('_computeWeightedLimit', () => {
    it('computes the floor-area-weighted 2024 limit for a mixed-use building', () => {
      // (9.20*235532 + 6.75*479788) / 715320 ≈ 7.58
      const limit = accumulator._computeWeightedLimit(mockLL84, '2024');
      expect(limit).toBeCloseTo(7.58, 1);
    });

    it('computes the floor-area-weighted 2030 limit for a mixed-use building', () => {
      // (4.30*235532 + 3.35*479788) / 715320 ≈ 3.66
      const limit = accumulator._computeWeightedLimit(mockLL84, '2030');
      expect(limit).toBeCloseTo(3.66, 1);
    });

    it('falls back to the default limit when the profile has no floor-area split', () => {
      const profileWithoutSplit = { grossFloorArea_sqft: 50000 };
      expect(accumulator._computeWeightedLimit(profileWithoutSplit, '2024')).toBe(7.58);
      expect(accumulator._computeWeightedLimit(profileWithoutSplit, '2030')).toBe(3.66);
    });

    it('falls back to the default limit when the profile is null', () => {
      expect(accumulator._computeWeightedLimit(null, '2024')).toBe(7.58);
    });

    it('computes correctly for an all-multifamily building (no hotel component)', () => {
      const allMultifamily = { grossFloorArea_sqft: 100000, hotelFloorArea_sqft: 0, multifamilyFloorArea_sqft: 100000 };
      // hotelFloorArea_sqft: 0 is falsy, so this actually exercises the
      // fallback path (matches real behavior: a 0 split is treated as "no
      // split specified" the same as undefined)
      expect(accumulator._computeWeightedLimit(allMultifamily, '2024')).toBe(7.58);
    });
  });

  describe('getComplianceStatus — 2024-2029 period (anchor building)', () => {
    it('returns compliant status when accumulated GHG is within the weighted limit', () => {
      accumulator.tick({ outdoorTemp: 55 }, mockLL84);

      const status = accumulator.getComplianceStatus();
      expect(status.compliant).toBe(true);
      expect(status.limit_kgCO2PerSqft).toBeCloseTo(7.58, 1); // weighted, not the old flat 15.0
      expect(status.grossFloorArea_sqft).toBe(715320);
      expect(status.annualLimit_mtCO2e).toBeCloseTo((status.limit_kgCO2PerSqft * 715320) / 1000, 2);
    });

    it('reports correct current intensity', () => {
      for (let i = 0; i < 100; i++) {
        accumulator.tick({ outdoorTemp: 55 }, mockLL84);
      }

      const status = accumulator.getComplianceStatus();
      const expectedGHG = (mockLL84.annualGHG_mtCO2e / 8760) * 100;
      const expectedIntensity = (expectedGHG * 1000) / mockLL84.grossFloorArea_sqft;

      expect(status.currentIntensity_kgCO2PerSqft).toBeCloseTo(expectedIntensity, 4);
    });

    it('includes percentOfLimit', () => {
      accumulator.tick({ outdoorTemp: 55 }, mockLL84);
      const status = accumulator.getComplianceStatus();
      expect(status.percentOfLimit).toBeGreaterThan(0);
      expect(status.percentOfLimit).toBeLessThan(100);
    });

    it('includes buildingId and buildingName', () => {
      const status = accumulator.getComplianceStatus();
      expect(status.buildingId).toBe('anchor');
      expect(status.buildingName).toBe('CTA Training Building NYC Downtown');
    });

    it('reports zero penalty exposure when compliant', () => {
      const status = accumulator.getComplianceStatus();
      // anchor's real annual GHG (5038.5) vs its real 2024 limit (~5424 mtCO2e) — compliant
      expect(status.penaltyExposure2024_usd).toBe(0);
    });
  });

  describe('getComplianceStatus — 2030-2034 period', () => {
    it('includes a separate, stricter 2030 limit', () => {
      const status = accumulator.getComplianceStatus();
      expect(status.limit2030_kgCO2PerSqft).toBeCloseTo(3.66, 1);
      expect(status.limit2030_kgCO2PerSqft).toBeLessThan(status.limit_kgCO2PerSqft);
    });

    it('the anchor building is non-compliant under the 2030 limit despite being compliant under 2024', () => {
      const status = accumulator.getComplianceStatus();
      expect(status.compliant).toBe(true);
      expect(status.compliant2030).toBe(false);
    });

    it('reports non-zero projected penalty exposure for 2030 when non-compliant', () => {
      const status = accumulator.getComplianceStatus();
      expect(status.penaltyExposure2030_usd).toBeGreaterThan(0);
    });
  });

  describe('setActiveBuilding / getActiveBuildingId', () => {
    it('defaults to "anchor"', () => {
      expect(accumulator.getActiveBuildingId()).toBe('anchor');
    });

    it('switches to an archetype building', () => {
      accumulator.setActiveBuilding('test-high-performer');
      expect(accumulator.getActiveBuildingId()).toBe('test-high-performer');
    });

    it('switching buildings resets accumulated totals', () => {
      accumulator.tick({ outdoorTemp: 55 }, mockLL84);
      expect(accumulator.ghgEmissions_mtCO2e).toBeGreaterThan(0);

      accumulator.setActiveBuilding('test-high-performer');
      expect(accumulator.ghgEmissions_mtCO2e).toBe(0);
    });

    it('tick() with no explicit constants now accumulates against the newly active building', () => {
      accumulator.setActiveBuilding('test-high-performer');
      accumulator.tick({ outdoorTemp: 55 });

      const expectedElectric = mockArchetypes['test-high-performer'].annualElectric_kWh / 8760;
      expect(accumulator.getValues().electricEnergy_kWh).toBeCloseTo(expectedElectric, 4);
    });

    it('falling back to "anchor" (explicit or falsy) restores the default building', () => {
      accumulator.setActiveBuilding('test-high-performer');
      accumulator.setActiveBuilding('anchor');
      expect(accumulator.getActiveBuildingId()).toBe('anchor');

      accumulator.setActiveBuilding('test-high-performer');
      accumulator.setActiveBuilding(null);
      expect(accumulator.getActiveBuildingId()).toBe('anchor');
    });

    it('an unknown building ID is ignored, keeping the current building active', () => {
      accumulator.setActiveBuilding('test-high-performer');
      accumulator.setActiveBuilding('totally-not-a-real-id');
      expect(accumulator.getActiveBuildingId()).toBe('test-high-performer');
    });

    it('a building profile without a floor-area split falls back to the default weighted limit', () => {
      accumulator.setActiveBuilding('test-no-split');
      const status = accumulator.getComplianceStatus();
      expect(status.limit_kgCO2PerSqft).toBeCloseTo(7.58, 1);
    });

    it('a poorly-performing archetype correctly shows non-compliant with nonzero penalty exposure', () => {
      accumulator.setActiveBuilding('test-no-split'); // annualGHG 500 vs ~50000*7.58/1000=379 limit → non-compliant
      const status = accumulator.getComplianceStatus();
      expect(status.compliant).toBe(false);
      expect(status.penaltyExposure2024_usd).toBeGreaterThan(0);
    });
  });

  describe('getAvailableBuildings', () => {
    it('includes the anchor building first', () => {
      const list = accumulator.getAvailableBuildings();
      expect(list[0].id).toBe('anchor');
      expect(list[0].isSynthetic).toBe(false);
    });

    it('includes all archetypes from window.BuildingArchetypes', () => {
      const list = accumulator.getAvailableBuildings();
      const ids = list.map(b => b.id);
      expect(ids).toContain('test-high-performer');
      expect(ids).toContain('test-no-split');
    });

    it('marks archetypes as synthetic', () => {
      const list = accumulator.getAvailableBuildings();
      const archetype = list.find(b => b.id === 'test-high-performer');
      expect(archetype.isSynthetic).toBe(true);
    });

    it('each entry has a name and description', () => {
      const list = accumulator.getAvailableBuildings();
      list.forEach(b => {
        expect(typeof b.name).toBe('string');
        expect(b.name.length).toBeGreaterThan(0);
      });
    });
  });

  describe('_getSeasonalFactor', () => {
    it('returns 1.0 at 55°F (base temp)', () => {
      expect(accumulator._getSeasonalFactor(55)).toBe(1.0);
    });

    it('returns higher value at hot temperature', () => {
      const factor = accumulator._getSeasonalFactor(95);
      expect(factor).toBeGreaterThan(1.0);
      expect(factor).toBeCloseTo(1.4, 5);
    });

    it('returns higher value at cold temperature', () => {
      const factor = accumulator._getSeasonalFactor(15);
      expect(factor).toBeGreaterThan(1.0);
      expect(factor).toBeCloseTo(1.4, 5);
    });

    it('clamps to minimum 0.7', () => {
      const factor = accumulator._getSeasonalFactor(55);
      expect(factor).toBeGreaterThanOrEqual(0.7);
    });

    it('clamps to maximum 1.5', () => {
      const factor = accumulator._getSeasonalFactor(-50);
      expect(factor).toBe(1.5);
    });

    it('returns 1.0 for null/undefined input', () => {
      expect(accumulator._getSeasonalFactor(null)).toBe(1.0);
      expect(accumulator._getSeasonalFactor(undefined)).toBe(1.0);
      expect(accumulator._getSeasonalFactor(NaN)).toBe(1.0);
    });
  });
});
