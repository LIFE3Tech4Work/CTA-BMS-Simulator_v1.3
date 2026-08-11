/**
 * AHU46Controller.js — Control logic engine for AHU-4-6
 *
 * Implements reactive BMS control sequences for the Meeting Room 2nd Level
 * AHU (based on the Honeywell SymmetrE TecSystems screenshot, AHU-04-06.htm,
 * captured 12-Jun-26 13:02:30).
 *
 * Service:  Meeting Room 2nd Level
 * Location: Level 4
 *
 * Engineering Relationships:
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ Run Schedule On/Off  → Fan ON/OFF status + CFM display                    │
 * │ Cooling Coil SP      → Modulates CHW valve % to maintain SAT              │
 * │ Heating Coil SP      → Modulates PHT valve %                              │
 * │ OAT + Enthalpy OK    → Determines if economizer active (OA damper > min)  │
 * │ Minimum Position 60% → OA damper floor (meeting-room ASHRAE 62.1 req.)   │
 * │ CO₂ > setpoint       → OA damper increases above minimum                  │
 * │ Fan Speed %          → CFM = fan speed × design CFM (9200) / 100          │
 * │ Interlock ON         → Related equipment interlocked                      │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Key structural difference from AHU-4-4: the OA_DAMPER_FLOOR is 60%,
 * not 20%. Meeting rooms require significantly more fresh air per ASHRAE 62.1
 * than pre-function/ballroom spaces (higher design occupancy density), so the
 * configured minimum OA damper position is three times higher. At 60% minimum
 * and 9,200 CFM design, the base-case OA delivery is ~5,520 CFM — more than
 * the total supply of many smaller AHUs. This makes the N-04 ventilation
 * shortfall fault pedagogically distinct: a damper stuck at, say, 10% on
 * this unit starves a much larger fraction of required fresh air than the
 * same fault would on AHU-4-4.
 *
 * oaDamperPosition is a true Manual-able output (same as AHU-4-4):
 * once set via setValue('oaDamperPosition', ...), recalculate() holds that
 * value instead of recomputing from the economizer/CO₂ DCV sequence.
 *
 * Exposed as:
 *   window.AHU46Controller — public API { getState, setValue, subscribe, recalculate, updateFromTMY3, getModes }
 *   window.AHU46State      — shared state object (read by graphic overlay)
 */

