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
 * │ Minimum Position 50% → OA damper floor (meeting-room ASHRAE 62.1 req.)   │
 * │ CO₂ > setpoint       → OA damper increases above minimum                  │
 * │ Fan Speed %          → CFM = fan speed × design CFM (9200) / 100          │
 * │ Interlock ON         → Related equipment interlocked                      │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Key structural difference from AHU-4-4: the OA_DAMPER_FLOOR is 50%,
 * not 20%. Meeting rooms require significantly more fresh air per ASHRAE 62.1
 * than pre-function/ballroom spaces (higher design occupancy density), so the
 * configured minimum OA damper position is well above AHU-4-4's. At 50%
 * minimum and 9,200 CFM design, the base-case OA delivery is ~4,600 CFM,
 * matching the SOO's own 4,500 CFM minOAAirflowSetpoint (4,500/9,000 CFM
 * min/max = exactly 50%). This makes the M-04 ventilation shortfall fault
 * pedagogically distinct: a damper stuck at, say, 10% on this unit starves
 * a much larger fraction of required fresh air than the same fault would
 * on AHU-4-4.
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

  // OA damper minimum position — 50% per the SOO's own min/max CFM table.
  // "AHU-4-3 / RF-4-6: Sequence of Operation" states AHU-4-6's minimum/
  // maximum CFM setpoints as 4,500/9,000 CFM = exactly 50%. The previously
  // hardcoded 60% didn't match that table (or minOAAirflowSetpoint, which
  // was already 4,500 CFM) — see SCENARIO_TRACKING.md item #14.
  var OA_DAMPER_FLOOR = 50;

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

  // Economizer (free-cooling) enable/disable hysteresis — SOO "AHU-4-3 /
  // RF-4-6: Sequence of Operation", Closed Loop Controller #2 item 4d-e
  // (AUTO mode): enable free cooling when OA enthalpy is well below return
  // air's AND OAT is above a floor; disable when OA enthalpy approaches
  // return air's OR OAT drops below a lower floor. The asymmetric enthalpy
  // deltas (5.0 to enable vs 2.5 to disable) and the 3°F gap between the
  // OAT enable/disable thresholds (38°F/35°F) are both hysteresis
  // deadbands, same pattern as the freeze pump above — they stop the
  // economizer from chattering as conditions drift near the boundary.
  // SCENARIO_TRACKING.md item #5.
  var RETURN_AIR_ENTHALPY = 26.7;      // BTU/lb — approx. enthalpy at 72.1°F/50% RH
                                        // (SOO Closed Loop Controller #4 item 1: RA RH held at 50%)
  var ECONOMIZER_ENABLE_ENTHALPY_DELTA = 5.0;   // BTU/lb below RA enthalpy
  var ECONOMIZER_DISABLE_ENTHALPY_DELTA = 2.5;  // BTU/lb below RA enthalpy
  var ECONOMIZER_OAT_ENABLE = 38;      // °F
  var ECONOMIZER_OAT_DISABLE = 35;     // °F

  // Minimum plenum temperature reset — SOO Closed Loop Controller #1 item 2:
  // linear reset between (60°F OAT → 40°F floor) and (40°F OAT → 50°F
  // floor), clamped outside that OAT range per General Automatic Control
  // Sequences #6 ("output of the reset schedules should be limited between
  // maximum and minimum values"). SCENARIO_TRACKING.md item #6.
  var PLENUM_RESET_OAT_HIGH = 60;   // °F — floor pins to PLENUM_RESET_MIN above this
  var PLENUM_RESET_OAT_LOW = 40;    // °F — floor pins to PLENUM_RESET_MAX below this
  var PLENUM_RESET_MIN = 40;        // °F
  var PLENUM_RESET_MAX = 50;        // °F

  // CO2 sensor simulation (SCENARIO_TRACKING.md #25a) — steady-state
  // ventilation dilution, computed instantaneously each recalculate() the
  // same way every other reading in this file is (no time-integrated
  // occupancy model). Falls toward an outdoor baseline as OA delivery
  // approaches/exceeds the design minimum; rises toward a design-occupied
  // ceiling as OA delivery is starved (low damper position, or the fan off
  // delivering zero OA at all).
  var CO2_OUTDOOR_BASELINE = 450;      // ppm — typical outdoor reference
  var CO2_DESIGN_OCCUPIED_CEILING = 1200; // ppm — design-occupied, ~zero OA delivery

  // Plant-level "global condition" readings (SCENARIO_TRACKING.md #25c/#25d)
  // — simple load/weather-based reset, not a full plant model. Both are
  // tied to oaTemperature (already TMY3-driven) as a proxy for building
  // cooling load.
  var CHW_SUPPLY_MIN = 40;   // °F — plant low limit
  var CHW_SUPPLY_MAX = 48;   // °F — reset-up ceiling on mild/cold days
  var CW_SUPPLY_MIN = 65;    // °F — condenser water floor (tower bypass/minimum)
  var CW_SUPPLY_MAX = 85;    // °F — condenser water ceiling (design max entering condenser temp)

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
    economizerMinPosition: 50,        // % — OA damper floor (meeting room requirement, 50% per SOO min/max CFM table)
    minPositionFanSpeedLock: 5,       // %
    economizerTempControlSP: 58.0,    // °F
    co2Sensor: 479,                   // PPM (from screenshot)
    co2Setpoint: 900,                 // PPM
    minOAAirflowSetpoint: 4500,       // CFM (from screenshot: 4500 CFM)
    fanTrackMode: 'CFM',
    fanSpeedSetpoint: 75,             // %
    fireAlarmShutdown: false,
    fireAlarmSmokePurge: false,
    supplyFanVFDBypass: false,        // SOO General Automatic Control Sequences #16
    returnFanVFDBypass: false,        // (VFD-in-bypass alarm) — SCENARIO_TRACKING.md item #7
    interlockOn: true,
    exhaustFanOn: true,
    commonDamperOpen: true,
    freezePumpOn: true,

    // ═══ OUTPUTS (calculated — READ-ONLY on diagram) ═══════════════════════
    fanRunning: true,
    fanSpeed: 75,
    cfm: 6901,                        // Supply air CFM (75% × 9200 ≈ 6900)
    oaCFM: 4500,                      // OA CFM at 50% minimum (= minOAAirflowSetpoint)
    oaDamperPosition: 50,             // % (at minimum position)
    economizerActive: false,
    phtValvePosition: 0,              // %
    chwValvePosition: 38,             // % (from screenshot: 38%)
    supplyAirTemp: 59.9,              // °F (from screenshot)
    preheatTemp: 81.6,                // °F — after preheat coil (= OAT when no heating)
    mixedAirTemp: 73.6,               // °F (from screenshot)
    returnAirTemp: 72.1,              // °F (from screenshot)
    supplyAirRH: 72.3,                // %RH — renamed from supplyStaticPressure (SCENARIO_TRACKING.md
                                       // item #25b); it was never static pressure, always supply air %RH
    chwSupplyTemp: 41.9,              // °F — plant global condition, reset with load (see CHW_SUPPLY_MIN/MAX)
    cwSupplyTemp: 77.7,               // °F — plant global condition, follows OAT (see CW_SUPPLY_MIN/MAX)
    phtValveStatus: 'OFF',
    chwValveStatus: 'ON',
    supplyFanStatus: 'ON',
    returnFanStatus: 'ON',
    exhaustDamperPct: 50,             // % (follows OA damper)
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

    // 0.5 MINIMUM PLENUM TEMPERATURE RESET (SOO Closed Loop Controller #1
    // item 2 — "The Minimum Plenum loop shall be active at all times")
    // Colder OAT means more preheat margin is needed to protect the coil
    // and piping, hence a HIGHER minimum floor as OAT drops — the opposite
    // direction of a comfort setpoint reset. Was previously a static 40°F
    // regardless of OAT. Runs independent of fan status, same as the
    // freeze pump above (and per its own "active at all times" language).
    // Respects Manual override via the sidebar's "Active Minimum Setpoint" row.
    if (modes.plenumMinSetpoint !== 'Manual') {
      var plenumReset = PLENUM_RESET_MIN +
        (PLENUM_RESET_OAT_HIGH - state.oaTemperature) / (PLENUM_RESET_OAT_HIGH - PLENUM_RESET_OAT_LOW) *
        (PLENUM_RESET_MAX - PLENUM_RESET_MIN);
      state.plenumMinSetpoint = Math.round(
        Math.max(PLENUM_RESET_MIN, Math.min(PLENUM_RESET_MAX, plenumReset)) * 10
      ) / 10;
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
      // SOO General Automatic Control Sequences #16: "For each variable
      // speed motor an alarm shall be annunciated at the BAS whenever the
      // drive is placed in bypass." In bypass the VFD is out of the
      // control loop entirely — the motor runs across-the-line at full,
      // uncontrolled speed rather than tracking fanSpeedSetpoint. See M-05
      // in AHU46FaultEngine.js (SCENARIO_TRACKING.md item #7).
      state.fanSpeed = state.supplyFanVFDBypass ? 100 : state.fanSpeedSetpoint;
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

    // 1.6 ECONOMIZER ENTHALPY/OAT HYSTERESIS (SOO Closed Loop Controller #2
    // item 4d-e, AUTO mode) — was a pure manual toggle. Enable free cooling
    // when OA enthalpy is favorably below return air's (5.0 BTU/lb margin)
    // AND OAT is above the enable floor (38°F); disable when OA enthalpy is
    // no longer favorable (within 2.5 BTU/lb of return air's) OR OAT drops
    // below the disable floor (35°F). Between those, hold last commanded
    // state — same hysteresis-deadband pattern as the freeze pump above.
    // Still respects Manual override via the "Enthalpy OK — Economizer"
    // sidebar toggle.
    if (modes.enthalpyOKForEconomizer !== 'Manual') {
      var enthalpyFavorable = state.oaEnthalpy < (RETURN_AIR_ENTHALPY - ECONOMIZER_ENABLE_ENTHALPY_DELTA);
      var enthalpyUnfavorable = state.oaEnthalpy > (RETURN_AIR_ENTHALPY - ECONOMIZER_DISABLE_ENTHALPY_DELTA);
      var oatAboveEnableFloor = state.oaTemperature > ECONOMIZER_OAT_ENABLE;
      var oatBelowDisableFloor = state.oaTemperature < ECONOMIZER_OAT_DISABLE;

      if (enthalpyFavorable && oatAboveEnableFloor) {
        state.enthalpyOKForEconomizer = true;
      } else if (enthalpyUnfavorable || oatBelowDisableFloor) {
        state.enthalpyOKForEconomizer = false;
      }
      // else: inside the deadband on one or both axes — hold last state.
    }

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
          // At 50% minimum, the floor is the design requirement — not 20% like AHU-4-4
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

    // 5. CO2 SENSOR (SCENARIO_TRACKING.md #25a) — was frozen at its
    // screenshot value forever; ties to the AHU's own ventilation rate.
    // Respects Manual override the same way oaDamperPosition does (it's
    // editable from the Controls Sidebar as "Controlling CO2 Sensor").
    if (modes.co2Sensor !== 'Manual') {
      var ventilationRatio = state.fanRunning
        ? Math.min(1, state.oaCFM / state.minOAAirflowSetpoint)
        : 0;
      state.co2Sensor = Math.round(
        CO2_DESIGN_OCCUPIED_CEILING - ventilationRatio * (CO2_DESIGN_OCCUPIED_CEILING - CO2_OUTDOOR_BASELINE)
      );
    }

    // 6. SUPPLY AIR %RH (SCENARIO_TRACKING.md #25b, renamed from
    // supplyStaticPressure — see item #9) — ties to whichever coil is
    // actively conditioning the air: an active cooling coil pushes supply
    // air toward saturation (condensing moisture off a wet coil), an
    // active heating coil dries it out; idle holds a neutral baseline.
    if (state.chwValvePosition > 0) {
      state.supplyAirRH = 55 + (state.chwValvePosition / 100) * (90 - 55);
    } else if (state.phtValvePosition > 0) {
      state.supplyAirRH = 55 - (state.phtValvePosition / 100) * (55 - 25);
    } else {
      state.supplyAirRH = 55;
    }
    state.supplyAirRH = Math.round(state.supplyAirRH * 10) / 10;

    // 7. PLANT-LEVEL CONDITIONS (SCENARIO_TRACKING.md #25c/#25d) — chilled
    // water and condenser water supply temps, previously frozen at their
    // screenshot values. Simple weather/load-based reset (not a full plant
    // model): CHW resets colder as OAT (a proxy for building load) rises;
    // CW follows OAT directly, as a cooling tower's output does.
    var chwLoadFraction = Math.max(0, Math.min(1, (state.oaTemperature - 40) / 55));
    state.chwSupplyTemp = Math.round(
      (CHW_SUPPLY_MAX - chwLoadFraction * (CHW_SUPPLY_MAX - CHW_SUPPLY_MIN)) * 10
    ) / 10;
    state.cwSupplyTemp = Math.round(
      Math.max(CW_SUPPLY_MIN, Math.min(CW_SUPPLY_MAX, state.oaTemperature - 3.9)) * 10
    ) / 10;

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
