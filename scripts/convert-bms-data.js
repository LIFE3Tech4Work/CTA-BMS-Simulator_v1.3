#!/usr/bin/env node
/**
 * BMS Data Conversion Script
 * 
 * Reads 27 primary .xlsx files from BMS Exports/, extracts time-series data,
 * reverses to chronological order, and outputs ES module JS files in src/data/points/.
 * Also generates the two pedagogical variants (corrected CO2, edited RunSchedule)
 * and a POINT_CATALOG index.
 * 
 * Usage: node scripts/convert-bms-data.js
 * 
 * Requires: npm install xlsx
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const EXPORTS_DIR = path.join(__dirname, '..', 'BMS Exports');
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'data', 'points');

// ─── Point Metadata Configuration ───────────────────────────────────────────
// Each entry maps a filename to its point metadata including BACnet address

const POINT_DEFINITIONS = {
  'AHU04_04SAFanSpeed_3Month_6122026.xlsx': {
    id: 'AHU04_04SAFanSpeed',
    address: 'AO101@DEV4004',
    name: 'AHU-4-4 Supply Air Fan Speed',
    type: 'AO',
    units: '%',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
  },
  'AHU04_04CHWCoilValve_3Month_6122026.xlsx': {
    id: 'AHU04_04CHWCoilValve',
    address: 'AO102@DEV4004',
    name: 'AHU-4-4 CHW Coil Valve',
    type: 'AO',
    units: '%',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
  },
  'AHU04_04PHTCoil01Valve_3Month_6122026.xlsx': {
    id: 'AHU04_04PHTCoil01Valve',
    address: 'AO103@DEV4004',
    name: 'AHU-4-4 Preheat Coil Valve',
    type: 'AO',
    units: '%',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
  },
  'AHU04_04OADamper_3Month_6122026.xlsx': {
    id: 'AHU04_04OADamper',
    address: 'AO104@DEV4004',
    name: 'AHU-4-4 OA Damper',
    type: 'AO',
    units: '%',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
  },
  'AHU04_04RATemp_3Month_6122026.xlsx': {
    id: 'AHU04_04RATemp',
    address: 'AI201@DEV4004',
    name: 'AHU-4-4 Return Air Temp',
    type: 'AI',
    units: '°F',
    min: 40,
    max: 120,
    covIncrement: 0.5,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
  },
  'AHU04_04SATemp_3Month_6122026.xlsx': {
    id: 'AHU04_04SATemp',
    address: 'AI301@DEV4004',
    name: 'AHU-4-4 Supply Air Temp',
    type: 'AI',
    units: '°F',
    min: 40,
    max: 120,
    covIncrement: 0.5,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
  },
  'AHU_4_4_CO2.xlsx': {
    id: 'AHU04_04RACO2',
    address: 'AI401@DEV4004',
    name: 'AHU-4-4 Return Air CO2',
    type: 'AI',
    units: 'ppm',
    min: 0,
    max: 2000,
    covIncrement: 25,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
  },
  'AHU04_04BranchStaticPress_3Month_6122026.xlsx': {
    id: 'AHU04_04BranchStaticPress',
    address: 'AI501@DEV4004',
    name: 'AHU-4-4 Branch Static Pressure',
    type: 'AI',
    units: 'inWC',
    min: 0,
    max: 5,
    covIncrement: 0.05,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
  },
  'AHU04_04RunSchedule_3Month_6122026.xlsx': {
    id: 'AHU04_04RunSchedule',
    address: 'BI601@DEV4004',
    name: 'AHU-4-4 Run Schedule',
    type: 'BI',
    units: '',
    min: 0,
    max: 100,
    covIncrement: 0,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
  },
  'RF04_07RAFanSpeed_AHU_4_4_3Month_6122026.xlsx': {
    id: 'RF04_07RAFanSpeed',
    address: 'AO105@DEV4004',
    name: 'AHU-4-4 Return Air Fan Speed',
    type: 'AO',
    units: '%',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
  },
  'AHU04_06SAFanSpeed_3Month_6122026.xlsx': {
    id: 'AHU04_06SAFanSpeed',
    address: 'AO101@DEV4006',
    name: 'AHU-4-6 Supply Air Fan Speed',
    type: 'AO',
    units: '%',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'AHU04_06CHWCoilValve_3Month_6122026.xlsx': {
    id: 'AHU04_06CHWCoilValve',
    address: 'AO102@DEV4006',
    name: 'AHU-4-6 CHW Coil Valve',
    type: 'AO',
    units: '%',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'AHU04_06PHTCoil01Valve_3Month_6122026.xlsx': {
    id: 'AHU04_06PHTCoil01Valve',
    address: 'AO103@DEV4006',
    name: 'AHU-4-6 Preheat Coil Valve',
    type: 'AO',
    units: '%',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'AHU_4_6_OA_Damper_3Month_6122026.xlsx': {
    id: 'AHU04_06OADamper',
    address: 'AO104@DEV4006',
    name: 'AHU-4-6 OA Damper',
    type: 'AO',
    units: '%',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'AHU04_06RATemp_3Month_6122026.xlsx': {
    id: 'AHU04_06RATemp',
    address: 'AI201@DEV4006',
    name: 'AHU-4-6 Return Air Temp',
    type: 'AI',
    units: '°F',
    min: 40,
    max: 120,
    covIncrement: 0.5,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'AHU04_06SATemp3Month_6122026.xlsx': {
    id: 'AHU04_06SATemp',
    address: 'AI301@DEV4006',
    name: 'AHU-4-6 Supply Air Temp',
    type: 'AI',
    units: '°F',
    min: 40,
    max: 120,
    covIncrement: 0.5,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'AHU04_06RACO2_3Month_6122026.xlsx': {
    id: 'AHU04_06RACO2',
    address: 'AI401@DEV4006',
    name: 'AHU-4-6 Return Air CO2',
    type: 'AI',
    units: 'ppm',
    min: 0,
    max: 2000,
    covIncrement: 25,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'AHU04_06RAHumid_3Month_6122026.xlsx': {
    id: 'AHU04_06RAHumid',
    address: 'AI402@DEV4006',
    name: 'AHU-4-6 Return Air Humidity',
    type: 'AI',
    units: '%RH',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'AHU04_06BranchStaticPress_3Month_6122026.xlsx': {
    id: 'AHU04_06BranchStaticPress',
    address: 'AI501@DEV4006',
    name: 'AHU-4-6 Branch Static Pressure',
    type: 'AI',
    units: 'inWC',
    min: 0,
    max: 5,
    covIncrement: 0.05,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'AHU_4_6_RunSchedule_3Month_6122026.xlsx': {
    id: 'AHU04_06RunSchedule',
    address: 'BI601@DEV4006',
    name: 'AHU-4-6 Run Schedule',
    type: 'BI',
    units: '',
    min: 0,
    max: 100,
    covIncrement: 0,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'MeetingRoom1.xlsx': {
    id: 'MeetingRoom1',
    address: 'AI601@DEV4006',
    name: 'AHU-4-6 Meeting Room 1 Temp',
    type: 'AI',
    units: '°F',
    min: 40,
    max: 120,
    covIncrement: 0.5,
    sensorOffset: 0,
    subsystem: 'AHU-4-6',
  },
  'OA_Temp_3Month_6122026.xlsx': {
    id: 'OaTemp',
    address: 'AI701@DEV5000',
    name: 'Outside Air Temperature',
    type: 'AI',
    units: '°F',
    min: -20,
    max: 120,
    covIncrement: 0.5,
    sensorOffset: 0,
    subsystem: 'Outdoor',
  },
  'OADewpoint_3Month_6122026.xlsx': {
    id: 'OaDewpoint',
    address: 'AI702@DEV5000',
    name: 'Outside Air Dewpoint',
    type: 'AI',
    units: '°F',
    min: -20,
    max: 120,
    covIncrement: 0.5,
    sensorOffset: 0,
    subsystem: 'Outdoor',
  },
  'OAHumidity_3Month6122026.xlsx': {
    id: 'OaHumid',
    address: 'AI703@DEV5000',
    name: 'Outside Air Humidity',
    type: 'AI',
    units: '%RH',
    min: 0,
    max: 100,
    covIncrement: 1.0,
    sensorOffset: 0,
    subsystem: 'Outdoor',
  },
  'OaWetbulb_3Month_6122026.xlsx': {
    id: 'OaWetbulb',
    address: 'AI704@DEV5000',
    name: 'Outside Air Wetbulb',
    type: 'AI',
    units: '°F',
    min: -20,
    max: 120,
    covIncrement: 0.5,
    sensorOffset: 0,
    subsystem: 'Outdoor',
  },
  'OaEnthalpy_3Month_6122026.xlsx': {
    id: 'OaEnthalpy',
    address: 'AI705@DEV5000',
    name: 'Outside Air Enthalpy',
    type: 'AI',
    units: 'BTU/lb',
    min: 0,
    max: 60,
    covIncrement: 0.5,
    sensorOffset: 0,
    subsystem: 'Outdoor',
  },
  'Cooling_Tower_Run_Status_June.xlsx': {
    id: 'CT_CT02Status',
    address: 'BI801@DEV6000',
    name: 'Cooling Tower CT-02 Run Status',
    type: 'BI',
    units: '',
    min: 0,
    max: 100,
    covIncrement: 0,
    sensorOffset: 0,
    subsystem: 'CoolingTower',
  },
};

// Pedagogical variants
const VARIANT_DEFINITIONS = {
  'AHU4_4_CO2_Edit.xlsx': {
    id: 'AHU04_04RACO2_corrected',
    address: 'AI401@DEV4004',
    name: 'AHU-4-4 Return Air CO2 (Corrected)',
    type: 'AI',
    units: 'ppm',
    min: 0,
    max: 2000,
    covIncrement: 25,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
    isVariant: true,
    variantOf: 'AHU04_04RACO2',
    description: 'Corrected CO2 series (May 13-20, 169 rows)',
  },
  'AHU04_04RunSchedule.PresentValueMay13_May20Edit.xlsx': {
    id: 'AHU04_04RunSchedule_edited',
    address: 'BI601@DEV4004',
    name: 'AHU-4-4 Run Schedule (Edited May 13-20)',
    type: 'BI',
    units: '',
    min: 0,
    max: 1,
    covIncrement: 0,
    sensorOffset: 0,
    subsystem: 'AHU-4-4',
    isVariant: true,
    variantOf: 'AHU04_04RunSchedule',
    description: 'Edited RunSchedule (May 13-20, 169 rows, all values = 1)',
  },
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Parse a value from an Excel cell. Handles numeric values and
 * string values like "750ppm".
 */
