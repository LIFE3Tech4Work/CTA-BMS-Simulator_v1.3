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

/**
 * The model is a factory rather than an IIFE so a second unit built on the same
 * sequence of operation (AHU-4-3, the twin that shares the common damper per the
 * SOO's mixing-box diagram) gets its OWN state, modes and subscribers instead of
 * aliasing AHU-4-4's. window.AHU44NewController is created below exactly as
 * before, so every existing caller and test is unaffected.
 *
 * @param {object} [seed] - state overrides applied before the first recalculate()
 */
function CTA_createAHU44Controller(seed) {
  'use strict';

  // ─── Design Constants ───────────────────────────────────────────────────────

  var DESIGN_CFM = 11400;          // Rated max supply airflow at 100% fan speed
  // Heat the supply fan adds by friction and motor work. Scales with speed because
  // the work does: a fan at 40% is not adding what it adds at 100%. 2 °F at full
  // speed is the usual figure for a draw-through unit with the motor in the stream.
  var FAN_HEAT_RISE_MAX = 2.0;      // °F at 100% fan speed
  // Return air temp and fan speed were previously calibrated to a single
  // Honeywell reference screenshot's live reading (72.0°F / 75%). Lev's real
  // 3-month BMS export (src/data/points/AHU04_04RATemp.js,
  // AHU04_04SAFanSpeed.js — 1017 hourly readings each) averages 61.86°F and
  // 37.64% respectively, which is what this unit actually runs at day to
  // day — a single screenshot moment isn't representative. Corrected per
  // checklist Section F: "AHU-4-4 calibration mismatch."
  var RETURN_AIR_TEMP = 62.0;      // °F — real 3-month export average (61.86°F), not the 72°F screenshot moment
  var OA_DAMPER_FLOOR = 20;        // Minimum damper position (%) per ASHRAE 62.1

  // ─── Season changeover and coil authority (14 Aug review) ───────────────────
  // Same rebuild applied to AHU-4-6: the coils control the air they actually
  // see, against whichever setpoint the season gives authority to. Shared by
  // AHU-4-3, which is a second instance of this model.
  var SEASON_CHANGEOVER_OAT = 60;  // °F — Auto-mode winter/summer changeover
  var SEASON_CHANGEOVER_DB = 2;    // °F — hysteresis so the mode doesn't chatter
  var DEHUMID_RH_TRIGGER = 52;     // %RH — above this, cooling may dry against a heating call
  // Return-air humidity model, same form and constants as AHU-4-6 so the paired
  // units read alike. Outdoor humidity brought in through the OA damper pulls
  // return air away from the 50% target; the cooling coil's own condensation
  // pulls it back down.
  var OA_RH_WEIGHT = 0.4;          // fraction of the OA-RH gap reaching return air at full ventilation
  var DEHUMID_RH_WEIGHT = 8;       // %RH pulled down at fully-open chwValvePosition
  var RETURN_AIR_RH_MIN = 30;      // %
  var RETURN_AIR_RH_MAX = 70;      // %
  var MAX_COIL_RISE = 30;          // °F — preheat coil capacity at 100% open
  var MAX_COIL_DROP = 30;          // °F — chilled water coil capacity at 100% open

  // ─── Heating setpoint OA reset schedule ─────────────────────────────────────
  // As outdoor air falls, the supply-air heating setpoint rises, so the unit
  // delivers warmer air on a colder day instead of holding one number all year.
  // Clamped at both ends per General Automatic Control Sequences #6. Same figures
  // as AHU-4-6, so the paired units behave alike (AHU-4-3 shares this model).
  //
  // Ranking, highest first: a Manual hold on the setpoint, then zone setpoint
  // control, then this schedule. Cooling is deliberately NOT reset off outdoor
  // air — relaxing it on a mild day would fight the dehumidification call.
  var HEAT_RESET_OAT_HIGH = 60;    // °F — setpoint pins to HEAT_RESET_MIN at or above
  var HEAT_RESET_OAT_LOW = 20;     // °F — setpoint pins to HEAT_RESET_MAX at or below
  var HEAT_RESET_MIN = 55;         // °F — the flat value this schedule replaced
  var HEAT_RESET_MAX = 65;         // °F
  var ZONE_DEADBAND = 4;           // °F — the deadband taught in the curriculum (68/72)

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
    oaTemperature: 83.4,           // °F — TMY3-driven; operator-overridable
    lowOATLockout: false,          // Low OAT lockout — OFF per Honeywell screenshot reference (Hotel_AHU4_4Edit.png)
    oaEnthalpy: 32.0,             // BTU/lb — TMY3-driven; operator-overridable
    enthalpyOKForEconomizer: false, // Enthalpy permits economizer
    economizerMinPosition: 20,     // % — OA damper floor
    minPositionFanSpeedLock: 5,    // %
    economizerTempControlSP: 58.0, // °F — corrected to match Honeywell screenshot reference (was 52.0)
    co2Sensor: 538,                // PPM
    co2Setpoint: 900,              // PPM
    minOAAirflowSetpoint: 4900,    // CFM
    fanTrackMode: 'CFM',
    controlMode: 'Auto',            // 'Auto' | 'Winter' | 'Summer'
    zoneTempSetpoint: 72.0,         // °F — one setpoint that can override both coils
    zoneSetpointControl: false,
    // Outdoor-air reset of the heating setpoint. On by default — it is how the
    // real sequence behaves — but switchable so the flat-setpoint case can be
    // demonstrated side by side.
    oaResetEnabled: true,
    heatingResetTarget: 55.0,      // °F — what the reset schedule is asking for
    activeSeason: 'Summer',
    activeSetpoint: 60.0,
    activeSetpointSource: 'Cooling (maximum)',
    spaceTemp: 72.0,                // °F — zone sensor
    fanSpeedSetpoint: 38,          // % — real 3-month export average (37.64%), not the 75% screenshot moment
    fireAlarmShutdown: false,      // NORM
    fireAlarmSmokePurge: false,    // NORM

    // Additional inputs from diagram
    interlockOn: true,             // Interlock ON status
    exhaustFanOn: true,            // Exhaust/INT fan status
    commonDamperOpen: true,        // Common damper position
    freezePumpOn: true,            // Freeze pump running

    // ═══ OUTPUTS (calculated — READ-ONLY on diagram) ═════════════════════════
    fanRunning: true,
    fanSpeed: 38,                  // % actual — real 3-month export average
    cfm: 4332,                     // Supply air CFM at 38% fan speed
    oaCFM: 4332,                   // Outside air CFM (min OA, capped by supply CFM)
    oaDamperPosition: 20,          // %
    economizerActive: false,
    phtValvePosition: 0,           // % — preheat valve
    chwValvePosition: 0,           // % — chilled water valve
    supplyAirTemp: 60.0,           // °F — discharge air temp
    dischargeAirTemp: 60.0,        // °F — after the fan; supplyAirTemp plus fan heat
    fanHeatRise: 0.0,              // °F — what the fan itself contributes
    preheatTemp: 72.9,             // °F — after preheat coil
    mixedAirTemp: 66.3,            // °F — mixed air
    returnAirTemp: 62.0,           // °F — return air; real 3-month export average, still a static seed (see RETURN_AIR_TEMP note above)
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
    dischargeDamperPct: 100,       // % — DA-4 Discharge Damper, open when the unit runs
    returnCFM: 7695,               // CFM — return fan flow (90% of supply per SOO CLC #6)
    supplyRH: 55,                  // % — supply air relative humidity (SOO CLC #4 humidity model)
    oaRelHumidity: 60,             // % — TMY3-driven; operator-overridable. Previously not
                                   // pulled from weather at all (only oaTemperature and
                                   // oaEnthalpy were), so the humidity side of this unit
                                   // ran off an enthalpy approximation.
    returnAirRH: 50,               // % — computed each pass; the dehumidification call below
                                   // read this before it existed, so it never fired.
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
    var pos = state[key];
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

  // The coil setpoints as the operator left them before zone setpoint control
  // borrowed them; handed back when it is switched off.
  var preZoneSetpoints = null;
  // The configured heating setpoint the OA reset schedule borrowed, restored when
  // the schedule is switched off.
  var preResetHeatingSetpoint = null;

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
    exhaustDamperPct: true, returnAirDamperPct: true, spillDamperPct: true,
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
      if (state[mk] !== manualValues[mk]) { state[mk] = manualValues[mk]; overrode = true; }
    }
    if (overrode && typeof notifySubscribers === 'function') notifySubscribers();
  }

  function computeSequences() {

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
      state.fanSpeed = Math.round(Math.max(state.minPositionFanSpeedLock, Math.min(100, state.fanSpeedSetpoint)));
      state.cfm = Math.round(DESIGN_CFM * state.fanSpeed / 100);
      state.supplyFanStatus = 'ON';
      state.returnFanStatus = 'ON';
    }

    // Interlock/exhaust/common-damper status tracks fan run state — previously
    // left at their true initial value forever since nothing here reassigned
    // them, so the interlock indicator read "on" even after the unit shut down.
    state.interlockOn = state.fanRunning;
    state.exhaustFanOn = state.fanRunning;
    state.commonDamperOpen = state.fanRunning;

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
          // Supply-air low limit: free cooling is damper control, not on/off.
          // The damper modulates to the outdoor-air fraction that lands mixed air
          // on the heating setpoint. If that fraction is below the ventilation
          // minimum, free cooling cannot hold the floor even at the code minimum
          // of outdoor air, so the economizer DROPS OUT rather than sitting
          // "active" at minimum OA — which had kept the winter heating call
          // suppressed and stranded supply air below its setpoint.
          var econVentMin44 = Math.max(state.economizerMinPosition, OA_DAMPER_FLOOR);
          var econLimit44 = 100;
          if (RETURN_AIR_TEMP - state.oaTemperature > 0.5) {
            econLimit44 = Math.round(
              ((state.heatingCoilSetpoint - RETURN_AIR_TEMP) / (state.oaTemperature - RETURN_AIR_TEMP)) * 100
            );
          }
          if (econLimit44 < econVentMin44) {
            state.economizerActive = false;
            state.oaDamperPosition = econVentMin44;
          } else {
            state.economizerActive = true;
            state.oaDamperPosition = Math.min(100, econLimit44);
          }
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
    // — unless the operator has manually overridden it, in which case it holds
    // its commanded value independently instead of being recomputed every tick.
    if (state.fanRunning) {
      if (modes.returnAirDamperPct !== 'Manual') {
        state.returnAirDamperPct = Math.max(0, 100 - state.oaDamperPosition);
      }
    } else {
      state.returnAirDamperPct = 0;
    }

    // DA-3: Spill damper (SOO points list: DA-3, Normally Open = N.O.)
    // Fails OPEN when system is off (100%). When running at min OA, stays near 0%.
    // Opens proportionally as fresh air demand exceeds minimum position, unless
    // manually overridden, which holds independently of the OA damper.
    if (!state.fanRunning) {
      state.spillDamperPct = 100; // N.O. = fully open when system off

    // Open while the unit runs, shut when it stops — an isolation damper, not a
    // modulating output. Yields to a manual override like any other point.
    if (modes.dischargeDamperPct !== 'Manual') {
      state.dischargeDamperPct = state.fanRunning ? 100 : 0;
    }
    } else if (modes.spillDamperPct !== 'Manual') {
      var extraOADemand = Math.max(0, state.oaDamperPosition - state.economizerMinPosition);
      state.spillDamperPct = Math.min(100, Math.round(extraOADemand * 1.5));
    }

    // DA-1: Exhaust damper mirrors OA damper (balanced fresh/exhaust exchange)
    state.exhaustDamperPct = state.fanRunning ? state.oaDamperPosition : 0;

    // ── Return fan flow tracking (SOO CLC #6) ────────────────────────────────
    // Return fan VFD modulated to maintain return flow at 90% of supply flow
    // Creates slight positive pressurization of served zones (SOO Page 8)
    state.returnCFM = state.fanRunning ? Math.round(state.cfm * 0.90) : 0;

    // 3. SEASON / ACTIVE SETPOINT — which setpoint owns the coils this pass.
    var prevSeason = state.activeSeason || 'Summer';
    if (state.controlMode === 'Winter' || state.controlMode === 'Summer') {
      state.activeSeason = state.controlMode;
    } else if (prevSeason === 'Winter') {
      state.activeSeason = (state.oaTemperature > SEASON_CHANGEOVER_OAT + SEASON_CHANGEOVER_DB)
        ? 'Summer' : 'Winter';
    } else {
      state.activeSeason = (state.oaTemperature < SEASON_CHANGEOVER_OAT - SEASON_CHANGEOVER_DB)
        ? 'Winter' : 'Summer';
    }

    // Heating setpoint OA reset. The target is always computed so the panel can
    // show what the schedule is asking for even when it is switched off.
    var heatReset = HEAT_RESET_MIN +
      (HEAT_RESET_OAT_HIGH - state.oaTemperature) / (HEAT_RESET_OAT_HIGH - HEAT_RESET_OAT_LOW) *
      (HEAT_RESET_MAX - HEAT_RESET_MIN);
    state.heatingResetTarget = Math.round(
      Math.max(HEAT_RESET_MIN, Math.min(HEAT_RESET_MAX, heatReset)) * 10
    ) / 10;
    if (state.oaResetEnabled && !state.zoneSetpointControl &&
        modes.heatingCoilSetpoint !== 'Manual') {
      // Borrow the setpoint the way zone control does, so switching the schedule
      // off hands back the configured value instead of stranding the setpoint at
      // whatever the schedule last wrote.
      if (preResetHeatingSetpoint === null) {
        preResetHeatingSetpoint = state.heatingCoilSetpoint;
      }
      state.heatingCoilSetpoint = state.heatingResetTarget;
      // A scheduled value is computed, not commanded, so it must never seed the
      // release-to-Auto snapshot.
      delete autoValues.heatingCoilSetpoint;
    } else if (preResetHeatingSetpoint !== null) {
      if (modes.heatingCoilSetpoint !== 'Manual' && !state.zoneSetpointControl) {
        state.heatingCoilSetpoint = preResetHeatingSetpoint;
      }
      preResetHeatingSetpoint = null;
    }

    // One zone setpoint resets both coil setpoints around its deadband. A
    // zone-derived setpoint is computed, not commanded, so it never seeds the
    // release-to-Auto snapshot.
    if (state.zoneSetpointControl) {
      if (!preZoneSetpoints) {
        preZoneSetpoints = {
          heatingCoilSetpoint: state.heatingCoilSetpoint,
          coolingCoilSetpoint: state.coolingCoilSetpoint
        };
      }
      if (modes.heatingCoilSetpoint !== 'Manual') {
        state.heatingCoilSetpoint = Math.round((state.zoneTempSetpoint - ZONE_DEADBAND / 2) * 10) / 10;
        delete autoValues.heatingCoilSetpoint;
      }
      if (modes.coolingCoilSetpoint !== 'Manual') {
        state.coolingCoilSetpoint = Math.round((state.zoneTempSetpoint + ZONE_DEADBAND / 2) * 10) / 10;
        delete autoValues.coolingCoilSetpoint;
      }
    } else if (preZoneSetpoints) {
      if (modes.heatingCoilSetpoint !== 'Manual') {
        state.heatingCoilSetpoint = preZoneSetpoints.heatingCoilSetpoint;
      }
      if (modes.coolingCoilSetpoint !== 'Manual') {
        state.coolingCoilSetpoint = preZoneSetpoints.coolingCoilSetpoint;
      }
      preZoneSetpoints = null;
    }

    var winter = state.activeSeason === 'Winter';
    state.activeSetpointSource = winter ? 'Heating (minimum)' : 'Cooling (maximum)';
    state.activeSetpoint = winter ? state.heatingCoilSetpoint : state.coolingCoilSetpoint;

    // 3a. HEATING — the coil modulates to REACH its target through the mix. It
    // used to control off outdoor air temperature alone and overshoot its own
    // setpoint by a hardcoded +20°F, so on a cold day it drove mixed air far
    // above the supply setpoint and the mutual-exclusivity rule then locked the
    // cooling coil out, leaving supply air stranded (14 Aug review).
    if (state.fanRunning) {
      var oaFrac44 = state.oaDamperPosition / 100;
      var entering44 = state.oaTemperature * oaFrac44 + RETURN_AIR_TEMP * (1 - oaFrac44);
      var riseNeeded = 0;

      // Freeze protection: hold the OA stream at or above the plenum minimum.
      if (state.oaTemperature < state.plenumMinSetpoint) {
        riseNeeded = state.plenumMinSetpoint - state.oaTemperature;
      }

      // Heating call — winter authority only, and suppressed while the
      // economizer is enabled (warming the outdoor air free cooling just brought
      // in is the contradiction the review flagged).
      if (winter && !state.economizerActive && oaFrac44 > 0 &&
          entering44 < state.heatingCoilSetpoint) {
        riseNeeded = Math.max(riseNeeded, (state.heatingCoilSetpoint - entering44) / oaFrac44);
      }

      if (riseNeeded > 0) {
        var rise44 = Math.min(MAX_COIL_RISE, riseNeeded);
        state.phtValvePosition = Math.min(100, Math.round((rise44 / MAX_COIL_RISE) * 100));
        state.phtValveStatus = 'ON';
        var phtCmd44 = honourCommandedValve(state.oaTemperature, 'phtValvePosition', MAX_COIL_RISE, true);
        state.preheatTemp = (phtCmd44 !== null) ? phtCmd44 : (state.oaTemperature + rise44);
      } else {
        state.phtValvePosition = 0;
        state.phtValveStatus = 'OFF';
        state.preheatTemp = state.oaTemperature;
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

      // Cooling defers while the heating valve is open (SOO #10), except to dry
      // the air — the cold humid day the expert called correct operation. Sized
      // by capacity, not proportional gain, which previously left a permanent
      // 2-3°F droop below the setpoint the coil never closed.
      var dehumidCall44 = state.returnAirRH > DEHUMID_RH_TRIGGER;
      var coolingAllowed44 = (state.phtValvePosition === 0) || dehumidCall44;
      state.dehumidifying = !!(dehumidCall44 && state.phtValvePosition > 0);

      if (coolingAllowed44 && state.mixedAirTemp > state.coolingCoilSetpoint) {
        var drop44 = Math.min(MAX_COIL_DROP, state.mixedAirTemp - state.coolingCoilSetpoint);
        var chwCmd44 = honourCommandedValve(state.mixedAirTemp, 'chwValvePosition', MAX_COIL_DROP, false);
        if (chwCmd44 === null) {
          state.chwValvePosition = Math.min(100, Math.round((drop44 / MAX_COIL_DROP) * 100));
        }
        state.chwValveStatus = state.chwValvePosition > 0 ? 'ON' : 'OFF';
        state.supplyAirTemp = (chwCmd44 !== null) ? chwCmd44 : (state.mixedAirTemp - drop44);
      } else {
        // Held open with no cooling call: the air still gets cooled, which is the
        // overcooling fault an exercise wants to be able to set.
        var chwIdle44 = honourCommandedValve(state.mixedAirTemp, 'chwValvePosition', MAX_COIL_DROP, false);
        if (chwIdle44 === null) {
          state.chwValvePosition = 0;
          state.chwValveStatus = 'OFF';
          state.supplyAirTemp = state.mixedAirTemp;
        } else {
          state.chwValveStatus = state.chwValvePosition > 0 ? 'ON' : 'OFF';
          state.supplyAirTemp = chwIdle44;
        }
      }
    } else {
      state.chwValvePosition = 0;
      state.chwValveStatus = 'OFF';
      state.mixedAirTemp = RETURN_AIR_TEMP;
      state.supplyAirTemp = state.oaTemperature;
    }

    // Round outputs
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
    state.preheatTemp   = Math.round(state.preheatTemp   * 10) / 10;
    state.mixedAirTemp  = Math.round(state.mixedAirTemp  * 10) / 10;
    state.returnAirTemp = RETURN_AIR_TEMP;
    // Zone sensor: the return duct carries the air leaving the space, which is
    // what a BMS reports as zone temperature on a unit with no wall sensor.
    if (modes.spaceTemp !== 'Manual') {
      state.spaceTemp = state.returnAirTemp;
    }

    // ── Humidity model (SOO CLC #4) ──────────────────────────────────────────
    // Return Air RH maintained at 50% by resetting SAT setpoint for CHW coil.
    // When CHW valve is active, cooling coil removes moisture from the airstream.
    // OA RH now comes from the weather file rather than being inferred from
    // enthalpy; the old approximation (15 + (h-13)*2.8) stood in for a reading
    // this controller never received.
    var oaRH = state.oaRelHumidity;
    var oaFractionRH = state.oaDamperPosition / 100;
    // Return air drifts off its 50% target with outdoor humidity and is dried by
    // the cooling coil. Assigned here because the dehumidification call above
    // depends on it — it was reading an undefined field, so a cold humid day
    // could never open the cooling coil against a heating call.
    var returnAirRHRaw44 = 50
      + OA_RH_WEIGHT * (oaRH - 50) * oaFractionRH
      - DEHUMID_RH_WEIGHT * (state.chwValvePosition / 100);
    state.returnAirRH = Math.round(
      Math.max(RETURN_AIR_RH_MIN, Math.min(RETURN_AIR_RH_MAX, returnAirRHRaw44)) * 10
    ) / 10;
    // Mixed air humidity before coils (blend of OA and return air streams)
    var returnRH = state.returnAirRH;
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

  // Outdoor conditions used to be write-blocked here. They are now settable so
  // an instructor can hold a season; updateFromTMY3() yields to the override.

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

  /**
   * Returns a shallow copy of which state keys are currently flagged Manual.
   * Use: window.AHU44NewController.getModes()[stateKey] === 'Manual'
   */
  /**
   * Release ONE key's Manual override back to Auto (added for the point-detail
   * dialog's AUTO button). Additive: clearModes()/getModes() and every
   * existing caller behave exactly as before.
   */
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

  function getModes() {
    return Object.assign({}, modes);
  }

  /**
   * Push live TMY3 weather into the controller for the current simulation tick.
   * Yields to a manual override so a hand-set outdoor condition holds.
   *
   * @param {number} row - current simulation row (1-indexed)
   * @param {number} fraction - interpolation fraction between row and row+1 (0-1)
   */
  function updateFromTMY3(row, fraction) {
    if (!window.TMY3Projector || !window.TMY3Projector.interpolateWeather) return;

    var weather = window.TMY3Projector.interpolateWeather(row, fraction);
    if (!weather) return;

    // A hand-set outdoor condition outranks the TMY3 file, so an instructor can
    // hold "winter" or "humid summer" steady while the rest of the model runs.
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

  function subscribe(callback) {
    subscribers.push(callback);
    try { callback(state); } catch(e) {}
    return function unsubscribe() {
      subscribers = subscribers.filter(function(cb) { return cb !== callback; });
    };
  }

  // Per-unit seed values (AHU-4-3 runs the same sequences off its own numbers).
  if (seed) {
    for (var sk in seed) {
      if (Object.prototype.hasOwnProperty.call(seed, sk) && state.hasOwnProperty(sk)) {
        state[sk] = seed[sk];
      }
    }
  }

  // Initial calculation
  recalculate();

  // ─── Expose ─────────────────────────────────────────────────────────────────

  return {
    clearMode: clearMode,
    getState: getState,
    setValue: setValue,
    subscribe: subscribe,
    recalculate: recalculate,
    updateFromTMY3: updateFromTMY3,
    getModes: getModes,
    clearModes: function() {
      for (var ak in autoValues) {
        if (Object.prototype.hasOwnProperty.call(autoValues, ak) && state.hasOwnProperty(ak)) {
          state[ak] = autoValues[ak];
        }
      }
      modes = {}; manualValues = {}; autoValues = {};
      recalculate();
    },
  };
}

// AHU-4-4 keeps the exact global it always had.
window.AHU44NewController = CTA_createAHU44Controller();
window.CTA_createAHU44Controller = CTA_createAHU44Controller;
