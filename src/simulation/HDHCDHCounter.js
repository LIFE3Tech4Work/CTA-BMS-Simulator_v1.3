/**
 * HDHCDHCounter — Heating and Cooling Degree Hour accumulator.
 *
 * Tracks cumulative Heating Degree Hours (HDH) and Cooling Degree Hours (CDH)
 * based on outdoor temperature relative to a 65°F base temperature.
 *
 * - HDH: accumulated hours × degrees below 65°F
 * - CDH: accumulated hours × degrees above 65°F
 *
 * Called each simulated hour by the simulation engine.
 *
 * Attached to window.HDHCDHCounter (no import/export — Babel standalone).
 */

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  /** Base temperature for degree-hour calculations (°F) */
  var BASE_TEMP = 65;

  // ─── Accumulator State ──────────────────────────────────────────────────────

  var heatDegreeHours = 0;
  var coolDegreeHours = 0;

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Increment HDH/CDH counters based on outdoor temperature.
   *
   * Called once per simulated hour:
   * - If outdoorTemp < 65°F: heatDegreeHours += (65 - outdoorTemp)
   * - If outdoorTemp > 65°F: coolDegreeHours += (outdoorTemp - 65)
   * - If outdoorTemp === 65°F: no increment
   *
   * @param {number} outdoorTemp - Outdoor dry bulb temperature in °F
   */
  function tick(outdoorTemp) {
    if (outdoorTemp === undefined || outdoorTemp === null || isNaN(outdoorTemp)) {
      return;
    }

    if (outdoorTemp < BASE_TEMP) {
      heatDegreeHours += (BASE_TEMP - outdoorTemp);
    } else if (outdoorTemp > BASE_TEMP) {
      coolDegreeHours += (outdoorTemp - BASE_TEMP);
    }
    // At exactly BASE_TEMP, no increment
  }

  /**
   * Reset all counters to zero.
   * Called on simulation reset or scenario change.
   */
  function reset() {
    heatDegreeHours = 0;
    coolDegreeHours = 0;
  }

  /**
   * Get current counter values.
   * @returns {Object} { heatDegreeHours, coolDegreeHours }
   */
  function getValues() {
    return {
      heatDegreeHours: heatDegreeHours,
      coolDegreeHours: coolDegreeHours
    };
  }

  // ─── Expose as window global ────────────────────────────────────────────────

  window.HDHCDHCounter = {
    // State accessors
    get heatDegreeHours() { return heatDegreeHours; },
    get coolDegreeHours() { return coolDegreeHours; },

    // Methods
    tick: tick,
    reset: reset,
    getValues: getValues,

    // Constants (exposed for testing)
    BASE_TEMP: BASE_TEMP
  };
})();