function parseValue(cellValue) {
  if (cellValue === undefined || cellValue === null || cellValue === '') {
    return null;
  }
  if (typeof cellValue === 'number') {
    return cellValue;
  }
  // Handle strings like "750ppm"
  const numMatch = String(cellValue).match(/^([\d.]+)/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }
  return null;
}

/**
 * Read an Excel file and extract the numeric data column values.
 * Returns values in chronological order (oldest first).
 */
function extractDataFromExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (data.length < 2) {
    throw new Error(`File has insufficient data: ${filePath}`);
  }

  // Data rows (skip header)
  const rows = data.slice(1).filter(r => r.length > 0);

  // Value is always in column index 2 (Date, Time, Value)
  const values = rows.map(row => parseValue(row[2]));

  // Filter out nulls but track positions
  const validValues = values.filter(v => v !== null);

  // Data is in reverse chronological order (newest first) — reverse to chronological
  validValues.reverse();

  return validValues;
}

/**
 * Pad an array to the target length by repeating the last value.
 */
function padToLength(arr, targetLength) {
  if (arr.length >= targetLength) return arr.slice(0, targetLength);
  const lastValue = arr[arr.length - 1];
  const padded = [...arr];
  while (padded.length < targetLength) {
    padded.push(lastValue);
  }
  return padded;
}

