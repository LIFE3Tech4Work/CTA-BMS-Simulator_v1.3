/**
 * TMY3Projector — Weather data lookup by simulation hour.
 *
 * Maps simulation rows (1–8760, the fiscal year Jul 1 2025 – Jun 30 2026) to
 * TMY3 hourly weather
 * data (8,760 rows for a typical year from Central Park Observatory).
 *
 * TMY3 data is available at window.TMY3_DATA (loaded from
 * src/data/weather/tmy3_central_park.js). Each row has:
 *   { hour, dryBulb, dewPoint, relHumidity, wetBulb, enthalpy }
 *
 * Attached to window.TMY3Projector (no import/export — Babel standalone).
 */

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  /**
   * TMY3 hour index for May 1, 00:00.
   * Day-of-year for May 1 = 31 (Jan) + 28 (Feb) + 31 (Mar) + 30 (Apr) + 1 = 121
   * Hour index (0-based) = (121 - 1) * 24 = 2880
   */
  const MAY1_HOUR_INDEX = (31 + 28 + 31 + 30) * 24; // 2880

  /**
   * TMY3 hour index for July 1, 00:00 — the fiscal-year start.
   * Day-of-year for Jul 1 = 31+28+31+30+31+30 + 1 = 182
   * Hour index (0-based) = (182 - 1) * 24 = 4344
   */
  const FY_START_HOUR_INDEX = (31 + 28 + 31 + 30 + 31 + 30) * 24; // 4344

  /**
   * Total simulation rows — a full fiscal year, Jul 1 2025 00:00 through
   * Jun 30 2026 23:00. The simulator used to expose only the 1,017-hour
   * May–June window, which meant a lesson could never reach winter or high
   * summer even though the TMY3 file has always held all 8,760 hours.
   */
  const TOTAL_SIM_ROWS = 8760;

  /**
   * Fiscal-year row whose month/day/hour matches a given calendar moment, so
   * the simulator can open on weather that matches the real time of year
   * rather than always starting in spring. Year is ignored — only the position
   * within the year matters, and TMY3 is a typical (not actual) year anyway.
   */
  function seasonalRowFor(date) {
    var d = (date instanceof Date && !isNaN(date.getTime())) ? date : new Date();
    var doy = MONTH_START_DAY[d.getMonth()] + d.getDate();       // 1-based
    var tmy3Index = (doy - 1) * 24 + d.getHours();               // 0-based
    return ((tmy3Index - FY_START_HOUR_INDEX + TOTAL_TMY3_HOURS) % TOTAL_TMY3_HOURS) + 1;
  }

  /** Total TMY3 hours in a year */
  const TOTAL_TMY3_HOURS = 8760;

  /**
   * Day-of-year offsets for each month (0-indexed months: 0=Jan, 1=Feb, ...)
   * dayOfYear = MONTH_START_DAY[monthIndex] + dayOfMonth
   */
  const MONTH_START_DAY = [
    0,   // Jan: days 1–31
    31,  // Feb: days 32–59
    59,  // Mar: days 60–90
    90,  // Apr: days 91–120
    120, // May: days 121–151
    151, // Jun: days 152–181
    181, // Jul: days 182–212
    212, // Aug: days 213–243
    243, // Sep: days 244–273
    273, // Oct: days 274–304
    304, // Nov: days 305–334
    334  // Dec: days 335–365
  ];

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Get the TMY3 data array. Falls back gracefully if not yet loaded.
   * @returns {Array} TMY3 data rows
   */
  function getTMY3Data() {
    return window.TMY3_DATA || window.TMY3 || [];
  }

  /**
   * Convert monthIndex (0-based) + dayOfMonth (1-based) + hour (0–23) to
   * a 0-based TMY3 array index. Returns -1 if inputs are invalid.
   */
  function dateToTMY3Index(monthIndex, dayOfMonth, hour) {
    if (monthIndex < 0 || monthIndex > 11 || MONTH_START_DAY[monthIndex] === undefined) {
      return -1;
    }
    var dayOfYear = MONTH_START_DAY[monthIndex] + dayOfMonth; // 1-based day of year
    return (dayOfYear - 1) * 24 + hour; // 0-based index into TMY3 array
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Get weather data for a specific date/time.
   *
   * @param {number} monthIndex - 0-based month (0=Jan, 4=May, 5=Jun)
   * @param {number} dayOfMonth - 1-based day of month
   * @param {number} hour - 0-based hour (0–23)
   * @returns {Object|null} TMY3 row { hour, dryBulb, dewPoint, relHumidity, wetBulb, enthalpy } or null
   */
  function getWeatherAtHour(monthIndex, dayOfMonth, hour) {
    var data = getTMY3Data();
    if (!data || data.length === 0) return null;

    var index = dateToTMY3Index(monthIndex, dayOfMonth, hour);

    if (index < 0 || index >= data.length) return null;

    return data[index];
  }

  /**
   * Get weather data for a simulation row (1–8760).
   *
   * Row 1    = Jul 1,  00:00 → TMY3 index 4344
   * Row 4417 = Jan 1,  00:00 → TMY3 index 0 (wraps)
   * Row 8760 = Jun 30, 23:00 → TMY3 index 4343
   *
   * @param {number} simulationRow - Simulation row number (1-based, 1–8760)
   * @returns {Object|null} TMY3 row or null if out of range
   */
  function getWeatherForRow(simulationRow) {
    if (simulationRow < 1 || simulationRow > TOTAL_SIM_ROWS) return null;

    var data = getTMY3Data();
    if (!data || data.length === 0) return null;

    // Row 1 maps to TMY3 index FY_START_HOUR_INDEX (4344 = Jul 1 00:00).
    // Wraps at the calendar year boundary: FY rows 1–4416 are Jul–Dec, rows
    // 4417–8760 are Jan–Jun of the following calendar year.
    var tmy3Index = (FY_START_HOUR_INDEX + (simulationRow - 1)) % TOTAL_TMY3_HOURS;

    if (tmy3Index < 0 || tmy3Index >= data.length) return null;

    return data[tmy3Index];
  }

  /**
   * Linearly interpolate weather data between two adjacent hours.
   *
   * Provides smooth transitions between hourly TMY3 data points.
   *
   * @param {number} simulationRow - Simulation row number (1-based, 1–8760)
   * @param {number} fraction - Interpolation fraction between current and next hour (0.0–1.0)
   * @returns {Object|null} Interpolated weather object or null if out of range
   */
  function interpolateWeather(simulationRow, fraction) {
    if (simulationRow < 1 || simulationRow > TOTAL_SIM_ROWS) return null;
    if (fraction < 0) fraction = 0;
    if (fraction > 1) fraction = 1;

    var data = getTMY3Data();
    if (!data || data.length === 0) return null;

    var tmy3Index = (FY_START_HOUR_INDEX + (simulationRow - 1)) % TOTAL_TMY3_HOURS;
    if (tmy3Index < 0 || tmy3Index >= data.length) return null;

    var currentRow = data[tmy3Index];

    // If fraction is 0 or we're at the last row, just return current
    var nextIndex = (tmy3Index + 1) % TOTAL_TMY3_HOURS;
    if (fraction === 0 || nextIndex >= data.length) {
      return {
        hour: currentRow.hour,
        dryBulb: currentRow.dryBulb,
        dewPoint: currentRow.dewPoint,
        relHumidity: currentRow.relHumidity,
        wetBulb: currentRow.wetBulb,
        enthalpy: currentRow.enthalpy
      };
    }

    var nextRow = data[nextIndex];

    // Linear interpolation: value = current + fraction * (next - current)
    return {
      hour: currentRow.hour,
      dryBulb: currentRow.dryBulb + fraction * (nextRow.dryBulb - currentRow.dryBulb),
      dewPoint: currentRow.dewPoint + fraction * (nextRow.dewPoint - currentRow.dewPoint),
      relHumidity: currentRow.relHumidity + fraction * (nextRow.relHumidity - currentRow.relHumidity),
      wetBulb: currentRow.wetBulb + fraction * (nextRow.wetBulb - currentRow.wetBulb),
      enthalpy: currentRow.enthalpy + fraction * (nextRow.enthalpy - currentRow.enthalpy)
    };
  }

  // ─── Expose as window global ────────────────────────────────────────────────

  window.TMY3Projector = {
    // Methods
    getWeatherAtHour: getWeatherAtHour,
    getWeatherForRow: getWeatherForRow,
    interpolateWeather: interpolateWeather,

    // Constants (exposed for testing / consumers)
    seasonalRowFor: seasonalRowFor,
    MAY1_HOUR_INDEX: MAY1_HOUR_INDEX,
    FY_START_HOUR_INDEX: FY_START_HOUR_INDEX,
    TOTAL_SIM_ROWS: TOTAL_SIM_ROWS,
    TOTAL_TMY3_HOURS: TOTAL_TMY3_HOURS,
    MONTH_START_DAY: MONTH_START_DAY
  };
})();
