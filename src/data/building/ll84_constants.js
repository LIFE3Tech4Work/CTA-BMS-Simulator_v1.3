/**
 * LL84 Building Constants — Four Seasons Hotel NYC Downtown
 * 
 * Extracted from: LL84 Data Four Seasons Hotel NYC Downtown (1).xlsx
 * Property ID: 6046134
 * Address: 27 Barclay St, New York, NY 10007
 * BBL: 1-00123-7502 | BIN: 1089428
 * Primary Type: Multifamily Housing / Hotel (mixed-use)
 * Year Built: 2016
 * 
 * Primary values use the most recent reporting year (2023).
 * Year-over-year data preserves both 2022 and 2023 for trend analysis.
 */

export const LL84 = {
  // --- Primary annual constants (2023 reporting year) ---
  annualSiteEnergy_kBTU: 58970482.7,
  annualElectric_kWh: 7807555.8,
  annualSteam_kBTU: 31986006.8,
  annualGHG_mtCO2e: 5038.5,
  grossFloorArea_sqft: 715320,

  // --- Building metadata ---
  propertyName: 'CTA Training Building NYC Downtown',
  propertyId: 6046134,
  address: '27 Barclay St, New York, NY 10007',
  bbl: '1-00123-7502',
  bin: 1089428,
  yearBuilt: 2016,
  primaryType: 'Multifamily Housing',
  secondaryType: 'Hotel',
  energyStarScore2023: 34,
  siteEUI2023_kBtuPerSqft: 82.4,

  // --- Year-over-year data for trend analysis ---
  yearData: {
    2022: {
      siteEnergy_kBTU: 67305055.6,
      electric_kWh: 8807245.8,
      steam_kBTU: 34315241.6,
      naturalGas_kBTU: 2939487.5,
      ghg_mtCO2e: 4975.1,
      siteEUI_kBtuPerSqft: 94.1,
      sourceEUI_kBtuPerSqft: 179.7,
      energyStarScore: 16,
    },
    2023: {
      siteEnergy_kBTU: 58970482.7,
      electric_kWh: 7807555.8,
      steam_kBTU: 31986006.8,
      naturalGas_kBTU: 345092.3,
      ghg_mtCO2e: 5038.5,
      siteEUI_kBtuPerSqft: 82.4,
      sourceEUI_kBtuPerSqft: 158.6,
      energyStarScore: 34,
    },
  },

  // --- Derived hourly rates (for LL97 accumulator per-tick increments) ---
  // These are annualized values divided by 8,760 hours
  hourlyElectric_kWh: 7807555.8 / 8760,   // ~891.3 kWh/hr
  hourlySiteEnergy_kBTU: 58970482.7 / 8760, // ~6,732.4 kBTU/hr
  hourlySteam_kBTU: 31986006.8 / 8760,     // ~3,651.4 kBTU/hr
  hourlyGHG_mtCO2e: 5038.5 / 8760,         // ~0.575 mtCO2e/hr
};