/**
 * Generate an ES module file content for a point.
 */
function generatePointModule(definition, values) {
  const meta = {
    address: definition.address,
    name: definition.name,
    type: definition.type,
    units: definition.units,
    min: definition.min,
    max: definition.max,
    covIncrement: definition.covIncrement,
    sensorOffset: definition.sensorOffset,
    subsystem: definition.subsystem,
  };

  if (definition.isVariant) {
    meta.isVariant = true;
    meta.variantOf = definition.variantOf;
    meta.description = definition.description;
  }

  // Format values: round to 2 decimal places for cleaner output
  const formattedValues = values.map(v => Math.round(v * 100) / 100);

  let content = `/**\n`;
  content += ` * ${definition.name}\n`;
  content += ` * BACnet Address: ${definition.address}\n`;
  content += ` * Type: ${definition.type} | Units: ${definition.units || 'binary'}\n`;
  content += ` * Subsystem: ${definition.subsystem}\n`;
  content += ` * Data: ${values.length} hourly values\n`;
  if (definition.isVariant) {
    content += ` * Variant: ${definition.description}\n`;
  }
  content += ` */\n\n`;

  content += `export const ${definition.id} = {\n`;
  content += `  address: "${meta.address}",\n`;
  content += `  name: "${meta.name}",\n`;
  content += `  type: "${meta.type}",\n`;
  content += `  units: "${meta.units}",\n`;
  content += `  min: ${meta.min},\n`;
  content += `  max: ${meta.max},\n`;
  content += `  covIncrement: ${meta.covIncrement},\n`;
  content += `  sensorOffset: ${meta.sensorOffset},\n`;
  content += `  subsystem: "${meta.subsystem}",\n`;

  if (definition.isVariant) {
    content += `  isVariant: true,\n`;
    content += `  variantOf: "${definition.variantOf}",\n`;
    content += `  description: "${definition.description}",\n`;
  }

  // Write data array with line wrapping for readability
  content += `  data: [\n`;
  const VALS_PER_LINE = 12;
  for (let i = 0; i < formattedValues.length; i += VALS_PER_LINE) {
    const chunk = formattedValues.slice(i, i + VALS_PER_LINE);
    content += `    ${chunk.join(', ')}`;
    if (i + VALS_PER_LINE < formattedValues.length) {
      content += ',\n';
    } else {
      content += '\n';
    }
  }
  content += `  ]\n`;
  content += `};\n`;

  return content;
}

