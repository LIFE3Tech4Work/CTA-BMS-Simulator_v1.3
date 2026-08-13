/**
 * AHU44NewController.js — Control logic engine for AHU-4-4
 *
 * Implements reactive BMS control sequences for the Pre-Function/Ballroom
 * Level 2 AHU (based on the Honeywell SymmetrE TecSystems screenshot).
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
 * │ Interlock ON         → Related equipment interlocked                      │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Data flow:
 *   Controls Sidebar (WRITES) → window.AHU44NewState → Graphic (READS)
 *
 * oaDamperPosition is a true Manual-able output (added per the BMS Slide
 * Companion lecture review): once set via setValue('oaDamperPosition', ...),
 * recalculate() holds that exact value instead of recomputing it from the
 * economizer/CO2 DCV sequence — mirroring a real BACnet AO going Manual,
 * where the program no longer has authority over the point until it's
 * released. This is what makes it possible to literally reproduce the real
 * AHU-4-4 screenshot's own fault pattern (215 CFM actual OA vs. a 4,900 CFM
 * configured minimum — see AHU44NewFaultEngine.js's N-04), which recurs
 * independently across multiple lecture case studies (AHU-159, the VAV box
 * overview, Exercise 1) as one of the most common real-world waste patterns.
 * Downstream values (oaCFM, exhaustDamperPct, mixedAirTemp) still recompute
 * normally FROM whatever oaDamperPosition currently is, manual or not — a
 * stuck-low damper should visibly starve OA CFM, that's the whole point.
 * Scope note: this only takes effect while the fan is running (fanRunning
 * still forces the damper to 0 on a schedule/fire-alarm shutdown, regardless
 * of any manual command) — modeling a damper physically held open against a
 * stopped fan is a different, more unusual fault and is out of scope here.
 *
 * Exposed as:
 *   window.AHU44NewController — public API { getState, setValue, subscribe, recalculate }
 *   window.AHU44NewState      — shared state object (read by graphic)
 */

