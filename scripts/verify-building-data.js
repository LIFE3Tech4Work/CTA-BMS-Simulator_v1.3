#!/usr/bin/env node
/**
 * Verify building data modules are valid and contain expected values.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Read and evaluate ll84_constants.js
const ll84Content = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'data', 'building', 'll84_constants.js'),
  'utf-8'
);

// Create a context to evaluate the module
const ctx = {};
vm.createContext(ctx);
// Strip export and run in sandbox
const ll84Code = ll84Content.replace(/^export /gm, '') + '\nLL84;';
const LL84 = vm.runInContext(ll84Code, ctx);

console.log('✅ ll84_constants.js is valid JavaScript');
console.log('   annualSiteEnergy_kBTU:', LL84.annualSiteEnergy_kBTU);
console.log('   annualElectric_kWh:', LL84.annualElectric_kWh);
console.log('   annualSteam_kBTU:', LL84.annualSteam_kBTU);
console.log('   annualGHG_mtCO2e:', LL84.annualGHG_mtCO2e);
console.log('   grossFloorArea_sqft:', LL84.grossFloorArea_sqft);
console.log('   yearData keys:', Object.keys(LL84.yearData));
console.log('   2022 siteEnergy:', LL84.yearData[2022].siteEnergy_kBTU);
console.log('   2023 siteEnergy:', LL84.yearData[2023].siteEnergy_kBTU);
console.log('   hourlyElectric_kWh:', LL84.hourlyElectric_kWh.toFixed(2));
console.log('   hourlyGHG_mtCO2e:', LL84.hourlyGHG_mtCO2e.toFixed(6));

// Read and evaluate peer_benchmarks.js
const peerContent = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'data', 'building', 'peer_benchmarks.js'),
  'utf-8'
);
const ctx2 = {};
vm.createContext(ctx2);
const peerCode = peerContent.replace(/^export /gm, '') + '\n({PeerBenchmarks, LL97_PENALTY_RATE_PER_MTCO2E, FourSeasonsLL97});';
const peerResult = vm.runInContext(peerCode, ctx2);
const { PeerBenchmarks, LL97_PENALTY_RATE_PER_MTCO2E, FourSeasonsLL97 } = peerResult;

console.log('\n✅ peer_benchmarks.js is valid JavaScript');
console.log('   Peer count:', PeerBenchmarks.length);
PeerBenchmarks.forEach(p => {
  console.log(`   - ${p.name} | type: ${p.type} | CI: ${p.carbonIntensity_kgCO2ePerSqft} | LL97-2024: ${p.ll97Limit2024_kgCO2ePerSqft}`);
});
console.log('   LL97 penalty rate:', LL97_PENALTY_RATE_PER_MTCO2E, '$/mtCO2e');
console.log('   Four Seasons LL97 limit 2024:', FourSeasonsLL97.ll97Limit2024_kgCO2ePerSqft);
console.log('   Four Seasons LL97 limit 2030:', FourSeasonsLL97.ll97Limit2030_kgCO2ePerSqft);
console.log('   Four Seasons compliance 2024:', FourSeasonsLL97.complianceStatus2024);
console.log('   Four Seasons compliance 2030:', FourSeasonsLL97.complianceStatus2030);

// Assertions
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERTION FAILED: ' + msg); };

assert(LL84.annualSiteEnergy_kBTU === 58970482.7, 'annualSiteEnergy mismatch');
assert(LL84.annualElectric_kWh === 7807555.8, 'annualElectric mismatch');
assert(LL84.annualSteam_kBTU === 31986006.8, 'annualSteam mismatch');
assert(LL84.annualGHG_mtCO2e === 5038.5, 'annualGHG mismatch');
assert(LL84.grossFloorArea_sqft === 715320, 'grossFloorArea mismatch');
assert(LL84.yearData[2022] && LL84.yearData[2023], 'yearData missing');
assert(PeerBenchmarks.length >= 4, 'Need at least 4 peer benchmarks');
assert(PeerBenchmarks.every(p => p.ll97Limit2024_kgCO2ePerSqft > 0), 'All peers need LL97 limits');

console.log('\n✅ All assertions passed!');
