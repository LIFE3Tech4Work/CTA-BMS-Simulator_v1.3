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
  // Heat the supply fan adds by friction and motor work. Scales with speed because
  // the work does: a fan at 40% is not adding what it adds at 100%. 2 °F at full
  // speed is the usual figure for a draw-through unit with the motor in the stream.
  var FAN_HEAT_RISE_MAX = 2.0;      // °F at 100% fan speed
  var RETURN_AIR_TEMP = 72;        // Assumed return air temperature (°F)
  var OA_DAMPER_FLOOR = 20;        // Minimum damper position (%) per ASHRAE 62.1
  // Coil capacity, same figures as AHU-4-6 / 4-4 / 4-3. Valves are sized to REACH
  // the setpoint rather than driven by a proportional gain: the old law used a
  // fixed gain (5%/°F heating, 8%/°F cooling) that pinned the valve at 100% on any
  // sizeable error, and its discharge formula added a hardcoded +20 °F so the coil
  // overshot its own setpoint.
  var MAX_COIL_RISE = 30;          // °F — preheat coil capacity at 100% open
  var MAX_COIL_DROP = 30;          // °F — chilled water coil capacity at 100% open
  // Humidity model, same form and constants as AHU-4-6 and AHU-4-4/4-3 so all
  // units read alike. This unit previously had no humidity behaviour at all:
  // outdoor humidity was not received, and no return or supply %RH was computed.
  var OA_RH_WEIGHT = 0.4;          // fraction of the OA-RH gap reaching return air at full ventilation
  var DEHUMID_RH_WEIGHT = 8;       // %RH pulled down at fully-open chwValvePosition
  var RETURN_AIR_RH_MIN = 30;      // %
  var RETURN_AIR_RH_MAX = 70;      // %
  // Above this return-air humidity, running both coils is dehumidification rather
  // than the simultaneous heating/cooling fault — cool to dry, reheat to temperature.
  // Same trigger as AHU-4-6, so the paired units judge it alike. Without this flag
  // the fault banner had nothing to check and fired on legitimate operation.
  var DEHUMID_RH_TRIGGER = 52;     // %RH return air

  // ─── Shared State Object ────────────────────────────────────────────────────
  // This is THE single source of truth. The Controls Sidebar writes inputs,
  // the controller recalculates outputs, and the Image Overlay reads outputs.

  var state = {
    // ═══ INPUTS (editable from Controls Sidebar) ═══════════════════════════════
    runSchedule: true,             // Schedule: On/Off → drives fan status
    systemStarting: false,
    startingTimeSetpoint: 240,     // seconds
    coolingCoilSetpoint: 60.0,     // °F — target SAT for CHW valve modulation
    // Boiler-room space conditions. This unit had neither, so a zone reading could not
    // be shown on the board at all. Lev asked for measured temperature above its
    // setpoint here, and explicitly no CO2: the hazard in a boiler room is carbon
    // MONOXIDE, so a CO2 reading would point at the wrong thing.
    spaceTemp: 74.0,               // °F — measured room temperature
    zoneTempSetpoint: 75.0,        // °F — boiler rooms run warmer than occupied space
    heatingCoilSetpoint: 55.0,     // °F — target SAT for PHT valve modulation
    plenumMinSetpoint: 40.0,       // °F — freeze protection threshold
    oaTemperature: 83.4,           // °F — outside air temperature
    oaEnthalpy: 32.0,             // BTU/lb — outside air enthalpy
    oaRelHumidity: 60,             // % — TMY3-driven; operator-overridable. This unit
                                   // received no humidity reading at all before.
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
    dischargeAirTemp: 60.0,        // °F — after the fan; supplyAirTemp plus fan heat
    fanHeatRise: 0.0,              // °F — what the fan itself contributes
    preheatTemp: 83.4,             // °F — temp after preheat coil (TS-1)
    mixedAirTemp: 72.0,            // °F — mixed air before coils
    phtValveStatus: 'OFF',         // V-1 valve label
    chwValveStatus: 'OFF',         // V-2 valve label
    returnAirRH: 50.0,             // %RH — computed each pass: outdoor humidity brought in
                                   // through the OA damper pulls it off the 50% design
                                   // target, the cooling coil's condensation pulls it back.
    supplyAirRH: 55.0,             // %RH — mixed-air humidity moved by whichever coil is
                                   // active: a wet cooling coil drives it toward
                                   // saturation, an active preheat coil dries it out.
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
  // Momentary points: a button press, not a sustained override. The override
  // latch would re-assert the pressed value after every pass, so the sequence's
  // own self-clear could never take effect — pressing ALARM RESET left
  // resetPressed stuck true forever, and the reset it was meant to perform
  // could not complete. These are written straight through, unlatched.
  var MOMENTARY_KEYS = { resetPressed: true };

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
      if (MOMENTARY_KEYS[mk]) continue;
      if (safety && SAFETY_DRIVEN_KEYS[mk]) continue;
      // A faulted sensor reports its false value even on an overridden point: the reading is
      // what the BMS shows, not what the plant is doing. Lev's broken-damper scenario is
      // exactly this pair — damper commanded shut, feedback reporting 100% — and without
      // the skip this latch overwrote the fault with the physical 0%.
      if (mk in sensorFaults) continue;
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
    // 3. HEATING LOGIC: preheat coil on the outside-air stream, modulating to
    //    bring OA up to the heating coil setpoint. Sized by coil capacity, so
    //    the valve settles at the opening that reaches setpoint and stops there
    //    instead of pinning at 100% and overshooting by a fixed +20 °F.
    // ──────────────────────────────────────────────────────────────────────────
    if (state.fanRunning) {
      if (state.oaTemperature < state.heatingCoilSetpoint) {
        var neededRise = state.heatingCoilSetpoint - state.oaTemperature;
        state.phtValvePosition = Math.max(0, Math.min(100,
          Math.round((neededRise / MAX_COIL_RISE) * 100)));
        state.phtValveStatus = state.phtValvePosition > 0 ? 'ON' : 'OFF';
        // Discharge never exceeds the setpoint the coil is chasing; when the coil
        // is saturated it lands short, which is the honest reading.
        var phtCmd23 = honourCommandedValve(state.oaTemperature, 'phtValvePosition', MAX_COIL_RISE, true);
        state.preheatTemp = (phtCmd23 !== null) ? phtCmd23 : Math.min(
          state.heatingCoilSetpoint,
          state.oaTemperature + (state.phtValvePosition / 100) * MAX_COIL_RISE
        );
      } else {
        state.phtValvePosition = 0;
        state.phtValveStatus = 'OFF';
        state.preheatTemp = state.oaTemperature;
      }

      // Freeze protection overrides the comfort call: drive the valve open to hold
      // the plenum minimum. Capped by coil capacity rather than asserting the
      // setpoint is always reachable.
      if (state.preheatTemp < state.plenumMinSetpoint) {
        state.phtValvePosition = 100;
        state.phtValveStatus = 'ON';
        state.preheatTemp = Math.min(
          state.plenumMinSetpoint,
          state.oaTemperature + MAX_COIL_RISE
        );
      }
    } else {
      state.phtValvePosition = 0;
      state.phtValveStatus = 'OFF';
      state.preheatTemp = state.oaTemperature;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. COOLING LOGIC: chilled water coil modulating to hold the mixed air at
    //    the cooling coil setpoint. Sized by capacity for the same reason as the
    //    preheat coil above.
    // ──────────────────────────────────────────────────────────────────────────
    if (state.fanRunning) {
      // Mixed air temperature — the weighted average Lev specified:
      //   MAT = (%OA × T_OA) + (%RA × T_RA)
      // with the outdoor fraction taken from damper position. The OA term reads
      // preheatTemp rather than raw outdoor air, because on this unit the preheat coil
      // sits upstream of the mix — with the coil off the two are identical, so the
      // formula is Lev's exactly whenever no heating is called.
      var oaFraction = state.oaDamperPosition / 100;
      state.mixedAirTemp = Math.round(
        (state.preheatTemp * oaFraction + RETURN_AIR_TEMP * (1 - oaFraction)) * 10
      ) / 10;

      // Room temperature drifts toward the setpoint while the unit runs, and toward
      // its own equilibrium when it does not. A constant would have made the two new
      // board chips decorative — a setpoint is only worth showing beside a reading
      // that can disagree with it.
      var spError23 = state.zoneTempSetpoint - state.spaceTemp;
      state.spaceTemp = Math.round((state.spaceTemp + spError23 * 0.15) * 10) / 10;

      if (state.mixedAirTemp > state.coolingCoilSetpoint) {
        var neededDrop = state.mixedAirTemp - state.coolingCoilSetpoint;
        state.chwValvePosition = Math.max(0, Math.min(100,
          Math.round((neededDrop / MAX_COIL_DROP) * 100)));
        state.chwValveStatus = state.chwValvePosition > 0 ? 'ON' : 'OFF';
        var chwCmd23 = honourCommandedValve(state.mixedAirTemp, 'chwValvePosition', MAX_COIL_DROP, false);
        state.supplyAirTemp = (chwCmd23 !== null) ? chwCmd23 : Math.max(
          state.coolingCoilSetpoint,
          state.mixedAirTemp - (state.chwValvePosition / 100) * MAX_COIL_DROP
        );
      } else {
        // No cooling needed: valve closed, SAT = mixed air temp
        var chwIdle23 = honourCommandedValve(state.mixedAirTemp, 'chwValvePosition', MAX_COIL_DROP, false);
        if (chwIdle23 === null) {
          state.chwValvePosition = 0;
          state.chwValveStatus = 'OFF';
          state.supplyAirTemp = state.mixedAirTemp;
        } else {
          // Valve held open with nothing asking for cooling — overcooling, which is a
          // fault worth being able to author.
          state.chwValveStatus = state.chwValvePosition > 0 ? 'ON' : 'OFF';
          state.supplyAirTemp = chwIdle23;
        }
      }
    } else {
      state.chwValvePosition = 0;
      state.chwValveStatus = 'OFF';
      state.mixedAirTemp = RETURN_AIR_TEMP;
      state.supplyAirTemp = state.oaTemperature;
    }

    // Round output temperatures to 1 decimal
    state.supplyAirTemp = Math.round(state.supplyAirTemp * 10) / 10;

    // Discharge air: what actually leaves the unit, after the fan. supplyAirTemp is
    // the coil discharge and is what the sequence controls; this is the reading a
    // technician takes downstream of the fan, and the difference between them is the
    // fan's own heat.
    var fanFrac = (typeof state.fanSpeed === 'number' ? state.fanSpeed : 0) / 100;
    state.fanHeatRise = state.fanRunning
      ? Math.round(FAN_HEAT_RISE_MAX * Math.max(0, Math.min(1, fanFrac)) * 10) / 10
      : 0;
    state.dischargeAirTemp = Math.round((state.supplyAirTemp + state.fanHeatRise) * 10) / 10;
    state.preheatTemp = Math.round(state.preheatTemp * 10) / 10;
    state.mixedAirTemp = Math.round(state.mixedAirTemp * 10) / 10;

    // ── Humidity model ───────────────────────────────────────────────────────
    // Same two-stage form as the other units: return air drifts off its 50%
    // target with outdoor humidity and is dried by the cooling coil, then supply
    // air starts from the mixed-air humidity and is moved by whichever coil is
    // conditioning it.
    var oaFractionRH = state.oaDamperPosition / 100;
    var returnAirRHRaw = 50
      + OA_RH_WEIGHT * (state.oaRelHumidity - 50) * oaFractionRH
      - DEHUMID_RH_WEIGHT * (state.chwValvePosition / 100);
    state.returnAirRH = Math.round(
      Math.max(RETURN_AIR_RH_MIN, Math.min(RETURN_AIR_RH_MAX, returnAirRHRaw)) * 10
    ) / 10;

    var oaFracRH = state.fanRunning ? oaFractionRH : 0;
    var mixRH = state.oaRelHumidity * oaFracRH + state.returnAirRH * (1 - oaFracRH);
    var saRH = mixRH
      + (state.chwValvePosition / 100) * (95 - mixRH)
      - (state.phtValvePosition / 100) * (mixRH - 20);
    state.supplyAirRH = Math.round(Math.max(5, Math.min(100, saRH)) * 10) / 10;

    // Is the unit deliberately drying air? Both coils open is correct operation while
    // it is, and the fault indication has to know the difference.
    state.dehumidifying = state.fanRunning &&
      state.returnAirRH > DEHUMID_RH_TRIGGER &&
      state.chwValvePosition > 0 &&
      state.phtValvePosition > 0;

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
    // Shallow copy so consumers cannot mutate internal state, with faulted sensors
    // overlaid at read time — see withSensorFaults.
    return withSensorFaults(Object.assign({}, state));
  }

  // Tracks which state keys the operator has manually overridden — same shape
  // and semantics as AHU44NewController/AHU46Controller's `modes`. Added so the
  // point-detail dialog can show and release overrides on this unit too;
  // setValue()'s existing behaviour is unchanged apart from recording the flag.
  var modes = {};
  /**
   * The air temperature leaving a coil whose valve the operator is holding.
   * Returns null when that valve is not in Manual, so callers fall through to the
   * normal setpoint-driven sizing.
   *
   *   entering  air temperature entering the coil
   *   key       'phtValvePosition' | 'chwValvePosition'
   *   capacity  full-open swing in degF (MAX_COIL_RISE / MAX_COIL_DROP)
   *   heating   true adds, false subtracts
   */
  function honourCommandedValve(entering, key, capacity, heating) {
    if (modes[key] !== 'Manual') return null;
    // Read the COMMANDED value, not state[key]: the sequence overwrites that a line or
    // two earlier in the same pass, so state[key] is its number rather than the
    // operator's, and the override silently had no effect.
    var pos = manualValues[key];
    if (typeof pos !== 'number') pos = state[key];
    if (typeof pos !== 'number') return null;
    var frac = Math.max(0, Math.min(100, pos)) / 100;
    return heating ? entering + frac * capacity : entering - frac * capacity;
  }


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

  // ─── Sensor faults ──────────────────────────────────────────────────────────
  // A failed device, distinct from an operator override. The reading is falsified after
  // every recalculate, so the sequence acts on the false number exactly as it would in the
  // field — but the point reports FAULT rather than MANUAL and appears on no override list.
  // That distinction is the whole lesson: a broken damper reporting 100% open cannot be
  // found by looking for who commanded it.
  var sensorFaults = {};

  function setSensorFault(key, value) {
    if (!state.hasOwnProperty(key)) return false;
    sensorFaults[key] = value;
    recalculate();
    return true;
  }

  function clearSensorFault(key) {
    if (!(key in sensorFaults)) return false;
    delete sensorFaults[key];
    recalculate();
    return true;
  }

  function clearSensorFaults() {
    sensorFaults = {};
    recalculate();
  }

  function getSensorFaults() { return Object.assign({}, sensorFaults); }

  /** A copy of state with faulted sensors reporting their false values.
   *
   *  Overlaid at READ time, never written into state. Writing it in made the false value
   *  the sequence's own input on the next pass, so a damper reporting 100% while shut
   *  produced airflow to match — collapsing the exact contradiction the exercise turns on.
   *  A failed transmitter changes what the BMS SEES, not what the air does. */
  function withSensorFaults(src) {
    var keys = Object.keys(sensorFaults);
    if (!keys.length) return src;
    var out = Object.assign({}, src);
    keys.forEach(function (k) { out[k] = sensorFaults[k]; });
    return out;
  }

  function setValue(key, value) {
    if (state.hasOwnProperty(key)) {
      if (MOMENTARY_KEYS[key]) {
        // One-shot: apply, let the sequence act on it and clear it, never latch.
        state[key] = value;
        recalculate();
        return;
      }
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
    // Guarded: a weather row without relHumidity would otherwise write undefined
    // and turn every downstream humidity reading into NaN.
    if (modes.oaRelHumidity !== 'Manual' && typeof weather.relHumidity === 'number'
        && isFinite(weather.relHumidity)) {
      state.oaRelHumidity = weather.relHumidity;
    }
    recalculate();
  }

  // Initial calculation on load
  recalculate();

  // ─── Expose on window ───────────────────────────────────────────────────────

  window.AHU23Controller = {
    getState: getState,
    setValue: setValue,
    setSensorFault: setSensorFault,
    clearSensorFault: clearSensorFault,
    clearSensorFaults: clearSensorFaults,
    getSensorFaults: getSensorFaults,
    getModes: getModes,
    clearMode: clearMode,
    // Release EVERY override at once, restoring each point's pre-override value.
    // Needed so an exercise starts from a clean unit rather than inheriting
    // whatever the previous student left overridden; only AHU-4-4 had this, so
    // ExerciseStore.applySetup silently skipped the reset on the other units.
    clearModes: function () {
      for (var ak in autoValues) {
        if (Object.prototype.hasOwnProperty.call(autoValues, ak) && state.hasOwnProperty(ak)) {
          state[ak] = autoValues[ak];
        }
      }
      modes = {}; manualValues = {}; autoValues = {};
      recalculate();
    },
    subscribe: subscribe,
    recalculate: recalculate,
    updateFromTMY3: updateFromTMY3,
  };

})();
