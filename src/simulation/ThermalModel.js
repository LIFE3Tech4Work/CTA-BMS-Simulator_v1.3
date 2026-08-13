/**
 * ThermalModel.js — Zone temperature drift calculation model.
 *
 * Simulates realistic zone temperature response when an operator
 * changes the Supply Air Temperature setpoint (Manual mode).
 *
 * Uses exponential approach with:
 *   - Time constant τ = 10 minutes
 *   - Max rate cap of 2°F per simulated minute
 *   - Settling within 30 simulated minutes (~5% of delta remaining)
 *
 * Attached to window.ThermalModel (no import/export — Babel standalone).
 *
 * Requirements: 19.1, 19.2, 19.3
 */

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────

  /** Time constant for exponential approach (minutes) */
  const TAU = 10;

  /** Maximum drift rate (°F per simulated minute) */
  const MAX_RATE = 2;

  // ─── Point Address Mappings ─────────────────────────────────────────────────

  /**
   * Pairs of [Return Air Temp, Supply Air Temp] addresses per AHU zone.
   * The thermal model drifts the Return Air Temp toward the Supply Air Temp
   * when the SAT point is in Manual mode (operator has set a value).
   */
  const ZONE_PAIRS = [
    { ratAddress: 'AI201@DEV4004', satAddress: 'AI301@DEV4004' }, // AHU-4-4
    { ratAddress: 'AI201@DEV4006', satAddress: 'AI301@DEV4006' }, // AHU-4-6
  ];

  // ─── Core Drift Function ────────────────────────────────────────────────────

  /**
   * Calculate new zone temperature using exponential approach toward target,
   * capped at MAX_RATE per simulated minute.
   *
   * @param {number} current - Current zone temperature (°F)
   * @param {number} target - Target temperature to approach (°F)
   * @param {number} elapsedMinutes - Simulated time elapsed since last update
   * @returns {number} New zone temperature after drift
   */
  function driftZoneTemp(current, target, elapsedMinutes) {
    if (elapsedMinutes <= 0) return current;

    const delta = target - current;

    // If already at target (within floating point tolerance), no drift needed
    if (Math.abs(delta) < 0.001) return target;

    // Exponential approach step: how far toward the target we move
    const exponentialStep = delta * (1 - Math.exp(-elapsedMinutes / TAU));

    // Cap at MAX_RATE °F per minute
    const maxStep = MAX_RATE * elapsedMinutes;

    // Apply the smaller of exponential step or max rate cap
    const clampedStep = Math.sign(exponentialStep) *
      Math.min(Math.abs(exponentialStep), maxStep);

    return current + clampedStep;
  }

  // ─── Tick Update Method ─────────────────────────────────────────────────────

  /**
   * Called on each simulation tick to update zone temperatures.
   *
   * Only activates when the SAT point is in Manual mode, meaning the operator
   * has manually set a Supply Air Temperature. In Auto mode, the data playback
   * from PointRegistry.interpolate() handles temperature progression naturally.
   *
   * @param {object} pointRegistry - Reference to window.PointRegistry
   * @param {number} elapsedMinutes - Simulated minutes elapsed since last tick
   */
  function update(pointRegistry, elapsedMinutes) {
    if (!pointRegistry || elapsedMinutes <= 0) return;

    ZONE_PAIRS.forEach(function (zone) {
      // Check if the SAT point is in Manual mode (operator-controlled)
      const satMetadata = pointRegistry.getMetadata(zone.satAddress);
      if (!satMetadata) return;

      // Only apply thermal drift when operator has manually set the SAT
      // (i.e., the SAT point mode is 'Manual')
      const satPoint = pointRegistry.points.get(zone.satAddress);
      if (!satPoint || satPoint.mode !== 'Manual') return;

      // Read current Return Air Temp
      const currentRAT = pointRegistry.getValue(zone.ratAddress);
      if (currentRAT === undefined) return;

      // Read current Supply Air Temp as the drift target
      const targetSAT = pointRegistry.getValue(zone.satAddress);
      if (targetSAT === undefined) return;

      // Calculate drifted temperature
      const newRAT = driftZoneTemp(currentRAT, targetSAT, elapsedMinutes);

      // Update the Return Air Temp in the registry
      // Using 'simulation' source so it doesn't flip the RAT to Manual mode
      pointRegistry.setValue(zone.ratAddress, newRAT, 'simulation');
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  window.ThermalModel = {
    // Constants
    TAU: TAU,
    MAX_RATE: MAX_RATE,

    // Core drift function (exposed for testing and direct use)
    drift: driftZoneTemp,

    // Tick update method (integrates with simulation engine)
    update: update,

    // Zone configuration (exposed for testing)
    ZONE_PAIRS: ZONE_PAIRS,
  };
})();
