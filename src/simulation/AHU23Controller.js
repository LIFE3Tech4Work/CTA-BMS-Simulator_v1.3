/**
 * AHU23Controller.js — Control logic engine for AHU-23-1
 *
 * Implements realistic BMS control sequences connecting operator setpoints
 * (Controls Sidebar) to calculated output values (Diagram Hotspots).
 *
 * Engineering Relationships:
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │ Run Schedule On/Off  → Fan ON/OFF status + CFM display                    │
 * │ Cooling Coil SP      → Modulates CHW valve % to maintain SAT              │
 * │ Heating Coil SP      → Modulates PHT valve %                              │
 * │ OAT + Enthalpy OK    → Determines if economizer active (OA damper > min)  │
 * │ Minimum Position 20% → OA damper floor                                    │
 * │ CO₂ > setpoint       → OA damper increases above minimum                  │
 * │ Fan Speed %          → CFM = fan speed × design CFM (16500) / 100         │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Data flow:
 *   Controls Sidebar (WRITES) → window.AHU23State → Image Overlay (READS)
 *
 * The sidebar calls window.AHU23Controller.setValue() which mutates the shared
 * state, runs the engineering recalculation, and notifies all subscribers.
 * The image overlay subscribes and displays READ-ONLY hotspot values.
 *
 * Exposed as:
 *   window.AHU23Controller — public API { getState, setValue, subscribe, recalculate }
 *   window.AHU23State      — shared state object (read by overlay, written by controller)
 */

