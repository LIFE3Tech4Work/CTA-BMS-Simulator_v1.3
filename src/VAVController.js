/**
 * VAVController.js — Control logic engine for VAV terminal units
 *
 * Models a VAV (Variable Air Volume) terminal box downstream of AHU-4-4_NEW,
 * following the same formula-driven pattern as AHU44NewController.js. One
 * zone is modeled, served by AHU-4-4_NEW (Ballroom Level 2):
 *   - VAV-4-4-02 — Ballroom
 *   (VAV-4-4-01 Pre-Function removed — was identical twin, provided no
 *    additional instructional value)
 *
 * This exists to close a real gap identified against the CTA BMS Work-Based
 * Learning Project Guide: the WBL guide asks teams to investigate VAV damper
 * positions, reheat operation, space setpoints, and zone CO2 — none of which
 * existed in the simulator before this, since prior modeling stopped at the
 * AHU level. "Excessive Reheat" (issue #6 in the guide's Common Issues list)
 * specifically cannot be detected without a VAV reheat coil to detect it on.
 *
 * Standard cooling-only VAV-with-reheat sequence of operation:
 *   Occupied, space temp > cooling SP  → damper modulates above minimum
 *                                          toward max; reheat off
 *   Occupied, within deadband          → damper holds at ASHRAE 62.1
 *                                          minimum; reheat off
 *   Occupied, space temp < heating SP  → damper holds at minimum; reheat
 *                                          valve modulates to warm the
 *                                          (already-cooled) discharge air
 *   CO2 > setpoint                     → damper floor rises above ASHRAE
 *                                          minimum (DCV), same pattern as
 *                                          the AHU's economizer CO2 override
 *   Unoccupied                         → damper and reheat both close
 *
 * dischargeAirTemp is pushed in each tick from AHU44NewController's
 * supplyAirTemp output (App.jsx tick driver) — the VAV doesn't generate its
 * own supply air, it receives the AHU's. This is what makes "Excessive
 * Reheat" a real, connected fault: if the AHU cooled the air to 55°F and the
 * VAV is reheating it back up, that's the literal energy-waste pattern the
 * WBL guide describes ("Cooling air to 60°F, Reheating to 78°F").
 *
 * spaceTemp is treated as a live, operator/scenario-editable sensor input
 * (same convention as AHU44NewController treats coolingCoilSetpoint) rather
 * than something this controller derives via its own thermal model — zone
 * thermal drift already has a dedicated home in ThermalModel.js, and
 * duplicating ad hoc physics here would conflict with that.
 *
 * damperPosition and reheatValvePosition are true Manual-able outputs
 * (added per the BMS Slide Companion lecture review): once set via
 * setValue(zoneId, 'damperPosition', ...) or 'reheatValvePosition', they
 * hold that exact value instead of being recomputed by the sequence of
 * operation below — mirroring a real BACnet AO going Manual, same pattern
 * AHU44NewController.js now uses for oaDamperPosition. This is what makes
 * "VAV running during unoccupied hours" a real, reachable fault (see
 * VAVFaultEngine.js's V-03) — previously damperPosition/airflowCFM were
 * deterministically zeroed whenever runSchedule was false, with no way to
 * reach "unoccupied but still moving air." airflowCFM still recomputes
 * normally from whatever damperPosition currently is, manual or not.
 *
 * Exposed as: window.VAVController — public API, multi-instance keyed by zoneId
 */