/**
 * Generate the POINT_CATALOG index module.
 */
function generateCatalogIndex(allPoints) {
  let content = `/**\n`;
  content += ` * POINT_CATALOG - Index of all 27 BMS points with metadata\n`;
  content += ` * Auto-generated by scripts/convert-bms-data.js\n`;
  content += ` */\n\n`;

  // Import statements
  for (const point of allPoints) {
    content += `import { ${point.id} } from './${point.id}.js';\n`;
  }

  content += `\n`;

  // Re-export individual points
  content += `// Re-export individual point modules\n`;
  content += `export {\n`;
  for (const point of allPoints) {
    content += `  ${point.id},\n`;
  }
  content += `};\n\n`;

  // POINT_CATALOG array with metadata
  content += `/**\n`;
  content += ` * POINT_CATALOG lists all 27 primary points plus 2 pedagogical variants.\n`;
  content += ` * Each entry includes full metadata and a reference to the data array.\n`;
  content += ` */\n`;
  content += `export const POINT_CATALOG = [\n`;

  for (const point of allPoints) {
    content += `  {\n`;
    content += `    id: "${point.id}",\n`;
    content += `    address: "${point.address}",\n`;
    content += `    name: "${point.name}",\n`;
    content += `    type: "${point.type}",\n`;
    content += `    units: "${point.units}",\n`;
    content += `    min: ${point.min},\n`;
    content += `    max: ${point.max},\n`;
    content += `    covIncrement: ${point.covIncrement},\n`;
    content += `    sensorOffset: ${point.sensorOffset},\n`;
    content += `    subsystem: "${point.subsystem}",\n`;
    if (point.isVariant) {
      content += `    isVariant: true,\n`;
      content += `    variantOf: "${point.variantOf}",\n`;
      content += `    description: "${point.description}",\n`;
    }
    content += `    dataLength: ${point.dataLength},\n`;
    content += `    module: ${point.id},\n`;
    content += `  },\n`;
  }

  content += `];\n\n`;

  // Convenience lookup by address
  content += `/** Lookup point by BACnet address */\n`;
  content += `export const POINT_BY_ADDRESS = Object.fromEntries(\n`;
  content += `  POINT_CATALOG.filter(p => !p.isVariant).map(p => [p.address, p])\n`;
  content += `);\n\n`;

  // Convenience lookup by subsystem
  content += `/** Lookup points by subsystem */\n`;
  content += `export const POINTS_BY_SUBSYSTEM = {\n`;
  content += `  'AHU-4-4': POINT_CATALOG.filter(p => p.subsystem === 'AHU-4-4' && !p.isVariant),\n`;
  content += `  'AHU-4-6': POINT_CATALOG.filter(p => p.subsystem === 'AHU-4-6' && !p.isVariant),\n`;
  content += `  'Outdoor': POINT_CATALOG.filter(p => p.subsystem === 'Outdoor'),\n`;
  content += `  'CoolingTower': POINT_CATALOG.filter(p => p.subsystem === 'CoolingTower'),\n`;
  content += `};\n`;

  return content;
}