(function() {
  'use strict';

  // ─── Design Constants ───────────────────────────────────────────────────────

  var DESIGN_CFM = 11400;          // Rated max supply airflow at 100% fan speed — calibrated so 75% setpoint yields ~8550 CFM, matching Honeywell screenshot reference (Hotel_AHU4_4Edit.png)
  var RETURN_AIR_TEMP = 72.0;      // Assumed return air temperature (°F) — corrected to match screenshot's live RF-4-7 reading (was 75)
  var OA_DAMPER_FLOOR = 20;        // Minimum damper position (%) per ASHRAE 62.1

  // ─── Shared State Object ────────────────────────────────────────────────────

  var state = {
    // ═══ INPUTS (editable from Controls Sidebar) ═══════════════════════════════
    runSchedule: true,
    systemStarting: false,
    startingTimeSetpoint: 240,     // seconds
    startingTimeLeft: 0,           // seconds remaining
    coolingCoilSetpoint: 60.0,     // °F
    heatingCoilSetpoint: 55.0,     // °F
    plenumMinSetpoint: 40.0,       // °F — freeze protection
    oaTemperature: 83.4,           // °F — TMY3-driven (live weather), not operator-editable; see WEATHER_DRIVEN_KEYS
    lowOATLockout: false,          // Low OAT lockout — OFF per Honeywell screenshot reference (Hotel_AHU4_4Edit.png)
    oaEnthalpy: 32.0,             // BTU/lb — TMY3-driven (live weather), not operator-editable; see WEATHER_DRIVEN_KEYS
    enthalpyOKForEconomizer: false, // Enthalpy permits economizer
    economizerMinPosition: 20,     // % — OA damper floor
    minPositionFanSpeedLock: 5,    // %
    economizerTempControlSP: 58.0, // °F — corrected to match Honeywell screenshot reference (was 52.0)
    co2Sensor: 538,                // PPM
    co2Setpoint: 900,              // PPM
    minOAAirflowSetpoint: 4900,    // CFM
    fanTrackMode: 'CFM',
    fanSpeedSetpoint: 75,          // %
    fireAlarmShutdown: false,      // NORM
    fireAlarmSmokePurge: false,    // NORM

    // Additional inputs from diagram
    interlockOn: true,             // Interlock ON status
    exhaustFanOn: true,            // Exhaust/INT fan status
    commonDamperOpen: true,        // Common damper position
    freezePumpOn: true,            // Freeze pump running

    // ═══ OUTPUTS (calculated — READ-ONLY on diagram) ═════════════════════════
    fanRunning: true,
    fanSpeed: 75,                  // % actual
    cfm: 8550,                     // Supply air CFM — corrected design point to match Honeywell screenshot (was 16500 max → 12375 calc'd)
    oaCFM: 4900,                   // Outside air CFM (min OA)
    oaDamperPosition: 20,          // %
    economizerActive: false,
    phtValvePosition: 0,           // % — preheat valve
    chwValvePosition: 0,           // % — chilled water valve
    supplyAirTemp: 60.0,           // °F — discharge air temp
    preheatTemp: 72.9,             // °F — after preheat coil
    mixedAirTemp: 75.0,            // °F — mixed air
    returnAirTemp: 72.0,           // °F — return air. Corrected from hardcoded 75.0 to match screenshot's live RF-4-7 reading (72.0°F); still a static seed, see returnAirTemp note in recalculate()
    supplyStaticPressure: 87.6,    // % (kBn reading)
    returnStaticPressure: 80.0,    // %
    chwSupplyTemp: 41.8,           // °F
    cwSupplyTemp: 75.2,            // °F
    phtValveStatus: 'OFF',
    chwValveStatus: 'ON',
    supplyFanStatus: 'ON',
    returnFanStatus: 'ON',
    exhaustDamperPct: 100,         // % — tracks OA damper (balanced exhaust)
    returnAirDamperPct: 80,        // % — inverse of OA damper (mixing box return air)
    spillDamperPct: 100,           // % — DA-3 Spill Damper (N.O.): 100% when off, 0% at min OA
    returnCFM: 7695,               // CFM — return fan flow (90% of supply per SOO CLC #6)
    supplyRH: 55,                  // % — supply air relative humidity (SOO CLC #4 humidity model)
  };

  window.AHU44NewState = state;

  var subscribers = [];

  // Tracks which keys have been manually set by an operator via the
  // Controls Sidebar — mirrors PointRegistry.js's point.mode concept and the
  // real SymmetrE convention of flagging manually-set values with an "M"
  // badge (see the Overview guide's trend display: "87.0°C M"). Only keys
  // actually passed to setValue() ever appear here. Most flagged keys are
  // operator setpoints (inputs); oaDamperPosition is the one output field
  // that can also be flagged — see the Manual-output note in the file
  // header for why recalculate() honors that flag instead of overwriting it.
  var modes = {};

  // ─── Engineering Calculations ───────────────────────────────────────────────

  function recalculate() {

    // 1. FAN LOGIC: Run Schedule → Fan ON/OFF + CFM
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

    // 2. ECONOMIZER LOGIC: Auto-calculate enthalpy eligibility (SOO CLC #2)
    // AUTO: OA enthalpy < (Return air enthalpy − 5.0 BTU/lb) AND OA > 38°F
    // DISABLE: OA enthalpy > (Return air enthalpy − 2.5 BTU/lb) OR OA < 35°F
    // Return air enthalpy approximated from return air temp at ~50% RH:
    //   h ≈ 0.240*T_rankine_offset — simplified: at 72°F/50%RH ≈ 28 BTU/lb
    var returnAirEnthalpy = Math.max(15, 0.31 * RETURN_AIR_TEMP - 14.3);
    if (modes.enthalpyOKForEconomizer !== 'Manual') {
      if (state.oaEnthalpy < (returnAirEnthalpy - 5.0) && state.oaTemperature > 38) {
        state.enthalpyOKForEconomizer = true;
      } else if (state.oaEnthalpy > (returnAirEnthalpy - 2.5) || state.oaTemperature < 35) {
        state.enthalpyOKForEconomizer = false;
      }
      // else: hysteresis band — hold current state
    }

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
          state.oaDamperPosition = Math.max(state.economizerMinPosition, OA_DAMPER_FLOOR);
        }

        // CO₂ DCV override
        if (state.co2Sensor > state.co2Setpoint && !state.economizerActive) {
          var co2Excess = state.co2Sensor - state.co2Setpoint;
          var co2DamperCommand = Math.min(100, state.economizerMinPosition + (co2Excess / 5));
          state.oaDamperPosition = Math.round(co2DamperCommand);
        }
      }
      // else: oaDamperPosition holds whatever value the operator manually
      // forced it to — the sequence above (economizer changeover, CO2 DCV)
      // no longer has authority over this point, same as a real BACnet AO
      // in Manual. economizerActive correctly stays false in this branch:
      // the program isn't actually driving free cooling anymore, regardless
      // of what the damper position number happens to read.

      // OA CFM based on damper position — always recomputed from whatever
      // oaDamperPosition currently is, manual override or not. A damper
      // manually stuck near 0% should visibly starve OA CFM; that's the
      // literal fault this Manual capability exists to make reachable.
      state.oaCFM = Math.round(state.minOAAirflowSetpoint * (state.oaDamperPosition / state.economizerMinPosition));
      state.oaCFM = Math.min(state.oaCFM, state.cfm);
    } else {
      state.oaDamperPosition = 0;
      state.oaCFM = 0;
    }

    // ── Damper positions ─────────────────────────────────────────────────────
    // DA-2: Return air damper is INVERSE of OA (SOO CLC #8: return closes as OA opens)
    state.returnAirDamperPct = state.fanRunning ? Math.max(0, 100 - state.oaDamperPosition) : 0;

    // DA-3: Spill damper (SOO points list: DA-3, Normally Open = N.O.)
    // Fails OPEN when system is off (100%). When running at min OA, stays near 0%.
    // Opens proportionally as fresh air demand exceeds minimum position.
    if (!state.fanRunning) {
      state.spillDamperPct = 100; // N.O. = fully open when system off
    } else {
      var extraOADemand = Math.max(0, state.oaDamperPosition - state.economizerMinPosition);
      state.spillDamperPct = Math.min(100, Math.round(extraOADemand * 1.5));
    }

    // DA-1: Exhaust damper mirrors OA damper (balanced fresh/exhaust exchange)
    state.exhaustDamperPct = state.fanRunning ? state.oaDamperPosition : 0;

    // ── Return fan flow tracking (SOO CLC #6) ────────────────────────────────
    // Return fan VFD modulated to maintain return flow at 90% of supply flow
    // Creates slight positive pressurization of served zones (SOO Page 8)
    state.returnCFM = state.fanRunning ? Math.round(state.cfm * 0.90) : 0;

    // 3. HEATING LOGIC: Heating Coil SP → PHT valve %
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

      // Freeze protection
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

    // 4. COOLING LOGIC: Cooling Coil SP → CHW valve %
    if (state.fanRunning) {
      var oaFraction = state.oaDamperPosition / 100;
      state.mixedAirTemp = Math.round(
        (state.preheatTemp * oaFraction + RETURN_AIR_TEMP * (1 - oaFraction)) * 10
      ) / 10;

      if (state.mixedAirTemp > state.coolingCoilSetpoint) {
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

    // Round outputs
    state.supplyAirTemp = Math.round(state.supplyAirTemp * 10) / 10;
    state.preheatTemp   = Math.round(state.preheatTemp   * 10) / 10;
    state.mixedAirTemp  = Math.round(state.mixedAirTemp  * 10) / 10;
    state.returnAirTemp = RETURN_AIR_TEMP;

    // ── Humidity model (SOO CLC #4) ──────────────────────────────────────────
    // Return Air RH maintained at 50% by resetting SAT setpoint for CHW coil.
    // When CHW valve is active, cooling coil removes moisture from the airstream.
    // OA RH approximated from enthalpy (higher enthalpy = higher humidity content).
    var oaRH = Math.min(95, Math.max(15, 15 + (state.oaEnthalpy - 13) * 2.8));
    var oaFractionRH = state.oaDamperPosition / 100;
    // Mixed air humidity before coils (blend of OA and return air streams)
    var returnRH = 50; // SOO target: maintain return air at 50% RH
    var mixedRH  = Math.round(oaFractionRH * oaRH + (1 - oaFractionRH) * returnRH);
    // CHW coil dehumidification: cooling coil removes moisture proportional to valve position
    // At 100% valve: up to 35% RH reduction (coil surface condensation = dehumidification)
    var chwDehumid = Math.round((state.chwValvePosition / 100) * 35);
    state.supplyRH = Math.max(10, Math.min(95, mixedRH - chwDehumid));

    // ── Freeze protection dynamic setpoint (SOO CLC #1) ──────────────────────
    // Minimum Plenum Temperature resets with OA temperature per schedule:
    //   OaTemp = 60°F → MinPlenumTemp = 40°F
    //   OaTemp = 40°F → MinPlenumTemp = 50°F
    // Interpolate linearly between these points; cap at 50°F minimum
    if (modes.plenumMinSetpoint !== 'Manual') {
      var oat = state.oaTemperature;
      if (oat >= 60) {
        state.plenumMinSetpoint = 40;
      } else if (oat <= 40) {
        state.plenumMinSetpoint = 50;
      } else {
        state.plenumMinSetpoint = Math.round(50 - (oat - 40) * 0.5);
      }
    }

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

  // Keys that are purely TMY3-driven and may never be set via the sidebar.
  // Outdoor air temperature is real weather, not an operator setpoint — a
  // building engineer cannot type in what it is outside, so this point has
  // no Manual mode. (Distinct from points like coolingCoilSetpoint, which
  // ARE legitimately operator-editable.)
  var WEATHER_DRIVEN_KEYS = { oaTemperature: true, oaEnthalpy: true };

  function setValue(key, value) {
    if (WEATHER_DRIVEN_KEYS[key]) {
      console.warn('[AHU44NewController] "' + key + '" is TMY3-driven and cannot be set manually. Ignored.');
      return;
    }
    if (state.hasOwnProperty(key)) {
      state[key] = value;
      modes[key] = 'Manual';
      recalculate();
    }
  }

  /**
   * Returns a shallow copy of which state keys are currently flagged Manual.
   * Use: window.AHU44NewController.getModes()[stateKey] === 'Manual'
   */
  function getModes() {
    return Object.assign({}, modes);
  }

  /**
   * Push live TMY3 weather into the controller for the current simulation tick.
   * Always applies — outdoor air temperature has no manual override in this
   * controller (see WEATHER_DRIVEN_KEYS / setValue above).
   *
   * @param {number} row - current simulation row (1-indexed)
   * @param {number} fraction - interpolation fraction between row and row+1 (0-1)
   */
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

  // Initial calculation
  recalculate();

  // ─── Expose ─────────────────────────────────────────────────────────────────

  window.AHU44NewController = {
    getState: getState,
    setValue: setValue,
    subscribe: subscribe,
    recalculate: recalculate,
    updateFromTMY3: updateFromTMY3,
    getModes: getModes,
    clearModes: function() { modes = {}; },
  };

})();