(function() {
  'use strict';

  // ─── Design Constants ───────────────────────────────────────────────────────

  var DESIGN_CFM = 16500;          // Rated max airflow at 100% fan speed
  var RETURN_AIR_TEMP = 72;        // Assumed return air temperature (°F)
  var OA_DAMPER_FLOOR = 20;        // Minimum damper position (%) per ASHRAE 62.1

  // ─── Shared State Object ────────────────────────────────────────────────────
  // This is THE single source of truth. The Controls Sidebar writes inputs,
  // the controller recalculates outputs, and the Image Overlay reads outputs.

  var state = {
    // ═══ INPUTS (editable from Controls Sidebar) ═══════════════════════════════
    runSchedule: true,             // Schedule: On/Off → drives fan status
    systemStarting: false,
    startingTimeSetpoint: 240,     // seconds
    coolingCoilSetpoint: 60.0,     // °F — target SAT for CHW valve modulation
    heatingCoilSetpoint: 55.0,     // °F — target SAT for PHT valve modulation
    plenumMinSetpoint: 40.0,       // °F — freeze protection threshold
    oaTemperature: 83.4,           // °F — outside air temperature
    oaEnthalpy: 32.0,             // BTU/lb — outside air enthalpy
    lowOATLockout: false,          // Low OAT lockout active
    enthalpyOKForEconomizer: false, // Enthalpy permits economizer (OAT + Enthalpy OK)
    economizerMinPosition: 20,     // % — OA damper floor (minimum position)
    minPositionFanSpeedLock: 5,    // %
    economizerTempControlSP: 58.0, // °F — economizer changeover temperature
    co2Sensor: 538,                // PPM — measured CO₂ level
    co2Setpoint: 900,              // PPM — CO₂ control setpoint
    minOAAirflowSetpoint: 4900,    // CFM
    fanTrackMode: 'CFM',
    fireAlarmShutdown: false,
    fireAlarmSmokePurge: false,
    fanSpeedSetpoint: 75,          // % — operator fan speed command

    // ═══ OUTPUTS (calculated — READ-ONLY on diagram hotspots) ═════════════════
    fanRunning: true,              // Fan ON/OFF status
    fanSpeed: 75,                  // % actual speed
    cfm: 12375,                    // Actual airflow (fanSpeed × DESIGN_CFM / 100)
    oaDamperPosition: 20,          // % — actual damper position
    economizerActive: false,       // Whether economizer mode is active
    phtValvePosition: 0,           // % — preheat valve command
    chwValvePosition: 0,           // % — chilled water valve command
    supplyAirTemp: 60.0,           // °F — supply air temp (after CHW coil)
    preheatTemp: 83.4,             // °F — temp after preheat coil (TS-1)
    mixedAirTemp: 72.0,            // °F — mixed air before coils
    phtValveStatus: 'OFF',         // V-1 valve label
    chwValveStatus: 'OFF',         // V-2 valve label
  };

  // Expose shared state object on window for read access by overlay
  window.AHU23State = state;

  var subscribers = [];

  // ─── Engineering Calculations ───────────────────────────────────────────────

  /**
   * Run the control sequences, then re-assert every Manual override on top of
   * the result. Callers keep calling recalculate() exactly as before.
   */
  // Outputs a safety sequence drives directly. v1.3 lets the program win over an
  // operator hold in these cases — with the fan off the dampers close (SOO System
  // Off #1) whatever the operator commanded — so the override yields while the
  // condition is active and resumes when it clears. The Manual flag is kept
  // throughout, so the point still reads as overridden.
  var SAFETY_DRIVEN_KEYS = {
    oaDamperPosition: true, oaCFM: true, cfm: true, fanSpeed: true,
    returnFanCFM: true, returnCFM: true, economizerActive: true,
    exhaustDamperPct: true, returnAirDamperPosition: true, spillDamperPosition: true,
  };

  function safetyOverridesOperator() {
    return state.fanRunning === false ||
           state.hardSafetyShutdown === true ||
           state.freezestatShutdown === true ||
           state.fireAlarmShutdown === true;
  }

  function recalculate() {
    computeSequences();
    if (!manualValues) return;
    // computeSequences() notifies subscribers from inside the pass, i.e. BEFORE
    // the overrides go back on — so the UI would render the sequence's value
    // and a commanded point looked like it never took. Re-notify when an
    // override actually changed something so what is displayed is what the
    // point reports.
    var safety = safetyOverridesOperator();
    var overrode = false;
    for (var mk in manualValues) {
      if (!Object.prototype.hasOwnProperty.call(manualValues, mk)) continue;
      if (!state.hasOwnProperty(mk)) continue;
      if (safety && SAFETY_DRIVEN_KEYS[mk]) continue;
      if (state[mk] !== manualValues[mk]) { state[mk] = manualValues[mk]; overrode = true; }
    }
    if (overrode && typeof notifySubscribers === 'function') notifySubscribers();
  }

  function computeSequences() {

    // ──────────────────────────────────────────────────────────────────────────
    // 1. FAN LOGIC: Run Schedule On/Off → Fan ON/OFF status + CFM display
    //    Fan Speed % → CFM calculation (fan speed × design CFM / 100)
    // ──────────────────────────────────────────────────────────────────────────
    if (state.fireAlarmShutdown || !state.runSchedule) {
      state.fanRunning = false;
      state.fanSpeed = 0;
      state.cfm = 0;
    } else {
      state.fanRunning = true;
      state.fanSpeed = Math.round(Math.max(state.minPositionFanSpeedLock, Math.min(100, state.fanSpeedSetpoint)));
      state.cfm = Math.round(DESIGN_CFM * state.fanSpeed / 100);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. ECONOMIZER LOGIC: OAT + Enthalpy OK → economizer active
    //    Minimum Position (20%) → OA damper floor
    //    CO₂ > setpoint → OA damper increases above minimum
    // ──────────────────────────────────────────────────────────────────────────
    state.economizerActive = false;

    if (state.fanRunning) {
      // Unlike AHU-4-6/4-4, this unit's economizer block had no manual-mode
      // guard at all — an operator override on the OA damper was overwritten
      // on the very next tick regardless of starting/running state.
      var oaDamperManual = modes.oaDamperPosition === 'Manual';

      if (!oaDamperManual) {
        // Economizer activates when ALL conditions are met:
        // - OAT is below economizer changeover setpoint (free cooling available)
        // - Enthalpy is OK (outdoor air is dry enough)
        // - Low OAT lockout is NOT active (not too cold to use 100% OA)
        if (state.oaTemperature < state.economizerTempControlSP &&
            state.enthalpyOKForEconomizer &&
            !state.lowOATLockout) {
          state.economizerActive = true;
          // Full economizer: damper opens to 100% for maximum free cooling
          state.oaDamperPosition = 100;
        } else {
          // No economizer: damper sits at minimum position floor
          state.oaDamperPosition = Math.max(state.economizerMinPosition, OA_DAMPER_FLOOR);
        }

        // CO₂ Demand-Controlled Ventilation (DCV) override
        // When CO₂ exceeds setpoint, increase OA damper above minimum to bring
        // in more fresh air — proportional to excess CO₂
        if (state.co2Sensor > state.co2Setpoint && !state.economizerActive) {
          var co2Excess = state.co2Sensor - state.co2Setpoint;
          // Proportional gain: every 5 PPM over setpoint = 1% more damper
          var co2DamperCommand = Math.min(100, state.economizerMinPosition + (co2Excess / 5));
          state.oaDamperPosition = Math.round(co2DamperCommand);
        }
      }
      // else: Manual hold — program yields authority (same as AHU-4-6/4-4)
    } else {
      // Fan off: damper closed
      state.oaDamperPosition = 0;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. HEATING LOGIC: Heating Coil Active Setpoint → modulates PHT valve %
    //    PHT valve opens proportionally when OAT is below heating setpoint
    // ──────────────────────────────────────────────────────────────────────────
    if (state.fanRunning) {
      if (state.oaTemperature < state.heatingCoilSetpoint) {
        // Error = how far below setpoint the OA temp is
        var heatError = state.heatingCoilSetpoint - state.oaTemperature;
        // Proportional gain: 5% valve per 1°F below setpoint
        state.phtValvePosition = Math.min(100, Math.round(heatError * 5));
        state.phtValveStatus = 'ON';
        // Preheat coil raises air temp toward setpoint
        state.preheatTemp = state.oaTemperature +
          (state.phtValvePosition / 100) * (state.heatingCoilSetpoint - state.oaTemperature + 20);
      } else {
        state.phtValvePosition = 0;
        state.phtValveStatus = 'OFF';
        state.preheatTemp = state.oaTemperature;
      }

      // Freeze protection: if preheat discharge < plenum min, force valve open
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

    // ──────────────────────────────────────────────────────────────────────────
    // 4. COOLING LOGIC: Cooling Coil Active Setpoint → modulates CHW valve %
    //    CHW valve opens to maintain Supply Air Temp at cooling setpoint
    // ──────────────────────────────────────────────────────────────────────────
    if (state.fanRunning) {
      // Calculate mixed air temperature (OA + Return air blend)
      var oaFraction = state.oaDamperPosition / 100;
      state.mixedAirTemp = Math.round(
        (state.preheatTemp * oaFraction + RETURN_AIR_TEMP * (1 - oaFraction)) * 10
      ) / 10;

      if (state.mixedAirTemp > state.coolingCoilSetpoint) {
        // Need cooling: modulate CHW valve proportional to error
        var coolError = state.mixedAirTemp - state.coolingCoilSetpoint;
        // Gain: 8% valve per 1°F above cooling setpoint
        state.chwValvePosition = Math.min(100, Math.round(coolError * 8));
        state.chwValveStatus = 'ON';
        // SAT = mixed air temp reduced by cooling coil effect
        state.supplyAirTemp = state.mixedAirTemp -
          (state.chwValvePosition / 100) * (state.mixedAirTemp - state.coolingCoilSetpoint);
      } else {
        // No cooling needed: valve closed, SAT = mixed air temp
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

    // Round output temperatures to 1 decimal
    state.supplyAirTemp = Math.round(state.supplyAirTemp * 10) / 10;
    state.preheatTemp = Math.round(state.preheatTemp * 10) / 10;
    state.mixedAirTemp = Math.round(state.mixedAirTemp * 10) / 10;

    // Notify all subscribers (overlay, sidebar read-only rows, etc.)
    notifySubscribers();
  }

  function notifySubscribers() {
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](state); } catch(e) {}
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  function getState() {
    // Return a shallow copy so consumers can't accidentally mutate internal state
    return Object.assign({}, state);
  }

  // Tracks which state keys the operator has manually overridden — same shape
  // and semantics as AHU44NewController/AHU46Controller's `modes`. Added so the
  // point-detail dialog can show and release overrides on this unit too;
  // setValue()'s existing behaviour is unchanged apart from recording the flag.
  var modes = {};

  // Operator-commanded values for every key currently in Manual. A real BMS
  // point override sits at priority 8 and OUTRANKS the control program: the
  // sequence still computes its own answer each pass, but the override is what
  // the point reports until it is released. recalculate() re-applies these
  // after every pass, which is what makes a commanded value actually hold —
  // previously only a handful of keys were spared by their own
  // "modes.X !== 'Manual'" guards and everything else was recomputed straight
  // back over the operator's value.
  var manualValues = {};

  // The value each overridden key held before the operator took it. Releasing
  // to Auto restores it, so a key the sequence does not recompute (a mode, a
  // config flag, a field-condition boolean) comes back to what it was instead
  // of being stuck at the commanded value forever.
  var autoValues = {};

  function setValue(key, value) {
    if (state.hasOwnProperty(key)) {
      if (!Object.prototype.hasOwnProperty.call(manualValues, key)) autoValues[key] = state[key];
      state[key] = value;
      modes[key] = 'Manual';
      manualValues[key] = value;
      recalculate();
    }
  }

  function getModes() {
    return Object.assign({}, modes);
  }

  /* Release ONE key's Manual override back to Auto. */
  function clearMode(key) {
    if (modes[key] || Object.prototype.hasOwnProperty.call(manualValues, key)) {
      delete modes[key];
      delete manualValues[key];
      if (Object.prototype.hasOwnProperty.call(autoValues, key)) {
        state[key] = autoValues[key];
        delete autoValues[key];
      }
      recalculate();
    }
  }

  function subscribe(callback) {
    subscribers.push(callback);
    // Immediately notify with current state so subscriber initializes correctly
    try { callback(state); } catch(e) {}
    return function unsubscribe() {
      subscribers = subscribers.filter(function(cb) { return cb !== callback; });
    };
  }

  /**
   * Push live TMY3 weather into the controller for the current simulation
   * tick. Yields to a manual override so a hand-set outdoor condition holds
   * (same pattern as AHU46Controller/AHU44NewController). Previously this
   * unit had no TMY3 wiring at all — oaTemperature/oaEnthalpy were static
   * seed values that never moved with the simulation clock.
   *
   * @param {number} row - current simulation row (1-indexed)
   * @param {number} fraction - interpolation fraction between row and row+1 (0-1)
   */
  function updateFromTMY3(row, fraction) {
    if (!window.TMY3Projector || !window.TMY3Projector.interpolateWeather) return;

    var weather = window.TMY3Projector.interpolateWeather(row, fraction);
    if (!weather) return;

    if (modes.oaTemperature !== 'Manual') state.oaTemperature = weather.dryBulb;
    if (modes.oaEnthalpy !== 'Manual') state.oaEnthalpy = weather.enthalpy;
    recalculate();
  }

  // Initial calculation on load
  recalculate();

  // ─── Expose on window ───────────────────────────────────────────────────────

  window.AHU23Controller = {
    getState: getState,
    setValue: setValue,
    getModes: getModes,
    clearMode: clearMode,
    subscribe: subscribe,
    recalculate: recalculate,
    updateFromTMY3: updateFromTMY3,
  };

})();
