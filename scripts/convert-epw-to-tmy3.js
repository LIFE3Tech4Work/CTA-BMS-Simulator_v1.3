/**
 * EPW → TMY3 JavaScript Array Converter
 * 
 * Reads the TMYx EPW file for New York Central Park Observatory (Belvedere Castle)
 * WMO 725053 and outputs a baked-in ES module with 8,760 hourly weather rows.
 * 
 * EPW data row columns (0-indexed):
 *   0: Year, 1: Month, 2: Day, 3: Hour, 4: Minute
 *   5: Uncertainty flags
 *   6: Dry Bulb Temperature (°C)
 *   7: Dew Point Temperature (°C)
 *   8: Relative Humidity (%)
 * 
 * Output fields per row:
 *   hour      — sequential 1–8760
 *   dryBulb   — °F (converted from °C)
 *   dewPoint  — °F (converted from °C)
 *   relHumidity — % (as-is)
 *   wetBulb   — °F (calculated from dry bulb + RH using Stull approximation)
 *   enthalpy  — BTU/lb (calculated from dry bulb and humidity ratio)
 */

const fs = require('fs');
const path = require('path');

// --- Conversion / Calculation Helpers ---

/** Convert Celsius to Fahrenheit */
function cToF(c) {
  return c * 9 / 5 + 32;
}

/**
 * Calculate wet bulb temperature using the Stull (2011) regression.
 * Roland Stull, "Wet-Bulb Temperature from Relative Humidity and Air Temperature"
 * Journal of Applied Meteorology and Climatology, 2011.
 * 
 * Input: T in °C, RH in %
 * Output: Wet bulb in °C
 */
function calcWetBulbC(T, RH) {
  const wb = T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659))
    + Math.atan(T + RH)
    - Math.atan(RH - 1.676331)
    + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH)
    - 4.686035;
  return wb;
}

/**
 * Calculate moist air enthalpy in BTU/lb (dry air basis).
 * 
 * Steps:
 * 1. Calculate saturation vapor pressure at dew point (Magnus formula)
 * 2. Humidity ratio W = 0.621945 * Pw / (Patm - Pw)
 * 3. Enthalpy h = 0.240 * T_F + W * (1061 + 0.444 * T_F)
 * 
 * Where Patm = 14.696 psi (sea level), pressures in psi.
 */
function calcEnthalpy(dryBulbC, dewPointC) {
  // Saturation vapor pressure at dew point (hPa) via Magnus formula
  const a = 17.625;
  const b = 243.04;
  const esDewHpa = 6.1094 * Math.exp((a * dewPointC) / (b + dewPointC));
  
  // Convert hPa to psi (1 hPa = 0.0145038 psi)
  const PwPsi = esDewHpa * 0.0145038;
  const PatmPsi = 14.696; // standard atmosphere
  
  // Humidity ratio (lb water / lb dry air)
  const W = 0.621945 * PwPsi / (PatmPsi - PwPsi);
  
  // Dry bulb in °F for enthalpy calc
  const TF = cToF(dryBulbC);
  
  // Moist air enthalpy (BTU/lb dry air)
  const h = 0.240 * TF + W * (1061 + 0.444 * TF);
  return h;
}

/** Round to n decimal places */
function round(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// --- Main conversion ---

const EPW_PATH = path.join(__dirname, '..', 'BMS TMY', 'USA_NY_New.York-Central.Park.Obs-Belvedere.Castle.725053_TMYx.2011-2025.epw');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'weather', 'tmy3_central_park.js');

console.log('Reading EPW file:', EPW_PATH);

const raw = fs.readFileSync(EPW_PATH, 'utf-8');
const lines = raw.split(/\r?\n/);

// EPW header is 8 lines; data starts at line index 8
const HEADER_LINES = 8;
const dataLines = lines.slice(HEADER_LINES).filter(line => line.trim().length > 0);

console.log(`Found ${dataLines.length} data rows (expected 8760)`);

if (dataLines.length !== 8760) {
  console.warn(`WARNING: Expected 8760 data rows, got ${dataLines.length}`);
}

const rows = [];

for (let i = 0; i < dataLines.length; i++) {
  const cols = dataLines[i].split(',');
  
  const dryBulbC = parseFloat(cols[6]);
  const dewPointC = parseFloat(cols[7]);
  const relHumidity = parseFloat(cols[8]);
  
  // Convert temps to °F
  const dryBulbF = cToF(dryBulbC);
  const dewPointF = cToF(dewPointC);
  
  // Calculate wet bulb (in °C first, then convert to °F)
  const wetBulbC = calcWetBulbC(dryBulbC, relHumidity);
  const wetBulbF = cToF(wetBulbC);
  
  // Calculate enthalpy (BTU/lb)
  const enthalpy = calcEnthalpy(dryBulbC, dewPointC);
  
  rows.push({
    hour: i + 1,
    dryBulb: round(dryBulbF, 1),
    dewPoint: round(dewPointF, 1),
    relHumidity: round(relHumidity, 1),
    wetBulb: round(wetBulbF, 1),
    enthalpy: round(enthalpy, 1),
  });
}

// Generate output JS module
let output = `/**
 * TMY3 Weather Data — New York Central Park Observatory (Belvedere Castle)
 * Station: WMO 725053
 * Source: TMYx 2011-2025 EPW file
 * 
 * 8,760 hourly rows (1 year), fields:
 *   hour         — sequential hour number (1–8760)
 *   dryBulb      — Dry bulb temperature (°F)
 *   dewPoint     — Dew point temperature (°F)
 *   relHumidity  — Relative humidity (%)
 *   wetBulb      — Wet bulb temperature (°F) [Stull 2011 approximation]
 *   enthalpy     — Moist air enthalpy (BTU/lb dry air)
 */

export const TMY3 = [\n`;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  output += `  { hour: ${r.hour}, dryBulb: ${r.dryBulb}, dewPoint: ${r.dewPoint}, relHumidity: ${r.relHumidity}, wetBulb: ${r.wetBulb}, enthalpy: ${r.enthalpy} }`;
  if (i < rows.length - 1) output += ',';
  output += '\n';
}

output += '];\n';

fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');
console.log(`Output written to: ${OUTPUT_PATH}`);
console.log(`Total rows: ${rows.length}`);
console.log(`Sample row 1:`, rows[0]);
console.log(`Sample row 8760:`, rows[rows.length - 1]);
