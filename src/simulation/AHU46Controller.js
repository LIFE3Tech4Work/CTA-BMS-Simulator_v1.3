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

  // Return air temperature (SCENARIO_TRACKING.md item #12) — was a
  // hardcoded constant despite being labeled a live sensor (THS-4 in the
  // Points List). Modeled as supply air temp plus a fixed rise from
  // internal space heat gains (people, lights, equipment) — always
  // positive regardless of heating/cooling mode, since those gains are
  // present either way. Calibrated to the screenshot's supply/return pair
  // (59.9°F / 72.1°F, a 12.2°F rise); reads from the PREVIOUS tick's
  // supplyAirTemp (same one-tick-lag pattern as the duct pressure loop in
  // item #9 — this tick's supplyAirTemp depends on mixedAirTemp, which
  // depends on returnAirTemp, so it can't be both an input and an output
  // of the same tick). Bounded to a plausible comfort range.
  var ROOM_DELTA_T = 12.2;          // °F — space heat gain, supply → return
  var RETURN_AIR_TEMP_MIN = 60;     // °F
  var RETURN_AIR_TEMP_MAX = 85;     // °F

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

  // Freezestat trip temperature — SOO Safeties item 4 describes the element
  // ("serpentined across the inlet side of the cooling coil") and its
  // behavior in detail but gives no numeric trip setpoint. 38°F is a
  // standard, widely-used freezestat setpoint in real HVAC practice
  // (typically 35-40°F) — flagged here the same way the M-04 60%→50%
  // correction flagged an unconfirmed constant, since this one has no
  // document to check it against. Adjustable via the sidebar like every
  // other setpoint in this file, per General Automatic Control Sequences #9.
  var FREEZESTAT_TRIP_TEMP = 38;

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

  // Staged fan-start sequence — SOO "AHU-4-3 / RF-4-6: Sequence of
  // Operation", System Start #1-2: a start command doesn't snap straight to
  // running. The OA/RA dampers travel while the SF VFD waits out a 90-second
  // hardwired delay, then SF ramps to setpoint over 2 minutes (adjustable
  // minimum); once SF proves status the RF VFD waits its own 30-second
  // hardwired delay, then RF ramps over 2 more minutes; the assembly then
  // holds at speed for 2 minutes polling the connected VAV boxes before the
  // mixed air dampers are released to normal minimum-fresh-air-flow control.
  // 90 + 120 + 30 + 120 + 120 = 480 seconds total, which is
  // startingTimeSetpoint's default. These are fractions of that total so
  // adjusting it (SOO General Automatic Control Sequences #9: "all control
  // setpoints and variables shall be fully adjustable") scales every stage
  // proportionally. Real wall-clock seconds — tracked via Date.now(), the
  // only place in this file that depends on elapsed time rather than being
  // a pure function of current inputs. SCENARIO_TRACKING.md items #8/#25e.
  var START_STAGE_SF_DELAY_END = 90 / 480;   // damper travel / SF start delay ends
  var START_STAGE_SF_RAMP_END = 210 / 480;   // SF ramp (90+120) ends
  var START_STAGE_RF_DELAY_END = 240 / 480;  // RF start delay (210+30) ends
  // RF ramp + VAV-poll hold (240→480) aren't separately observable during
  // staging — RF's flow-tracking value (#10, below) only has meaning once
  // it's running against a settled SF flow, so RF simply flips to ON at
  // START_STAGE_RF_DELAY_END and the rest of the hold is just SF/RF holding
  // at speed until startingTimeSetpoint.

  // Duct static pressure control — SOO "AHU-4-3 / RF-4-6: Sequence of
  // Operation", page 5, Closed Loop Controller #5: the SF VFD's speed is
  // modulated to hold static pressure at a sensor 2/3 down the main supply
  // duct at an adjustable setpoint (1.0 in w.c.). As zone VAV boxes open
  // wider for more cooling, duct static pressure drops and the loop speeds
  // the fan up to compensate; as they throttle back, pressure rises and the
  // loop slows the fan down. There's no zone-level VAV model in this file
  // to drive that directly, so cooling coil demand (chwValvePosition, 0-1)
  // stands in as the load proxy — the SOO's own worked example is phrased
  // entirely in terms of the cooling call. Modeled with a standard
  // fan-affinity relationship (pressure ∝ speed²) plus a load term, then
  // solved algebraically for the fan speed that hits the setpoint exactly
  // — an instantaneous steady-state solve, not an iterative PI loop,
  // consistent with the rest of this file (no time-integration anywhere
  // else either). SCENARIO_TRACKING.md item #9.
  var DUCT_PRESSURE_LOAD_SENSITIVITY = 0.5;  // fraction pressure drops from load=0 to load=1
  // Calibrated so that at the default state (chwValvePosition=100%,
  // setpoint=1.0 in w.c.) the loop lands on 75% fan speed — matching the
  // screenshot's original fanSpeedSetpoint default, an independent sanity
  // check that this is a reasonably-scaled constant (same calibration
  // approach used for CHW_SUPPLY_*/CW_SUPPLY_* in items #25c/#25d).
  var DUCT_PRESSURE_NOMINAL = 1.0 / (0.75 * 0.75 * (1 - DUCT_PRESSURE_LOAD_SENSITIVITY));

  // Return fan flow-tracking control — SOO page 5, Closed Loop Controller
  // #6: RF VFD speed is modulated to track return flow at a setpoint
  // "dynamically calculated at 90% (adjustable) of the supply fan's flow,"
  // for slightly positive space pressurization. SCENARIO_TRACKING.md item
  // #10. No independent RF design-CFM figure is cited anywhere in the SOO,
  // so DESIGN_CFM (the SF figure) doubles as RF's 100%-speed capacity too
  // — same simplification VFD bypass (#7) already made for the supply
  // side.
  var RETURN_FAN_TRACKING_DEFAULT = 90; // % of supply CFM

  // Return air %RH disturbance model (SCENARIO_TRACKING.md items #12/#13)
  // — outdoor humidity pulls returnAirRH away from the 50% design target
  // in proportion to how much OA is being brought in; the cooling coil's
  // own dehumidification pulls it back down. Not a full moisture-balance
  // model — a simple, bounded proxy, same spirit as the CO2/supply-RH
  // formulas elsewhere in this file.
  var OA_RH_WEIGHT = 0.4;         // fraction of the OAT-RH gap that reaches return air at full ventilation
  var DEHUMID_RH_WEIGHT = 8;      // %RH pulled down at fully-open chwValvePosition
  var RETURN_AIR_RH_MIN = 30;     // %
  var RETURN_AIR_RH_MAX = 70;     // %

  // Automatic cooling-setpoint reset (SOO Closed Loop Controller #3
  // "Automatic" mode + Closed Loop Controller #4) — SCENARIO_TRACKING.md
  // item #13. Opt-in via coolingSetpointMode (default 'Manual', so the
  // existing default state — and every calibration elsewhere in this file
  // that assumes coolingCoilSetpoint=60°F, e.g. the duct pressure loop's
  // #9 and returnAirTemp's #12 default calibrations — is unaffected
  // unless an operator actively switches modes). When 'Automatic', resets
  // linearly between the SOO's two cited bounds: "the minimum value...
  // under humid conditions shall be 50°F" and "the maximum value... under
  // dry conditions shall be 60°F." The SOO doesn't give the RH range
  // those bounds correspond to, so a symmetric ±20% band around the 50%
  // target (30%-70%) is assumed.
  var COOLING_RESET_RH_HUMID = 70;  // % — pins to COOLING_RESET_SP_MIN above this
  var COOLING_RESET_RH_DRY = 30;    // % — pins to COOLING_RESET_SP_MAX below this
  var COOLING_RESET_SP_MIN = 50;    // °F
  var COOLING_RESET_SP_MAX = 60;    // °F

  // ─── Shared State Object ────────────────────────────────────────────────────

  var state = {
    // ═══ INPUTS (editable from Controls Sidebar) ════════════════════════════
    runSchedule: true,
    systemStarting: false,
    startingTimeSetpoint: 480,         // seconds — SOO System Start #1-2 stage sum (90+120+30+120+120)
    startingTimeLeft: 0,
    coolingCoilSetpoint: 60.0,        // °F — Manual value while coolingSetpointMode is 'Manual'
                                       // (the default); auto-reset from returnAirRH in 'Automatic'
    coolingSetpointMode: 'Manual',    // 'Manual' | 'Automatic' — SOO Closed Loop Controller #3's
                                       // two named modes. SCENARIO_TRACKING.md item #13.
    heatingCoilSetpoint: 55.0,        // °F
    plenumMinSetpoint: 40.0,          // °F — freeze protection
    oaTemperature: 81.6,              // °F — TMY3-driven; see WEATHER_DRIVEN_KEYS
    lowOATLockout: false,
    oaEnthalpy: 35.1,                 // BTU/lb — TMY3-driven; see WEATHER_DRIVEN_KEYS
    oaRelHumidity: 60,                 // % — TMY3-driven; see WEATHER_DRIVEN_KEYS.
                                        // Previously not pulled from weather at all
                                        // (only oaTemperature/oaEnthalpy were) — now
                                        // the disturbance signal behind returnAirRH.
                                        // SCENARIO_TRACKING.md item #13.
    enthalpyOKForEconomizer: false,
    economizerMinPosition: 50,        // % — OA damper floor (meeting room requirement, 50% per SOO min/max CFM table)
    minPositionFanSpeedLock: 5,       // %
    economizerTempControlSP: 58.0,    // °F
    co2Sensor: 479,                   // PPM (from screenshot)
    co2Setpoint: 900,                 // PPM
    minOAAirflowSetpoint: 4500,       // CFM (from screenshot: 4500 CFM)
    fanTrackMode: 'CFM',
    fanSpeedSetpoint: 75,             // % — Manual-able; auto-modulated by the duct static
                                       // pressure loop otherwise (SCENARIO_TRACKING.md item #9)
    ductStaticPressureSetpoint: 1.0,  // in w.c. — SOO Closed Loop Controller #5
    returnFanFlowTrackingSetpoint: 90, // % of supply CFM — SOO Closed Loop Controller #6
    fireAlarmShutdown: false,
    fireAlarmSmokePurge: false,
    supplyFanVFDBypass: false,        // SOO General Automatic Control Sequences #16
    returnFanVFDBypass: false,        // (VFD-in-bypass alarm) — SCENARIO_TRACKING.md item #7
    supplyFanVFDFault: false,         // Points List items 32/35 — SCENARIO_TRACKING.md item #23
    returnFanVFDFault: false,
    interlockOn: true,
    exhaustFanOn: true,
    commonDamperOpen: true,
    freezePumpOn: true,

    // ═══ SAFETY / INTERLOCK LAYER (SCENARIO_TRACKING.md items #21, #22, #24) ═
    // DPS-1 (filter dirty) is alarm-only, non-critical, no shutdown — SOO
    // Safeties item 1. DPS-2 through DPS-5 (high suction/static pressure on
    // each fan) are all "the manual reset type" per the SOO — modeled as
    // plain field-condition booleans (a real pressure switch trip isn't
    // something derivable from other simulated state, same reasoning as
    // supplyFanVFDBypass) that LATCH until resetPressed clears them, same
    // as freezestatShutdown below. SOO Safeties items 2-6.
    filterDirty: false,
    dps2Tripped: false,               // Supply Fan High Suction Pressure
    dps3Tripped: false,               // Supply Fan High Static Pressure
    dps4Tripped: false,               // Return Fan High Suction Pressure
    dps5Tripped: false,               // Return Fan High Static Pressure
    freezestatDelaySetpoint: 180,     // seconds — SOO Safeties item 4 ("3 minutes (adjustable)")
    resetPressed: false,              // momentary — Points List item 31
    softwareLockout: false,           // sustained — Points List item 44

    // ═══ OUTPUTS (calculated — READ-ONLY on diagram) ═══════════════════════
    freezestatTripped: false,         // instantaneous element reading — SOO Safeties item 4
    freezestatShutdown: false,        // latched, hardwired, manual-reset — SOO Safeties item 4
    hardSafetyShutdown: false,        // OR of every hard-shutdown condition (fire alarm, freezestat,
                                       // DPS-2..5, software lockout, VFD fault) — single point fan
                                       // logic and staged-start check instead of repeating the list
    supplyFanVFDDamperRequest: false, // Points List item 34 — VFD requesting damper travel before
    returnFanVFDDamperRequest: false, // it's permitted to ramp; tied to the staged-start damper-
                                       // travel stage (SCENARIO_TRACKING.md item #8)
    fanRunning: true,
    fanSpeed: 75,
    cfm: 6901,                        // Supply air CFM (75% × 9200 ≈ 6900)
    ductStaticPressure: 1.0,          // in w.c. — SCENARIO_TRACKING.md item #9
    returnFanCFM: 0,                  // CFM — 90% of supply flow once running; SCENARIO_TRACKING.md item #10
    oaCFM: 4500,                      // OA CFM at 50% minimum (= minOAAirflowSetpoint)
    oaDamperPosition: 50,             // % (at minimum position)
    economizerActive: false,
    phtValvePosition: 0,              // %
    chwValvePosition: 38,             // % (from screenshot: 38%)
    supplyAirTemp: 59.9,              // °F (from screenshot)
    preheatTemp: 81.6,                // °F — after preheat coil (= OAT when no heating)
    mixedAirTemp: 73.6,               // °F (from screenshot)
    returnAirTemp: 72.1,               // °F — dynamic (supplyAirTemp + ROOM_DELTA_T, previous tick);
                                        // initial value from screenshot, SCENARIO_TRACKING.md item #12
    returnAirRH: 50.0,                // %RH — SOO Closed Loop Controller #4 item 1: "Relative Humidity@
                                       // THS-4 (Return Air) shall be maintained at 50%" by a separate,
                                       // not-otherwise-modeled reset loop — held at design value rather
                                       // than freely floating, since the SOO itself describes this as an
                                       // actively controlled-to setpoint, not a passive reading.
                                       // SCENARIO_TRACKING.md item #12.
    supplyAirRH: 72.3,                // %RH — renamed from supplyStaticPressure (SCENARIO_TRACKING.md
                                       // item #25b); it was never static pressure, always supply air %RH
    chwSupplyTemp: 41.9,              // °F — plant global condition, reset with load (see CHW_SUPPLY_MIN/MAX)
    cwSupplyTemp: 77.7,               // °F — plant global condition, follows OAT (see CW_SUPPLY_MIN/MAX)
    phtValveStatus: 'OFF',
    chwValveStatus: 'ON',
    supplyFanStatus: 'ON',
    returnFanStatus: 'ON',
    exhaustDamperPct: 50,             // % (follows OA damper)
    returnAirDamperPosition: 50,      // % — complementary to oaDamperPosition; SOO Closed Loop
                                       // Controller #8 item 11b. SCENARIO_TRACKING.md item #11.
    spillDamperPosition: 50,          // % — tracks oaDamperPosition (N.O., opens for more fresh air)
  };

  window.AHU46State = state;

  var subscribers = [];

  // Tracks which state keys have been manually overridden via the Controls
  // Sidebar. Same pattern as AHU44NewController.js — only keys actually
  // passed to setValue() appear here. oaDamperPosition is the one output
  // field that can also be flagged Manual (see file header).
  var modes = {};

  // Staged fan-start bookkeeping (SCENARIO_TRACKING.md #8). wasRunCommanded
  // starts true to match the default state's runSchedule=true/
  // fireAlarmShutdown=false — the unit boots up already running (matching
  // every other screenshot-derived default in this file), not mid-startup.
  // Only a LATER false→true edge (e.g. a fire-alarm shutdown clearing, or
  // runSchedule being turned back on) kicks off the staged sequence.
  var wasRunCommanded = true;
  var startCommandedAt = null;
  var freezestatTrippedSince = null;  // wall-clock — mirrors startCommandedAt's pattern

  // ─── Engineering Calculations ───────────────────────────────────────────────

  // Computes every output field the normal steps 1/1.5/2 below would
  // otherwise compute, for one tick partway through the staged start
  // sequence. See the START_STAGE_* constants' comment for the stage
  // breakdown this implements.
  function applyStagedStart(elapsedSec, total) {
    var sfDelayEnd = total * START_STAGE_SF_DELAY_END;
    var sfRampEnd = total * START_STAGE_SF_RAMP_END;
    var rfDelayEnd = total * START_STAGE_RF_DELAY_END;

    var fanOn = elapsedSec >= sfDelayEnd;
    state.fanRunning = fanOn;
    state.supplyFanStatus = fanOn ? 'ON' : 'OFF';
    state.returnFanStatus = (elapsedSec >= rfDelayEnd) ? 'ON' : 'OFF';
    state.interlockOn = fanOn;
    state.exhaustFanOn = fanOn;
    state.commonDamperOpen = fanOn;

    if (!fanOn) {
      // Pre-start: OA/RA dampers traveling, SF/RF both still off.
      state.fanSpeed = 0;
      state.cfm = 0;
      var travelFraction = sfDelayEnd > 0 ? Math.min(1, elapsedSec / sfDelayEnd) : 1;
      state.oaDamperPosition = Math.round(OA_DAMPER_FLOOR * travelFraction);
    } else if (elapsedSec < sfRampEnd) {
      // SF ramping from its minimum-position lock speed up to setpoint.
      var rampSpan = sfRampEnd - sfDelayEnd;
      var rampFraction = rampSpan > 0 ? (elapsedSec - sfDelayEnd) / rampSpan : 1;
      state.fanSpeed = Math.round(
        state.minPositionFanSpeedLock + rampFraction * (state.fanSpeedSetpoint - state.minPositionFanSpeedLock)
      );
      state.cfm = Math.round(DESIGN_CFM * state.fanSpeed / 100);
      state.oaDamperPosition = OA_DAMPER_FLOOR;
    } else {
      // SF holding at setpoint speed; RF starting/holding; VAV poll hold.
      state.fanSpeed = state.fanSpeedSetpoint;
      state.cfm = Math.round(DESIGN_CFM * state.fanSpeed / 100);
      state.oaDamperPosition = OA_DAMPER_FLOOR;
    }

    // No economizer/CO₂ DCV authority until the sequence completes — the
    // SOO holds the mixed air dampers at minimum through the whole start.
    state.economizerActive = false;
    state.oaCFM = fanOn
      ? Math.min(Math.round(state.minOAAirflowSetpoint * (state.oaDamperPosition / state.economizerMinPosition)), state.cfm)
      : 0;
    state.exhaustDamperPct = fanOn ? state.oaDamperPosition : 0;

    // Duct static pressure (#9) and return fan flow tracking (#10) — no
    // closed-loop authority during staging either (SF/RF are following the
    // fixed ramp above, not a pressure/flow setpoint), but the sensor
    // readings still reflect whatever fanSpeed/cfm actually are.
    var loadProxy = state.chwValvePosition / 100;
    state.ductStaticPressure = fanOn
      ? Math.round(
          DUCT_PRESSURE_NOMINAL * Math.pow(state.fanSpeed / 100, 2) *
          (1 - DUCT_PRESSURE_LOAD_SENSITIVITY * loadProxy) * 100
        ) / 100
      : 0;
    state.returnFanCFM = (state.returnFanStatus === 'ON')
      ? (state.returnFanVFDBypass ? DESIGN_CFM : Math.round(state.cfm * (state.returnFanFlowTrackingSetpoint / 100)))
      : 0;
  }

  function recalculate() {

    // SAFETY / INTERLOCK LAYER (SOO Safeties items 1-6, General #2) —
    // SCENARIO_TRACKING.md items #21, #22, #24. Computed first because the
    // staged-start block right below and the fan-logic block further down
    // both need to know whether ANY hard safety condition is active, not
    // just fireAlarmShutdown. Freezestat uses the PREVIOUS tick's
    // mixedAirTemp (still present in state at this point) — same one-tick-
    // lag convention used elsewhere in this file for values that would
    // otherwise depend circularly on this tick's own output.

    // Freezestat: "a freezestat with its element serpentined across the
    // inlet side of the cooling coil will shut down the supply fan by
    // hardwired time delayed interlock... open the heating coil control
    // valve 100% and activate a critical alarm... a hardwired time delay
    // relay... provide 3 minutes (adjustable) delay prior to supply fan
    // shutdown... a manual reset shall be required." Only meaningful while
    // air was actually crossing the coil last tick — with the fan off,
    // dampers are closed (System Off #1) and no cold air stream reaches
    // the element.
    state.freezestatTripped = state.fanRunning && state.mixedAirTemp < FREEZESTAT_TRIP_TEMP;
    if (state.freezestatTripped) {
      if (freezestatTrippedSince === null) freezestatTrippedSince = Date.now();
      var trippedSec = (Date.now() - freezestatTrippedSince) / 1000;
      if (trippedSec >= state.freezestatDelaySetpoint) {
        state.freezestatShutdown = true; // latches — persists even if the trip clears next tick
      }
    } else {
      freezestatTrippedSince = null; // nuisance-delay timer resets if the trip clears before it elapses
    }

    // Manual reset (Points List item 31) — momentary. Clears every latched
    // trip whose underlying field condition has cleared; a still-active
    // condition immediately re-trips in the real world, so resetting it
    // here would be meaningless (and for the DPS points, actively
    // misleading — see this same field's other use as the live condition).
    if (state.resetPressed) {
      // NOTE: freezestatTripped requires fanRunning (see above — it's only
      // meaningful while air is actually crossing the coil), but the fan
      // is ALWAYS off by the time a freezestatShutdown trip has latched —
      // that's the trip's own effect. Gating the reset on freezestatTripped
      // would therefore always read false post-shutdown regardless of
      // actual risk, letting a reset succeed unconditionally the instant
      // it's pressed. Checking oaTemperature directly instead — a real
      // freezestat element senses coil-area temperature independent of
      // airflow, and OAT is the practical field signal a technician
      // actually checks before resetting: "is it still cold enough outside
      // that restarting the fan would immediately re-trip this."
      if (state.oaTemperature >= FREEZESTAT_TRIP_TEMP) state.freezestatShutdown = false;
      state.dps2Tripped = false;
      state.dps3Tripped = false;
      state.dps4Tripped = false;
      state.dps5Tripped = false;
      state.resetPressed = false; // momentary contact — consumed within the same tick
    }

    state.hardSafetyShutdown = state.fireAlarmShutdown || state.freezestatShutdown ||
      state.dps2Tripped || state.dps3Tripped || state.dps4Tripped || state.dps5Tripped ||
      state.softwareLockout || state.supplyFanVFDFault || state.returnFanVFDFault;

    // STAGED FAN-START SEQUENCING (SOO System Start #1-2) — detects a
    // start command (runSchedule on AND no hard safety shutdown) and, on
    // the rising edge, begins the staged sequence rather than snapping
    // straight to running. See applyStagedStart() above for the stage
    // breakdown. Any hard safety shutdown or runSchedule=false at any
    // point aborts the sequence immediately (life-safety overrides win —
    // General Automatic Control Sequences #4) and the next start command
    // begins fresh.
    var runCommanded = state.runSchedule && !state.hardSafetyShutdown;
    if (runCommanded && !wasRunCommanded) {
      startCommandedAt = Date.now();
      state.systemStarting = true;
    }
    wasRunCommanded = runCommanded;

    if (!runCommanded) {
      state.systemStarting = false;
      state.startingTimeLeft = 0;
    } else if (state.systemStarting) {
      var elapsedSec = (Date.now() - startCommandedAt) / 1000;
      if (elapsedSec >= state.startingTimeSetpoint) {
        state.systemStarting = false;
        state.startingTimeLeft = 0;
        // Falls through to the normal steps below for this tick — a clean
        // hand-off since applyStagedStart()'s final-stage values already
        // match what step 1/2 compute for a fully-running unit at floor.
      } else {
        state.startingTimeLeft = Math.max(0, Math.round(state.startingTimeSetpoint - elapsedSec));
        applyStagedStart(elapsedSec, state.startingTimeSetpoint);
      }
    } else {
      state.startingTimeLeft = 0;
    }

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

    // 1. FAN LOGIC — skipped while a staged start is in progress;
    // applyStagedStart() already set fanRunning/fanSpeed/cfm/status for
    // this tick (see the sequencing block above).
    if (state.systemStarting) {
      // handled above
    } else if (state.hardSafetyShutdown || !state.runSchedule) {
      state.fanRunning = false;
      state.fanSpeed = 0;
      state.cfm = 0;
      state.oaCFM = 0;
      state.ductStaticPressure = 0;
      state.supplyFanStatus = 'OFF';
      state.returnFanStatus = 'OFF';
    } else {
      state.fanRunning = true;
      if (state.supplyFanVFDBypass) {
        // SOO General Automatic Control Sequences #16: "For each variable
        // speed motor an alarm shall be annunciated at the BAS whenever
        // the drive is placed in bypass." In bypass the VFD is out of the
        // control loop entirely — the motor runs across-the-line at
        // full, uncontrolled speed. See M-05 in AHU46FaultEngine.js
        // (SCENARIO_TRACKING.md item #7).
        state.fanSpeed = 100;
      } else if (modes.fanSpeedSetpoint === 'Manual') {
        state.fanSpeed = state.fanSpeedSetpoint;
      } else {
        // DUCT STATIC PRESSURE CONTROL (SOO Closed Loop Controller #5) —
        // was a raw, un-modulated operator number. Solves for the fan
        // speed that hits ductStaticPressureSetpoint given the current
        // load proxy (chwValvePosition from the PREVIOUS tick — see the
        // bootstrap comment above). See the DUCT_PRESSURE_* constants'
        // comment for the model. SCENARIO_TRACKING.md item #9.
        var loadProxy = state.chwValvePosition / 100;
        var pressureFactor = DUCT_PRESSURE_NOMINAL * (1 - DUCT_PRESSURE_LOAD_SENSITIVITY * loadProxy);
        var solvedSpeed = 100 * Math.sqrt(state.ductStaticPressureSetpoint / pressureFactor);
        state.fanSpeed = Math.round(Math.max(state.minPositionFanSpeedLock, Math.min(100, solvedSpeed)));
      }
      state.cfm = Math.round(DESIGN_CFM * state.fanSpeed / 100);
      // Sensor reading reflects whatever fanSpeed actually is (manual/
      // bypass included) — the closed loop only converges this to the
      // setpoint when it's actually in control.
      var loadForReading = state.chwValvePosition / 100;
      state.ductStaticPressure = Math.round(
        DUCT_PRESSURE_NOMINAL * Math.pow(state.fanSpeed / 100, 2) *
        (1 - DUCT_PRESSURE_LOAD_SENSITIVITY * loadForReading) * 100
      ) / 100;
      state.supplyFanStatus = 'ON';
      state.returnFanStatus = 'ON';
    }

    // VFD DAMPER REQUEST (Points List items 34/37) — the drive's signal
    // requesting permission to open its associated dampers before it's
    // allowed to ramp. Active throughout a staged start (SOO System Start
    // #1-2's damper-travel-then-ramp sequence, SCENARIO_TRACKING.md item
    // #8) — a plain instantaneous "running" state doesn't request travel,
    // since the dampers are already wherever they need to be by then.
    state.supplyFanVFDDamperRequest = state.systemStarting;
    state.returnFanVFDDamperRequest = state.systemStarting;

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
    // Skipped during staging — applyStagedStart() already set these to
    // track the staged fanOn state, which lags the plain "commanded to
    // run" signal by design (SOO System Start #1-2).
    if (!state.systemStarting) {
      state.interlockOn = state.fanRunning;
      state.exhaustFanOn = state.fanRunning;
      state.commonDamperOpen = state.fanRunning;
    }

    // 1.55 RETURN FAN FLOW TRACKING (SOO Closed Loop Controller #6) — was
    // no numeric field at all, just the ON/OFF returnFanStatus text. Once
    // RF is actually running (post-interlock, and — during a staged start
    // — past its own 30s delay), it tracks a flow setpoint dynamically
    // calculated as returnFanFlowTrackingSetpoint% (default 90%, adjustable)
    // of the supply fan's current flow, "for slightly positive
    // pressurization of the areas." In bypass the drive is out of the
    // loop and runs across-the-line at full capacity instead (same
    // pattern as supplyFanVFDBypass — see M-06, SCENARIO_TRACKING.md item
    // #7). SCENARIO_TRACKING.md item #10.
    if (state.returnFanStatus === 'ON') {
      state.returnFanCFM = state.returnFanVFDBypass
        ? DESIGN_CFM
        : Math.round(state.cfm * (state.returnFanFlowTrackingSetpoint / 100));
    } else {
      state.returnFanCFM = 0;
    }

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

    // 2. ECONOMIZER LOGIC — skipped during staging (applyStagedStart()
    // already held oaDamperPosition/oaCFM/economizerActive appropriately;
    // the SOO gives the economizer/CO₂ DCV no authority until the staged
    // sequence completes).
    if (!state.systemStarting) {
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
    }

    state.exhaustDamperPct = state.fanRunning ? state.oaDamperPosition : 0;

    // 2.5 RETURN AIR / SPILL DAMPERS (SOO Closed Loop Controller #8 item
    // 11a-b) — "The mixed air dampers consist of three modulating dampers
    // that shall be together controlled..." Only the outside air damper
    // was modeled; return air (N.C.) and spill (N.O.) were missing
    // entirely. Per 11b, "[t]he outside and spill damper shall gradually
    // open upon a demand for additional fresh air as the return damper
    // closes accordingly" — return air damper is complementary to the OA
    // damper, spill tracks it directly. Both close fully when the fan is
    // off, matching SOO System Off #1 ("the outside air, return air
    // [and] spill air dampers will be closed"), not the naive
    // complementary value (100 − 0 = 100) that formula would otherwise
    // give at a closed OA damper. SCENARIO_TRACKING.md item #11.
    if (state.fanRunning) {
      state.returnAirDamperPosition = 100 - state.oaDamperPosition;
      state.spillDamperPosition = state.oaDamperPosition;
    } else {
      state.returnAirDamperPosition = 0;
      state.spillDamperPosition = 0;
    }

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

    // Freezestat shutdown forces the heating coil valve 100% open per SOO
    // Safeties item 4 — an explicit, documented exception to the mutual-
    // exclusivity rule (item #10/#1 above), not a violation of it: the
    // coil is being flooded with hot water to thaw it, unrelated to
    // whatever the normal heating-call logic above just computed. Applies
    // even though the fan itself is off (freezestatShutdown always implies
    // hardSafetyShutdown implies fanRunning=false) — the valve is a
    // life-safety response to the water side, not the air side.
    if (state.freezestatShutdown) {
      state.phtValvePosition = 100;
      state.phtValveStatus = 'ON';
      state.preheatTemp = state.oaTemperature + 20; // coil fully flooded — same rise-per-100% used elsewhere in this block
    }

    // 3.5 AUTOMATIC COOLING SETPOINT RESET (SOO Closed Loop Controller #3
    // "Automatic" mode, reset per Closed Loop Controller #4) — was
    // entirely absent; the model only ever had the "Manual" mode
    // (SCENARIO_TRACKING.md item #13). Opt-in via coolingSetpointMode —
    // while 'Manual' (the default), coolingCoilSetpoint behaves exactly
    // as before (a plain operator setpoint). While 'Automatic', it's
    // reset linearly between the SOO's cited 50°F (humid) / 60°F (dry)
    // bounds based on returnAirRH — read from the PREVIOUS tick, same
    // one-tick-lag pattern as items #9/#12 (returnAirRH itself isn't
    // finalized for THIS tick until after COOLING LOGIC runs, since it
    // depends on this tick's chwValvePosition).
    if (state.coolingSetpointMode === 'Automatic') {
      var coolingResetRaw = COOLING_RESET_SP_MAX -
        (state.returnAirRH - COOLING_RESET_RH_DRY) / (COOLING_RESET_RH_HUMID - COOLING_RESET_RH_DRY) *
        (COOLING_RESET_SP_MAX - COOLING_RESET_SP_MIN);
      state.coolingCoilSetpoint = Math.round(
        Math.max(COOLING_RESET_SP_MIN, Math.min(COOLING_RESET_SP_MAX, coolingResetRaw)) * 10
      ) / 10;
    }

    // 4. COOLING LOGIC (Closed Loop Controller #3 — Supply Temperature
    //    Control of Cooling Coil)
    if (state.fanRunning) {
      var oaFraction = state.oaDamperPosition / 100;
      state.mixedAirTemp = Math.round(
        (state.preheatTemp * oaFraction + state.returnAirTemp * (1 - oaFraction)) * 10
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
      state.mixedAirTemp = state.returnAirTemp;
      state.supplyAirTemp = state.oaTemperature;
    }

    state.supplyAirTemp = Math.round(state.supplyAirTemp * 10) / 10;
    state.preheatTemp = Math.round(state.preheatTemp * 10) / 10;
    state.mixedAirTemp = Math.round(state.mixedAirTemp * 10) / 10;
    state.returnAirTemp = Math.round(
      Math.max(RETURN_AIR_TEMP_MIN, Math.min(RETURN_AIR_TEMP_MAX, state.supplyAirTemp + ROOM_DELTA_T)) * 10
    ) / 10;

    // 5. CO2 SENSOR (SCENARIO_TRACKING.md #25a) — was frozen at its
    // screenshot value forever; ties to the AHU's own ventilation rate.
    // Respects Manual override the same way oaDamperPosition does (it's
    // editable from the Controls Sidebar as "Controlling CO2 Sensor").
    // Note (SCENARIO_TRACKING.md #8): a unit that was truly off (fan not
    // running) legitimately shows an elevated reading here going into a
    // staged start, and stage 1's ~90s fan-off delay simply holds that
    // already-elevated value — it isn't a new artifact of staging, and it
    // self-corrects within stage 2 once ventilation resumes.
    if (modes.co2Sensor !== 'Manual') {
      var ventilationRatio = state.fanRunning
        ? Math.min(1, state.oaCFM / state.minOAAirflowSetpoint)
        : 0;
      state.co2Sensor = Math.round(
        CO2_DESIGN_OCCUPIED_CEILING - ventilationRatio * (CO2_DESIGN_OCCUPIED_CEILING - CO2_OUTDOOR_BASELINE)
      );
    }

    // 5.5 RETURN AIR %RH (SCENARIO_TRACKING.md items #12/#13 — revised
    // from #12's original batch: initially modeled as a flat 50%, per the
    // SOO's citation that it's "maintained at 50%." But that citation
    // describes the RESULT of Closed Loop Controller #4's automatic reset
    // loop (item #13) constantly correcting it back toward 50%, not a
    // trivially-constant value — a flat RH would give #13's reset formula
    // nothing to ever react to. Now a genuine disturbance-driven reading:
    // outdoor humidity (brought in through the OA damper, scaled by
    // ventilation fraction) pulls it away from 50%, and the cooling coil's
    // own dehumidification (condensing moisture off a wet coil, same
    // mechanism as supplyAirRH's rise toward saturation below) pulls it
    // back down. No time-integration — instantaneous per tick, same as
    // every other reading in this file.
    var oaFractionForRH = state.oaDamperPosition / 100;
    var returnAirRHRaw = 50
      + OA_RH_WEIGHT * (state.oaRelHumidity - 50) * oaFractionForRH
      - DEHUMID_RH_WEIGHT * (state.chwValvePosition / 100);
    state.returnAirRH = Math.round(
      Math.max(RETURN_AIR_RH_MIN, Math.min(RETURN_AIR_RH_MAX, returnAirRHRaw)) * 10
    ) / 10;

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

  var WEATHER_DRIVEN_KEYS = { oaTemperature: true, oaEnthalpy: true, oaRelHumidity: true };

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
    state.oaRelHumidity = weather.relHumidity;
    recalculate();
  }

  function subscribe(callback) {
    subscribers.push(callback);
    try { callback(state); } catch(e) {}
    return function unsubscribe() {
      subscribers = subscribers.filter(function(cb) { return cb !== callback; });
    };
  }

  // Two ticks at bootstrap: the duct static pressure loop (item #9) reads
  // chwValvePosition to gauge load, but chwValvePosition itself isn't
  // computed until COOLING LOGIC runs later in the same recalculate() —
  // one tick behind, same as a real control loop only ever acting on its
  // most recent measurement. The first call here settles chwValvePosition
  // from its stale declared default; the second lets the pressure loop
  // converge against that settled value before any caller ever observes
  // the state, so default-state reads are already at steady state.
  recalculate();
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
