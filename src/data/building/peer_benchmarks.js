/**
 * Peer Cohort Benchmarks for LL97 Compliance Comparison
 * 
 * Four archetype building profiles representing comparable NYC properties.
 * Each profile includes actual/estimated carbon intensity and LL97 compliance limits.
 * 
 * LL97 carbon intensity limits are per building use type per compliance period:
 *   - 2024-2029: First compliance period limits
 *   - 2030-2034: Second compliance period limits (more stringent)
 * 
 * Carbon intensity is expressed in kgCO2e/ft² (same as LL84 GHG intensity reporting).
 * The Four Seasons Hotel NYC Downtown reported 7.0 kgCO2e/ft² in both 2022 and 2023.
 */

export const PeerBenchmarks = [
  {
    name: 'Luxury Hotel NYC (Peer A)',
    type: 'Full-Service Hotel',
    category: 'Hotel',
    grossFloorArea_sqft: 680000,
    carbonIntensity_kgCO2ePerSqft: 8.07,
    siteEUI_kBtuPerSqft: 96.2,
    ll97Limit2024_kgCO2ePerSqft: 9.20,
    ll97Limit2030_kgCO2ePerSqft: 4.30,
    complianceStatus2024: 'compliant',
    complianceStatus2030: 'non-compliant',
    notes: 'Similar luxury hotel with steam + electric, slightly older mechanical systems',
  },
  {
    name: 'Mixed-Use Tower (Peer B)',
    type: 'Mixed Residential/Commercial',
    category: 'Mixed-Use',
    grossFloorArea_sqft: 520000,
    carbonIntensity_kgCO2ePerSqft: 6.23,
    siteEUI_kBtuPerSqft: 78.5,
    ll97Limit2024_kgCO2ePerSqft: 8.46,
    ll97Limit2030_kgCO2ePerSqft: 4.07,
    complianceStatus2024: 'compliant',
    complianceStatus2030: 'non-compliant',
    notes: 'Residential tower with ground-floor retail; newer construction with partial electrification',
  },
  {
    name: 'Class A Office (Peer C)',
    type: 'Class A Office',
    category: 'Office',
    grossFloorArea_sqft: 450000,
    carbonIntensity_kgCO2ePerSqft: 9.53,
    siteEUI_kBtuPerSqft: 112.8,
    ll97Limit2024_kgCO2ePerSqft: 8.46,
    ll97Limit2030_kgCO2ePerSqft: 4.53,
    complianceStatus2024: 'non-compliant',
    complianceStatus2030: 'non-compliant',
    notes: 'Pre-war office building with steam heating; faces immediate LL97 penalties',
  },
  {
    name: 'Residential High-Rise (Peer D)',
    type: 'Multifamily Residential',
    category: 'Residential',
    grossFloorArea_sqft: 390000,
    carbonIntensity_kgCO2ePerSqft: 4.86,
    siteEUI_kBtuPerSqft: 62.3,
    ll97Limit2024_kgCO2ePerSqft: 6.75,
    ll97Limit2030_kgCO2ePerSqft: 3.35,
    complianceStatus2024: 'compliant',
    complianceStatus2030: 'non-compliant',
    notes: 'Modern residential tower with gas boilers; will require decarbonization by 2030',
  },
];

/**
 * LL97 penalty rate: $268 per metric ton CO2e over the limit (2024 period).
 * Buildings exceeding their carbon limit face annual fines.
 */
export const LL97_PENALTY_RATE_PER_MTCO2E = 268;

/**
 * Four Seasons Hotel NYC Downtown LL97 context.
 * The building's mixed-use profile means its limit is a weighted average
 * of the Hotel and Multifamily limits based on floor area proportions.
 */
export const FourSeasonsLL97 = {
  carbonIntensity_kgCO2ePerSqft: 7.0,
  // Weighted limit based on use-type floor areas:
  // Hotel: 235,532 ft² | Multifamily: 479,788 ft²
  hotelFloorArea_sqft: 235532,
  multifamilyFloorArea_sqft: 479788,
  ll97Limit2024_kgCO2ePerSqft: 7.58, // weighted: (9.20*235532 + 6.75*479788) / 715320
  ll97Limit2030_kgCO2ePerSqft: 3.66, // weighted: (4.30*235532 + 3.35*479788) / 715320
  complianceStatus2024: 'compliant',
  complianceStatus2030: 'non-compliant',
};