(function() {
  'use strict';

  // ─── Design Constants ───────────────────────────────────────────────────────

  var REHEAT_MAX_RISE = 25;        // °F — max temperature rise across the reheat coil at 100% valve
  var DEFAULT_DISCHARGE_AIR_TEMP = 55.0; // °F — used before the AHU pushes a live value

  var ZONES = [
    { id: 'VAV-4-4-02', label: 'Ballroom', servedBy: 'AHU-4-4_NEW' }
  ];

  function defaultState() {
    return {
      // ═══ INPUTS (editable) ═══════════════════════════════════════════════
      runSchedule: true,
      spaceTemp: 72.0,                  // °F — zone sensor reading
      spaceTempCoolingSetpoint: 74.0,   // °F
      spaceTempHeatingSetpoint: 70.0,   // °F
      minAirflowSetpoint: 200,          // CFM — ASHRAE 62.1 zone minimum
      maxAirflowSetpoint: 1000,         // CFM — design maximum
      co2Sensor: 550,                   // PPM
      co2Setpoint: 1000,                // PPM — DCV trigger (distinct from the
                                         // 1,100 ppm alarm threshold in VAVFaultEngine,
                                         // same relationship as the AHU's co2Setpoint/N-02)

      // ═══ OUTPUTS (calculated) ════════════════════════════════════════════
      dischargeAirTemp: DEFAULT_DISCHARGE_AIR_TEMP, // °F — from upstream AHU
      damperPosition: 20,                // %
      airflowCFM: 200,                   // CFM
      reheatValvePosition: 0,            // %
      reheatValveStatus: 'OFF',
      leavingAirTemp: DEFAULT_DISCHARGE_AIR_TEMP, // °F — air actually entering the zone
      damperMode: 'Deadband-Minimum'     // 'Cooling' | 'Deadband-Minimum' | 'Heating-Reheat' | 'Unoccupied'
    };
  }

  // ─── Per-Zone State ─────────────────────────────────────────────────────────

  var zoneStates = {};   // Map<zoneId, state>
  var zoneModes = {};    // Map<zoneId, Map<stateKey, 'Manual'>>
  var subscribers = {};  // Map<zoneId, callback[]>

  ZONES.forEach(function(z) {
    zoneStates[z.id] = defaultState();
    zoneModes[z.id] = {};
    subscribers[z.id] = [];
  });

  window.VAVState = zoneStates; // shared, read by graphic — mirrors window.AHU44NewState

  // ─── Engineering Calculations ───────────────────────────────────────────────

  function recalculate(zoneId) {
    var state = zoneStates[zoneId];
    if (!state) return;
    var modesForZone = zoneModes[zoneId];
    var damperManual = modesForZone.damperPosition === 'Manual';
    var reheatManual = modesForZone.reheatValvePosition === 'Manual';

    var minDamperPct = Math.min(100, Math.round((state.minAirflowSetpoint / state.maxAirflowSetpoint) * 100));

    if (!state.runSchedule) {
      // Unoccupied — damper and reheat both close, UNLESS manually held
      // open. That's the literal "VAV running during unoccupied hours"
      // fault pattern (VAVFaultEngine.js V-03): a stuck or uncleared
      // manual override is exactly what the lecture material's repeated
      // "schedule says off, but airflow says otherwise" examples describe.
      state.damperMode = 'Unoccupied';
      if (!damperManual) {
        state.damperPosition = 0;
      }
      if (!reheatManual) {
        state.reheatValvePosition = 0;
        state.reheatValveStatus = 'OFF';
      }
    } else {
      if (state.spaceTemp > state.spaceTempCoolingSetpoint) {
        // Cooling call — modulate above minimum toward max
        state.damperMode = 'Cooling';
        if (!damperManual) {
          var coolError = state.spaceTemp - state.spaceTempCoolingSetpoint;
          var coolFraction = Math.min(1, coolError / 4); // saturates at +4°F error
          state.damperPosition = Math.round(minDamperPct + coolFraction * (100 - minDamperPct));
        }
        if (!reheatManual) {
          state.reheatValvePosition = 0;
          state.reheatValveStatus = 'OFF';
        }
      } else if (state.spaceTemp < state.spaceTempHeatingSetpoint) {
        // Heating call — damper holds at minimum, reheat modulates
        state.damperMode = 'Heating-Reheat';
        if (!damperManual) {
          state.damperPosition = minDamperPct;
        }
        if (!reheatManual) {
          var heatError = state.spaceTempHeatingSetpoint - state.spaceTemp;
          state.reheatValvePosition = Math.min(100, Math.round(heatError * 25));
          state.reheatValveStatus = state.reheatValvePosition > 0 ? 'ON' : 'OFF';
        }
      } else {
        // Deadband — damper at minimum, no reheat
        state.damperMode = 'Deadband-Minimum';
        if (!damperManual) {
          state.damperPosition = minDamperPct;
        }
        if (!reheatManual) {
          state.reheatValvePosition = 0;
          state.reheatValveStatus = 'OFF';
        }
      }

      // CO2 DCV override — raises the damper floor, never lowers it.
      // Skipped entirely when the damper is manually held: a real BACnet
      // Manual command on an AO holds an exact value — DCV logic doesn't
      // get to "raise the floor" on top of an operator's explicit number.
      if (!damperManual && state.co2Sensor > state.co2Setpoint) {
        var co2Excess = state.co2Sensor - state.co2Setpoint;
        var co2DamperFloor = Math.min(100, minDamperPct + co2Excess / 10);
        state.damperPosition = Math.max(state.damperPosition, Math.round(co2DamperFloor));
      }
    }

    // reheatValveStatus needs to reflect a manually-forced reheatValvePosition
    // too — e.g. an operator forcing it to 0 should read OFF, not whatever
    // status was last computed by the sequence.
    if (reheatManual) {
      state.reheatValveStatus = state.reheatValvePosition > 0 ? 'ON' : 'OFF';
    }

    // airflowCFM always reflects whatever damperPosition currently is,
    // manual override or not — a stuck-open damper during unoccupied hours
    // should visibly show nonzero airflow; that's the fault. Two different
    // formulas by design: the occupied-range min/max interpolation below is
    // calibrated for the normal operating range (damper never truly at a
    // literal 0% while occupied — minDamperPct is its floor); a manually-
    // forced position during Unoccupied isn't on that same operating curve,
    // so it uses a direct 0–100%-of-max relationship instead. At
    // damperPosition=0 (the normal, non-manual Unoccupied case) both
    // formulas agree on 0 CFM, preserving prior behavior exactly.
    if (!state.runSchedule) {
      state.airflowCFM = Math.round((state.damperPosition / 100) * state.maxAirflowSetpoint);
    } else {
      state.airflowCFM = Math.round(
        state.minAirflowSetpoint + (state.damperPosition / 100) * (state.maxAirflowSetpoint - state.minAirflowSetpoint)
      );
    }

    state.leavingAirTemp = Math.round(
      (state.dischargeAirTemp + (state.reheatValvePosition / 100) * REHEAT_MAX_RISE) * 10
    ) / 10;

    notifySubscribers(zoneId);
  }

  function notifySubscribers(zoneId) {
    var subs = subscribers[zoneId];
    if (!subs) return;
    var state = zoneStates[zoneId];
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](state); } catch (e) {}
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  function getState(zoneId) {
    var state = zoneStates[zoneId];
    return state ? Object.assign({}, state) : undefined;
  }

  function getZoneIds() {
    return ZONES.map(function(z) { return z.id; });
  }

  function getZoneInfo(zoneId) {
    var z = ZONES.find(function(z) { return z.id === zoneId; });
    return z ? Object.assign({}, z) : undefined;
  }

  // dischargeAirTemp is pushed from the upstream AHU, not operator-editable —
  // same WEATHER_DRIVEN_KEYS pattern AHU44NewController uses for oaTemperature.
  var AHU_DRIVEN_KEYS = { dischargeAirTemp: true };

  function setValue(zoneId, key, value) {
    var state = zoneStates[zoneId];
    if (!state) return;
    if (AHU_DRIVEN_KEYS[key]) {
      console.warn('[VAVController] "' + key + '" on ' + zoneId + ' is AHU-driven and cannot be set manually. Ignored.');
      return;
    }
    if (state.hasOwnProperty(key)) {
      state[key] = value;
      zoneModes[zoneId][key] = 'Manual';
      recalculate(zoneId);
    }
  }

  function getModes(zoneId) {
    return zoneModes[zoneId] ? Object.assign({}, zoneModes[zoneId]) : {};
  }

  /**
   * Push the upstream AHU's current discharge air temperature into a zone.
   * Called each simulation tick by App.jsx's tick driver, after
   * AHU44NewController.recalculate() has run for the current tick.
   * @param {string} zoneId
   * @param {number} dischargeAirTemp - °F, from AHU44NewController.getState().supplyAirTemp
   */
  function updateDischargeAirTemp(zoneId, dischargeAirTemp) {
    var state = zoneStates[zoneId];
    if (!state || typeof dischargeAirTemp !== 'number') return;
    state.dischargeAirTemp = dischargeAirTemp;
    recalculate(zoneId);
  }

  function subscribe(zoneId, callback) {
    if (!subscribers[zoneId]) return function() {};
    subscribers[zoneId].push(callback);
    try { callback(zoneStates[zoneId]); } catch (e) {}
    return function unsubscribe() {
      subscribers[zoneId] = subscribers[zoneId].filter(function(cb) { return cb !== callback; });
    };
  }

  /**
   * Reset all zones to default state. For tests / scenario changes.
   */
  function reset() {
    ZONES.forEach(function(z) {
      zoneStates[z.id] = defaultState();
      zoneModes[z.id] = {};
    });
  }

  // Initial calculation for every zone
  ZONES.forEach(function(z) { recalculate(z.id); });

  // ─── Expose ─────────────────────────────────────────────────────────────────

  window.VAVController = {
    getState: getState,
    setValue: setValue,
    subscribe: subscribe,
    recalculate: recalculate,
    updateDischargeAirTemp: updateDischargeAirTemp,
    getModes: getModes,
    getZoneIds: getZoneIds,
    getZoneInfo: getZoneInfo,
    reset: reset,
    REHEAT_MAX_RISE: REHEAT_MAX_RISE
  };

})();