(function() {
  'use strict';

  // ─── Design Constants ───────────────────────────────────────────────────────

  // Calibrated so 75% fan speed × 9200 ≈ 6900 CFM, matching the
  // screenshot's live supply fan reading (6901 CFM at 47 Hz ≈ 75% speed).
  var DESIGN_CFM = 9200;

  // Return air temperature — meeting room occupants tend to run warmer
  // than ballroom/pre-function, but the screenshot shows 72.1°F return air.
  var RETURN_AIR_TEMP = 72.1;

  // OA damper minimum position — 60% per ASHRAE 62.1 for this meeting-room
  // occupancy category. Confirmed from both AHU-4-6 screenshots (repo image
  // shows 60%; new screenshot shows 45%, which was a temporary operator
  // setback; 60% is the design value and primary teaching reference).
  var OA_DAMPER_FLOOR = 60;

  // Freeze protection pump start/stop thresholds — SOO "AHU-4-3 / RF-4-6:
  // Sequence of Operation", General Automatic Control Sequences item 5:
  // "The hot water freeze protection pump shall be started automatically
  // upon outside air temperature falling below 35°F (adjustable). The hot
  // water freeze protection pump shall be stopped automatically upon
  // outside air temperature rising above 40°F (adjustable)." The 5°F gap
  // between these two values is a hysteresis deadband, not a typo — it
  // stops the pump from short-cycling on/off as OAT drifts back and forth
  // across a single threshold.
  var FREEZE_PUMP_START_TEMP = 35;
  var FREEZE_PUMP_STOP_TEMP = 40;

  // ─── Shared State Object ────────────────────────────────────────────────────

  var state = {
    // ═══ INPUTS (editable from Controls Sidebar) ════════════════════════════
    runSchedule: true,
    systemStarting: false,
    startingTimeSetpoint: 120,        // seconds (from screenshot: 120 SEC)
    startingTimeLeft: 0,
    coolingCoilSetpoint: 60.0,        // °F
    heatingCoilSetpoint: 55.0,        // °F
    plenumMinSetpoint: 40.0,          // °F — freeze protection
    oaTemperature: 81.6,              // °F — TMY3-driven; see WEATHER_DRIVEN_KEYS
    lowOATLockout: false,
    oaEnthalpy: 35.1,                 // BTU/lb — TMY3-driven; see WEATHER_DRIVEN_KEYS
    enthalpyOKForEconomizer: false,
    economizerMinPosition: 60,        // % — OA damper floor (meeting room requirement)
    minPositionFanSpeedLock: 5,       // %
    economizerTempControlSP: 58.0,    // °F
    co2Sensor: 479,                   // PPM (from screenshot)
    co2Setpoint: 900,                 // PPM
    minOAAirflowSetpoint: 4500,       // CFM (from screenshot: 4500 CFM)
    fanTrackMode: 'CFM',
    fanSpeedSetpoint: 75,             // %
    fireAlarmShutdown: false,
    fireAlarmSmokePurge: false,
    interlockOn: true,
    exhaustFanOn: true,
    commonDamperOpen: true,
    freezePumpOn: true,

    // ═══ OUTPUTS (calculated — READ-ONLY on diagram) ═══════════════════════
    fanRunning: true,
    fanSpeed: 75,
    cfm: 6901,                        // Supply air CFM (75% × 9200 ≈ 6900)
    oaCFM: 5520,                      // OA CFM at 60% minimum (60% × minOA basis)
    oaDamperPosition: 60,             // % (at minimum position)
    economizerActive: false,
    phtValvePosition: 0,              // %
    chwValvePosition: 38,             // % (from screenshot: 38%)
    supplyAirTemp: 59.9,              // °F (from screenshot)
    preheatTemp: 81.6,                // °F — after preheat coil (= OAT when no heating)
    mixedAirTemp: 73.6,               // °F (from screenshot)
    returnAirTemp: 72.1,              // °F (from screenshot)
    supplyStaticPressure: 72.3,       // %RH (mislabeled as static in code; actual = supply air %RH)
    chwSupplyTemp: 41.9,              // °F (from screenshot global status bar)
    cwSupplyTemp: 77.7,               // °F (from screenshot global status bar)
    phtValveStatus: 'OFF',
    chwValveStatus: 'ON',
    supplyFanStatus: 'ON',
    returnFanStatus: 'ON',
    exhaustDamperPct: 60,             // % (follows OA damper)
  };

  window.AHU46State = state;

  var subscribers = [];

  // Tracks which state keys have been manually overridden via the Controls
  // Sidebar. Same pattern as AHU44NewController.js — only keys actually
  // passed to setValue() appear here. oaDamperPosition is the one output
  // field that can also be flagged Manual (see file header).
  var modes = {};

  // ─── Engineering Calculations ───────────────────────────────────────────────

  function recalculate() {

    // 0. FREEZE PROTECTION PUMP (SOO General Automatic Control Sequences #5)
    // Runs independent of fan status — this protects the hot water coil and
    // piping from freezing, not the supply air being conditioned, so it
    // must not depend on whether the AHU itself is running. Implemented as
    // a hysteresis: below 35°F the pump is forced on, above 40°F it's
    // forced off, and inside the 35–40°F gap it holds its last commanded
    // state rather than chattering on every recalculate() tick as OAT
    // drifts through the deadband. Respects Manual override the same way
    // oaDamperPosition does, in case a future UI exposes a toggle for it —
    // today's Controls Sidebar doesn't, so this is effectively always
    // automatic in practice.
    if (modes.freezePumpOn !== 'Manual') {
      if (state.oaTemperature < FREEZE_PUMP_START_TEMP) {
        state.freezePumpOn = true;
      } else if (state.oaTemperature > FREEZE_PUMP_STOP_TEMP) {
        state.freezePumpOn = false;
      }
      // else: within the deadband — hold last state, no change.
    }

    // 1. FAN LOGIC
    if (state.fireAlarmShutdown || !state.runSchedule) {
      state.fanRunning = false;
      state.fanSpeed = 0;
      state.cfm = 0;
      state.oaCFM = 0;
      state.supplyFanStatus = 'OFF';
      state.returnFanStatus = 'OFF';
    } else {
      state.fanRunning = true;
      state.fanSpeed = state.fanSpeedSetpoint;
      state.cfm = Math.round(DESIGN_CFM * state.fanSpeed / 100);
      state.supplyFanStatus = 'ON';
      state.returnFanStatus = 'ON';
    }

    // 1.5 FAN INTERLOCK CHAIN (SOO System Start #1-2, General #2)
    // "Safety devices shall be hardwired interlocked with 'hand' and
    // 'automatic' positions in series with motor controller holding coil
    // circuit" (General #2), and "When the supply fan is started its
    // interlocked return fan shall also start" (System Start #1). These
    // three points were previously hardcoded `true` forever, regardless of
    // whether the unit was even running — meaning they'd stay reported as
    // "on/open" through a shutdown, a fire-alarm trip, or before the unit
    // had ever been started. They now track live fan/interlock status.
    // NOTE: the SOO's mixing-box flow diagram labels the "common damper"
    // point (DA-AK/AL, N.O. HOLD CLOSED) as applying only to AHU-4-3 and
    // AHU-4-4 — it's unclear from the documents available whether AHU-4-6
    // has an equivalent point at all, or whether it should track fan status
    // the same way. Kept simple (tied to fanRunning like the other two)
    // pending clarification, rather than guessing at different logic.
    state.interlockOn = state.fanRunning;
    state.exhaustFanOn = state.fanRunning;
    state.commonDamperOpen = state.fanRunning;

    // 2. ECONOMIZER LOGIC
    state.economizerActive = false;

    if (state.fanRunning) {
      var oaDamperManual = modes.oaDamperPosition === 'Manual';

      if (!oaDamperManual) {
        if (state.oaTemperature < state.economizerTempControlSP &&
            state.enthalpyOKForEconomizer &&
            !state.lowOATLockout) {
          state.economizerActive = true;
          state.oaDamperPosition = 100;
        } else {
          // At 60% minimum, the floor is the design requirement — not 20% like AHU-4-4
          state.oaDamperPosition = Math.max(state.economizerMinPosition, OA_DAMPER_FLOOR);
        }

        // CO₂ DCV override — raises above minimum, never below
        if (state.co2Sensor > state.co2Setpoint && !state.economizerActive) {
          var co2Excess = state.co2Sensor - state.co2Setpoint;
          var co2DamperCommand = Math.min(100, state.economizerMinPosition + (co2Excess / 5));
          state.oaDamperPosition = Math.round(co2DamperCommand);
        }
      }
      // else: Manual hold — program yields authority (same as AHU-4-4)

      state.oaCFM = Math.round(state.minOAAirflowSetpoint * (state.oaDamperPosition / state.economizerMinPosition));
      state.oaCFM = Math.min(state.oaCFM, state.cfm);
    } else {
      state.oaDamperPosition = 0;
      state.oaCFM = 0;
    }

    state.exhaustDamperPct = state.fanRunning ? state.oaDamperPosition : 0;

    // 3. HEATING LOGIC
    if (state.fanRunning) {
      if (state.oaTemperature < state.heatingCoilSetpoint) {
        var heatError = state.heatingCoilSetpoint - state.oaTemperature;
        state.phtValvePosition = Math.min(100, Math.round(heatError * 5));
        state.phtValveStatus = 'ON';
        state.preheatTemp = state.oaTemperature +
          (state.phtValvePosition / 100) * (state.heatingCoilSetpoint - state.oaTemperature + 20);
      } else {
        state.phtValvePosition = 0;
        state.phtValveStatus = 'OFF';
        state.preheatTemp = state.oaTemperature;
      }

      if (state.preheatTemp < state.plenumMinSetpoint) {
        state.phtValvePosition = 100;
        state.phtValveStatus = 'ON';
        state.preheatTemp = state.plenumMinSetpoint;
      }
    } else {
      state.phtValvePosition = 0;
      state.phtValveStatus = 'OFF';
      state.preheatTemp = state.oaTemperature;
    }

    // 4. COOLING LOGIC (Closed Loop Controller #3 — Supply Temperature
    //    Control of Cooling Coil)
    if (state.fanRunning) {
      var oaFraction = state.oaDamperPosition / 100;
      state.mixedAirTemp = Math.round(
        (state.preheatTemp * oaFraction + RETURN_AIR_TEMP * (1 - oaFraction)) * 10
      ) / 10;

      // SOO "AHU-4-3 / RF-4-6: Sequence of Operation" — General Automatic
      // Control Sequences #10: "On all systems containing both cooling and
      // heating coils (except in reheat position), the heating coil control
      // valve shall be closed whenever cooling coil is activated and vice
      // versa." When the preheat coil is already modulating — whether to
      // meet a heating call or to hold the minimum-plenum freeze-protection
      // floor (Item 2, "active at all times") — the cooling coil defers
      // rather than independently opening to trim air the heating coil just
      // warmed. Without this guard, preheat could raise mixed air toward a
      // comfort setpoint while cooling simultaneously undercut it against
      // the (typically much warmer) return-air blend — both coils fighting
      // each other and wasting energy, exactly the "simultaneous heating
      // and cooling" pattern flagged as a real-world red flag elsewhere in
      // this curriculum's BMS training material.
      if (state.phtValvePosition === 0 && state.mixedAirTemp > state.coolingCoilSetpoint) {
        var coolError = state.mixedAirTemp - state.coolingCoilSetpoint;
        state.chwValvePosition = Math.min(100, Math.round(coolError * 8));
        state.chwValveStatus = 'ON';
        state.supplyAirTemp = state.mixedAirTemp -
          (state.chwValvePosition / 100) * (state.mixedAirTemp - state.coolingCoilSetpoint);
      } else {
        state.chwValvePosition = 0;
        state.chwValveStatus = 'OFF';
        state.supplyAirTemp = state.mixedAirTemp;
      }
    } else {
      state.chwValvePosition = 0;
      state.chwValveStatus = 'OFF';
      state.mixedAirTemp = RETURN_AIR_TEMP;
      state.supplyAirTemp = state.oaTemperature;
    }

    state.supplyAirTemp = Math.round(state.supplyAirTemp * 10) / 10;
    state.preheatTemp = Math.round(state.preheatTemp * 10) / 10;
    state.mixedAirTemp = Math.round(state.mixedAirTemp * 10) / 10;
    state.returnAirTemp = RETURN_AIR_TEMP;

    notifySubscribers();
  }

  function notifySubscribers() {
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](state); } catch(e) {}
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  function getState() {
    return Object.assign({}, state);
  }

  var WEATHER_DRIVEN_KEYS = { oaTemperature: true, oaEnthalpy: true };

  function setValue(key, value) {
    if (WEATHER_DRIVEN_KEYS[key]) {
      console.warn('[AHU46Controller] "' + key + '" is TMY3-driven and cannot be set manually. Ignored.');
      return;
    }
    if (state.hasOwnProperty(key)) {
      state[key] = value;
      modes[key] = 'Manual';
      recalculate();
    }
  }

  function getModes() {
    return Object.assign({}, modes);
  }

  function updateFromTMY3(row, fraction) {
    if (!window.TMY3Projector || !window.TMY3Projector.interpolateWeather) return;
    var weather = window.TMY3Projector.interpolateWeather(row, fraction);
    if (!weather) return;
    state.oaTemperature = weather.dryBulb;
    state.oaEnthalpy = weather.enthalpy;
    recalculate();
  }

  function subscribe(callback) {
    subscribers.push(callback);
    try { callback(state); } catch(e) {}
    return function unsubscribe() {
      subscribers = subscribers.filter(function(cb) { return cb !== callback; });
    };
  }

  recalculate();

  window.AHU46Controller = {
    getState: getState,
    setValue: setValue,
    subscribe: subscribe,
    recalculate: recalculate,
    updateFromTMY3: updateFromTMY3,
    getModes: getModes,
  };

})();