// ─── Main Execution ──────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════');
console.log('  BMS DATA CONVERSION — Generating JS Modules');
console.log('═══════════════════════════════════════════════════════════\n');

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const TARGET_ROWS = 1017;
const allPointsMeta = [];
let successCount = 0;
let errorCount = 0;

// Process primary 27 points
console.log('── Processing 27 primary points ──\n');

for (const [filename, definition] of Object.entries(POINT_DEFINITIONS)) {
  const filePath = path.join(EXPORTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`  ❌ MISSING: ${filename}`);
    errorCount++;
    continue;
  }

  try {
    let values = extractDataFromExcel(filePath);

    // Pad files with fewer than 1017 rows to the target
    if (values.length < TARGET_ROWS) {
      console.log(`  ⚠️  ${definition.id}: ${values.length} rows → padding to ${TARGET_ROWS}`);
      values = padToLength(values, TARGET_ROWS);
    } else if (values.length > TARGET_ROWS) {
      // Truncate to 1017 rows (take the first 1017 = oldest data)
      values = values.slice(0, TARGET_ROWS);
    }

    const moduleContent = generatePointModule(definition, values);
    const outputPath = path.join(OUTPUT_DIR, `${definition.id}.js`);
    fs.writeFileSync(outputPath, moduleContent, 'utf8');

    allPointsMeta.push({
      ...definition,
      dataLength: values.length,
    });

    console.log(`  ✅ ${definition.id} → ${values.length} values [${Math.min(...values).toFixed(1)}..${Math.max(...values).toFixed(1)}]`);
    successCount++;
  } catch (err) {
    console.log(`  ❌ ERROR: ${definition.id} — ${err.message}`);
    errorCount++;
  }
}

// Process pedagogical variants
console.log('\n── Processing 2 pedagogical variants ──\n');

for (const [filename, definition] of Object.entries(VARIANT_DEFINITIONS)) {
  const filePath = path.join(EXPORTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`  ❌ MISSING: ${filename}`);
    errorCount++;
    continue;
  }

  try {
    let values = extractDataFromExcel(filePath);

    // Variants are 169 rows (May 13–20) — keep as-is
    const moduleContent = generatePointModule(definition, values);
    const outputPath = path.join(OUTPUT_DIR, `${definition.id}.js`);
    fs.writeFileSync(outputPath, moduleContent, 'utf8');

    allPointsMeta.push({
      ...definition,
      dataLength: values.length,
    });

    console.log(`  ✅ ${definition.id} → ${values.length} values [${Math.min(...values).toFixed(1)}..${Math.max(...values).toFixed(1)}]`);
    successCount++;
  } catch (err) {
    console.log(`  ❌ ERROR: ${definition.id} — ${err.message}`);
    errorCount++;
  }
}

// Generate POINT_CATALOG index
console.log('\n── Generating POINT_CATALOG index ──\n');

const catalogContent = generateCatalogIndex(allPointsMeta);
const indexPath = path.join(OUTPUT_DIR, 'index.js');
fs.writeFileSync(indexPath, catalogContent, 'utf8');
console.log(`  ✅ src/data/points/index.js (${allPointsMeta.length} points cataloged)`);

// Summary
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  CONVERSION COMPLETE`);
console.log(`  ✅ Success: ${successCount} | ❌ Errors: ${errorCount}`);
console.log(`  Output: ${OUTPUT_DIR}`);
console.log('═══════════════════════════════════════════════════════════\n');

if (errorCount > 0) {
  process.exit(1);
}
