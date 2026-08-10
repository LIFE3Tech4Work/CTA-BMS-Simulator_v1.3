/**
 * BuildingArchetypes.js — synthetic comparison buildings for the WBL
 * "candidate building" selection exercise.
 *
 * From the CTA BMS Work-Based Learning Project Guide, Step 1 (Identify
 * Candidate Buildings): teams compare multiple real candidate buildings
 * (~76 Manhattan Multifamily Housing/Hotel properties, via NYC Open Data in
 * Excel — Sessions 1-3) and pick the strongest improvement opportunity.
 * That real, live-data comparison stays in Excel (recommended, not
 * duplicated here — see the BMS Simulator continuity brief's WBL mapping).
 * These archetypes give the *BMS simulator itself* a small, locally-
 * generated set of case-study candidates so the same "compare and select"
 * exercise can happen inside the app, without needing NYC Open Data access
 * wired into the simulator.
 *
 * Each archetype is DERIVED from the one real, LL84-verified building
 * (ll84_constants.js — actual NYC LL84 disclosure data, property ID
 * 6046134) via documented, transparent scaling rules — not randomly
 * generated. Every number traces back to a stated rule against that real
 * baseline, so these are honestly synthetic ("plausible, archetype-
 * consistent variants") rather than claimed-real data for buildings that
 * don't exist. isSynthetic: true is set on every entry so the UI can label
 * them clearly.
 *
 * Derivation methodology (same for all three):
 *  1. Pick a floor area and a Hotel/Multifamily Housing split plausible for
 *     a Manhattan mixed-use property (matching the WBL guide's Step 1
 *     criteria).
 *  2. Scale Site EUI from the real anchor building's 82.4 kBtu/sf by a
 *     stated factor representing the archetype's character (e.g., "deep
 *     retrofit" = far below baseline; "aging, no retrofit" = above
 *     baseline; hotels generally run hotter EUI than multifamily due to
 *     24/7 operations, laundry, and kitchens).
 *  3. annualSiteEnergy_kBTU = scaled EUI × floor area.
 *  4. Electric/steam split uses the SAME proportions as the real anchor
 *     building's actual reported energy mix (~54.2% steam-equivalent /
 *     45.8% electric-equivalent of site energy) — i.e., same general fuel
 *     mix, only total volume changes. (This ignores the anchor's small
 *     natural gas component as a simplification.)
 *  5. annualGHG_mtCO2e scales proportionally to annualSiteEnergy_kBTU,
 *     using the anchor's real GHG-per-kBTU intensity — i.e., assumes the
 *     same carbon intensity per unit energy as the real building's actual
 *     fuel mix.
 *
 * LL97 weighted limits are NOT precomputed here — LL97Accumulator.js
 * computes them live from hotelFloorArea_sqft/multifamilyFloorArea_sqft
 * using verified per-occupancy-group rates, so there's one source of truth
 * for the limit math (see LL97Accumulator.js for the verified rates and
 * source notes, including the one still-open discrepancy on the Hotel
 * rate).
 *
 * Uses ES module export, matching its siblings ll84_constants.js and
 * peer_benchmarks.js in this folder — bridged to window.BuildingArchetypes
 * via the <script type="module"> block in index.html, same pattern as
 * LL84_CONSTANTS.
 */

const HOURS_PER_YEAR = 8760;
const KBTU_PER_KWH = 3.412;

// Derived from the real anchor building's actual reported 2023 values
// (ll84_constants.js): steam fraction ≈ 31,986,006.8 / 58,970,482.7
const ANCHOR_STEAM_FRACTION = 0.5424;
const ANCHOR_ELECTRIC_FRACTION = 1 - ANCHOR_STEAM_FRACTION;
// GHG intensity per unit site energy ≈ 5,038.5 / 58,970,482.7
const ANCHOR_GHG_PER_KBTU = 0.00008544;

/**
 * Build a complete archetype profile from a small set of headline inputs,
 * deriving the rest via the documented methodology above. Keeping this as
 * a function (rather than hand-computed literals) means every number is
 * auditable from its formula, not just from a comment.
 */
function buildArchetype(opts) {
  const annualSiteEnergy_kBTU = opts.siteEUI_kBtuPerSqft * opts.grossFloorArea_sqft;
  const annualSteam_kBTU = annualSiteEnergy_kBTU * ANCHOR_STEAM_FRACTION;
  const annualElectric_kWh = (annualSiteEnergy_kBTU * ANCHOR_ELECTRIC_FRACTION) / KBTU_PER_KWH;
  const annualGHG_mtCO2e = annualSiteEnergy_kBTU * ANCHOR_GHG_PER_KBTU;

  return {
    id: opts.id,
    propertyName: opts.propertyName,
    archetypeDescription: opts.archetypeDescription,
    isSynthetic: true,
    primaryType: 'Multifamily Housing',
    secondaryType: 'Hotel',
    grossFloorArea_sqft: opts.grossFloorArea_sqft,
    hotelFloorArea_sqft: opts.hotelFloorArea_sqft,
    multifamilyFloorArea_sqft: opts.multifamilyFloorArea_sqft,
    siteEUI2023_kBtuPerSqft: opts.siteEUI_kBtuPerSqft,
    energyStarScore2023: opts.energyStarScore,
    annualSiteEnergy_kBTU: annualSiteEnergy_kBTU,
    annualSteam_kBTU: annualSteam_kBTU,
    annualElectric_kWh: annualElectric_kWh,
    annualGHG_mtCO2e: annualGHG_mtCO2e,
    hourlyElectric_kWh: annualElectric_kWh / HOURS_PER_YEAR,
    hourlySiteEnergy_kBTU: annualSiteEnergy_kBTU / HOURS_PER_YEAR,
    hourlySteam_kBTU: annualSteam_kBTU / HOURS_PER_YEAR,
    hourlyGHG_mtCO2e: annualGHG_mtCO2e / HOURS_PER_YEAR
  };
}

export const BuildingArchetypes = {
  'riverside-tower': buildArchetype({
    id: 'riverside-tower',
    propertyName: 'Riverside Tower (Synthetic — High-Performing Renovated Mixed-Use)',
    archetypeDescription: 'Deep-retrofit comparable: Site EUI scaled to 45% of the anchor building, same Hotel/Multifamily floor-area proportion. Represents what a comparable building looks like after major electrification and envelope work — intended to be achievable even under the stricter 2030 limit.',
    grossFloorArea_sqft: 620000,
    hotelFloorArea_sqft: 204228,
    multifamilyFloorArea_sqft: 415772,
    siteEUI_kBtuPerSqft: 37.1, // 82.4 * 0.45
    energyStarScore: 91
  }),
  'brookline-court': buildArchetype({
    id: 'brookline-court',
    propertyName: 'Brookline Court (Synthetic — Aging Multifamily-Dominant)',
    archetypeDescription: 'No-retrofit comparable: Site EUI scaled to 135% of the anchor building, mostly Multifamily Housing (88%) with a small ground-floor hotel/extended-stay component (12%). Represents an older building with no recent capital improvements — already non-compliant under the 2024 limit, not just 2030.',
    grossFloorArea_sqft: 480000,
    hotelFloorArea_sqft: 57600,
    multifamilyFloorArea_sqft: 422400,
    siteEUI_kBtuPerSqft: 111.2, // 82.4 * 1.35
    energyStarScore: 9
  }),
  'garrison-house': buildArchetype({
    id: 'garrison-house',
    propertyName: 'Garrison House (Synthetic — Boutique Hotel-Dominant)',
    archetypeDescription: 'Site EUI scaled to 115% of the anchor building (hotels typically run hotter EUI than multifamily: 24/7 operations, laundry, kitchens), mostly Hotel (75%) with some Multifamily (25%). Represents a smaller, hospitality-focused comparable, compliant today but facing a 2030 gap.',
    grossFloorArea_sqft: 340000,
    hotelFloorArea_sqft: 255000,
    multifamilyFloorArea_sqft: 85000,
    siteEUI_kBtuPerSqft: 94.8, // 82.4 * 1.15
    energyStarScore: 38
  })
};
