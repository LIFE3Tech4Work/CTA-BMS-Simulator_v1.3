/**
 * AHU46FaultEngine.js — Fault detection rules for AHU-4-6
 *
 * Mirrors AHU44NewFaultEngine.js's rule pattern, adapted for the Meeting
 * Room 2nd Level AHU. Fault rule IDs use the M-series prefix (M-01..M-07)
 * to distinguish from AHU-4-4's N-series rules.
 *
 * M-01: Supply air too warm — cooling coil cannot maintain setpoint
 * M-02: CO₂ exceeds 1,100 ppm (ASHRAE 62.1 upper guideline)
 * M-03: Economizer active while mechanical cooling still engaged (see the
 *        rule's own comment below — SCENARIO_TRACKING.md item #15)
 * M-04: OA damper below ASHRAE 62.1 minimum (50% for meeting rooms)
 *        Note: the 50% floor makes this fault pedagogically distinct —
 *        a damper stuck at 10% on this unit starves 2.5× more fresh air
 *        than the same fault would on AHU-4-4 (20% floor).
 * M-05: Supply Fan VFD in bypass (SOO General Automatic Control Sequences #16)
 * M-06: Return Fan VFD in bypass (SOO General Automatic Control Sequences #16)
 * M-07: One or more points forced to Manual — alarm-worthy independent of
 *        value (Lev Chesnov, BMS training session 07-31-26). Needs the
 *        controller's Manual-override map, not just its state snapshot —
 *        see evaluate()'s second `modes` argument below.
 * M-08: Filter dirty (DPS-1) — non-critical, alarm only, no shutdown
 * M-09: High suction/static pressure trip (DPS-2..5, any fan) — manual
 *        reset type; unified into one rule the same way M-07 lists which
 *        points, rather than four nearly-identical rules
 * M-10: Freezestat warning — instantaneous element trip, before the
 *        3-minute nuisance delay elapses (advisory, not yet a shutdown)
 * M-11: Freezestat shutdown — critical, latched, manual-reset-required
 *        (SOO Safeties item 4)
 * M-12: Supply/Return Fan VFD fault (unified, same pattern as M-09)
 * M-13: Software lockout active
 *
 * Attached to window.AHU46FaultEngine (no import/export — Babel standalone).
 */

(function() {
  'use strict';

  var activeAlarms = {};

  var rules = [
    {
      id: 'M-01',
      description: 'Supply air temp exceeds cooling setpoint — cooling coil unable to maintain discharge setpoint (chilled water pressure, valve fault, or coil fouling)',
      priority: 'high',
      sourceField: 'supplyAirTemp',
      relatedStateKeys: ['supplyAirTemp', 'coolingCoilSetpoint', 'chwValvePosition', 'phtValvePosition'],
      condition: function(state) {
        if (state.supplyAirTemp === undefined || state.coolingCoilSetpoint === undefined) return false;
        if (!state.fanRunning) return false;
        // SOO "AHU-4-3 / RF-4-6: Sequence of Operation" General Automatic
        // Control Sequences #10: heating and cooling coil valves are
        // mutually exclusive. When the preheat coil is active, the
        // cooling coil correctly stays closed and defers to it (see
        // AHU46Controller.js's cooling-logic block) — supply air sitting
        // above the cooling setpoint in that state is expected heating-
        // priority behavior, not a cooling-coil malfunction. Only flag
        // M-01 when cooling SHOULD be correcting supply temp and isn't.
        if (state.phtValvePosition > 0) return false;
        return state.supplyAirTemp > (state.coolingCoilSetpoint + 3);
      }
    },
    {
      id: 'M-02',
      description: 'CO₂ exceeds ventilation threshold (>1,100 ppm, ASHRAE 62.1 upper guideline) — meeting-room occupancy driving up CO₂ faster than OA delivery can dilute it',
      priority: 'urgent',
      sourceField: 'co2Sensor',
      relatedStateKeys: ['co2Sensor'],
      condition: function(state) {
        if (state.co2Sensor === undefined) return false;
        return state.co2Sensor > 1100;
      }
    },
    {
      // SCENARIO_TRACKING.md item #15: unlike every other rule here, this
      // one has no direct SOO citation — flagged during the audit and
      // verified rather than left as-is or silently dropped. This
      // controller's economizer is binary (SOO Closed Loop Controller #2:
      // active means the OA damper snaps to 100%, not a modulating
      // partial-fresh-air position — see AHU46Controller.js's economizer
      // logic), so when it's active the outdoor air alone is *by design*
      // supposed to be capable of meeting the cooling load without
      // mechanical assistance (that's the whole point of switching to
      // 100% OA instead of running the chiller). Under the model's own
      // default setpoints this never fires: the economizer's own enable
      // condition (OAT < economizerTempControlSP, 58°F default) already
      // keeps mixed air below the cooling setpoint (60°F default) whenever
      // the economizer is active without a heating call. It becomes
      // reachable only through the exact misconfiguration named in the
      // description below (economizerTempControlSP pushed above
      // coolingCoilSetpoint) — a real operator-error scenario, not a
      // theoretical one. Best available attribution is the general
      // industry/ASHRAE 90.1 principle against unnecessary simultaneous
      // mechanical cooling during economizer operation, already referenced
      // elsewhere in this curriculum (docs/BMS_ALIGNED_REQUIREMENTS.md:
      // "90.1 mandates economizer operation and limits simultaneous
      // heating/cooling") — not a specific SOO clause, and this rule's
      // description is written to be honest about that rather than imply
      // otherwise.
      id: 'M-03',
      description: 'Economizer fully open (free cooling) while mechanical cooling (CHW valve) is still active — setpoint and economizer changeover SP may be misconfigured (ASHRAE 90.1 simultaneous-cooling principle; no direct SOO citation — see SCENARIO_TRACKING.md item #15)',
      priority: 'high',
      sourceField: 'chwValvePosition',
      relatedStateKeys: ['chwValvePosition', 'economizerActive'],
      condition: function(state) {
        if (state.economizerActive === undefined || state.chwValvePosition === undefined) return false;
        return state.economizerActive === true && state.chwValvePosition > 0;
      }
    },
    {
      id: 'M-04',
      description: 'OA damper below the ASHRAE 62.1 minimum position (50%, per the SOO min/max CFM table: 4,500/9,000 CFM) while fan is running — ventilation shortfall. At 50% min, this fault is especially significant: a stuck damper at 10% starves meeting-room occupants of ~3,600 CFM of required fresh air.',
      priority: 'high',
      sourceField: 'oaDamperPosition',
      relatedStateKeys: ['oaDamperPosition', 'oaCFM', 'minOAAirflowSetpoint'],
      condition: function(state) {
        if (state.fanRunning === undefined || state.oaDamperPosition === undefined) return false;
        return state.fanRunning === true && state.oaDamperPosition < 50;
      }
    },
    {
      id: 'M-05',
      description: 'Supply Fan VFD in bypass — drive is out of the control loop, motor running across-the-line at uncontrolled speed (SOO General Automatic Control Sequences #16: "an alarm shall be annunciated at the BAS whenever the drive is placed in bypass")',
      priority: 'high',
      sourceField: 'supplyFanVFDBypass',
      relatedStateKeys: ['supplyFanVFDBypass', 'fanSpeed', 'fanSpeedSetpoint'],
      condition: function(state) {
        if (state.supplyFanVFDBypass === undefined) return false;
        return state.supplyFanVFDBypass === true;
      }
    },
    {
      id: 'M-06',
      description: 'Return Fan VFD in bypass — drive is out of the control loop, motor running across-the-line at uncontrolled speed (SOO General Automatic Control Sequences #16: "an alarm shall be annunciated at the BAS whenever the drive is placed in bypass")',
      priority: 'high',
      sourceField: 'returnFanVFDBypass',
      relatedStateKeys: ['returnFanVFDBypass'],
      condition: function(state) {
        if (state.returnFanVFDBypass === undefined) return false;
        return state.returnFanVFDBypass === true;
      }
    },
    {
      // SCENARIO_TRACKING.md item #16 — Lev Chesnov, BMS training session
      // (07-31-26): forcing any point to Manual is itself alarm-worthy,
      // independent of the value it's been forced to, since a forgotten
      // override can silently mask a real fault (e.g. a damper stuck at a
      // reasonable-looking position because an operator manually set it
      // there weeks ago and never returned it to auto). Unlike every
      // other rule here, this one has no single sourceField — it's driven
      // by the controller's Manual-override map (getModes()), passed in
      // as evaluate()'s second argument, not the state snapshot. value is
      // the list of keys currently in Manual (frozen at first-fire, same
      // as every other rule's value — see evaluate()'s comment).
      id: 'M-07',
      description: 'One or more points forced to Manual override — program has yielded control authority for that point; verify this is intentional',
      priority: 'medium',
      sourceField: null,
      relatedStateKeys: [],
      condition: function(state, modes) {
        if (!modes) return false;
        return Object.keys(modes).some(function(k) { return modes[k] === 'Manual'; });
      }
    },
    {
      id: 'M-08',
      description: 'Dirty filter (DPS-1) — differential pressure switch across the filter section exceeds its setpoint. Non-critical: monitoring only, no shutdown (SOO Safeties item 1).',
      priority: 'low',
      sourceField: 'filterDirty',
      relatedStateKeys: ['filterDirty'],
      condition: function(state) {
        return state.filterDirty === true;
      }
    },
    {
      id: 'M-09',
      description: 'High suction or static pressure trip (DPS-2 through DPS-5) — protects the air handler from blockage; manual reset type (SOO Safeties items 2-6).',
      priority: 'high',
      sourceField: null,
      relatedStateKeys: ['dps2Tripped', 'dps3Tripped', 'dps4Tripped', 'dps5Tripped'],
      condition: function(state) {
        return state.dps2Tripped === true || state.dps3Tripped === true ||
          state.dps4Tripped === true || state.dps5Tripped === true;
      },
      getValue: function(state) {
        var tripped = [];
        if (state.dps2Tripped) tripped.push('DPS-2 (Supply Suction)');
        if (state.dps3Tripped) tripped.push('DPS-3 (Supply Static)');
        if (state.dps4Tripped) tripped.push('DPS-4 (Return Suction)');
        if (state.dps5Tripped) tripped.push('DPS-5 (Return Static)');
        return tripped;
      }
    },
    {
      id: 'M-10',
      description: 'Freezestat warning — coil-inlet air below the freezestat trip temperature. Advisory: the 3-minute nuisance-delay timer is running but the hardwired shutdown (M-11) has not fired yet.',
      priority: 'medium',
      sourceField: 'freezestatTripped',
      relatedStateKeys: ['freezestatTripped', 'mixedAirTemp'],
      condition: function(state) {
        return state.freezestatTripped === true && state.freezestatShutdown !== true;
      }
    },
    {
      id: 'M-11',
      description: 'Freezestat shutdown — critical. Supply fan (and interlocked return fan) hardwired off, heating coil valve forced 100% open, manual reset required (SOO Safeties item 4).',
      priority: 'urgent',
      sourceField: 'freezestatShutdown',
      relatedStateKeys: ['freezestatShutdown', 'phtValvePosition'],
      condition: function(state) {
        return state.freezestatShutdown === true;
      }
    },
    {
      id: 'M-12',
      description: 'Supply or Return Fan VFD fault (Points List items 32/35) — drive has faulted and is unable to run.',
      priority: 'high',
      sourceField: null,
      relatedStateKeys: ['supplyFanVFDFault', 'returnFanVFDFault'],
      condition: function(state) {
        return state.supplyFanVFDFault === true || state.returnFanVFDFault === true;
      },
      getValue: function(state) {
        var faulted = [];
        if (state.supplyFanVFDFault) faulted.push('Supply Fan VFD');
        if (state.returnFanVFDFault) faulted.push('Return Fan VFD');
        return faulted;
      }
    },
    {
      id: 'M-13',
      description: 'Software lockout active (Points List item 44) — unit held off by BAS-level lockout regardless of run schedule.',
      priority: 'medium',
      sourceField: 'softwareLockout',
      relatedStateKeys: ['softwareLockout'],
      condition: function(state) {
        return state.softwareLockout === true;
      }
    }
  ];

  function manualKeys(modes) {
    if (!modes) return [];
    return Object.keys(modes).filter(function(k) { return modes[k] === 'Manual'; });
  }

  // state: AHU46Controller.getState() snapshot. modes: AHU46Controller.
  // getModes() (optional — only M-07 needs it; every other rule ignores
  // the second argument).
  function evaluate(state, modes) {
    var newAlarms = [];
    rules.forEach(function(rule) {
      var fires = false;
      try { fires = rule.condition(state, modes); } catch(e) {}
      if (fires) {
        if (!activeAlarms[rule.id]) {
          activeAlarms[rule.id] = {
            condition: rule.id,
            description: rule.description,
            priority: rule.priority,
            sourceField: rule.sourceField,
            value: rule.getValue ? rule.getValue(state, modes) : (rule.sourceField ? state[rule.sourceField] : manualKeys(modes)),
            timestamp: new Date().toISOString(),
            subsystem: 'AHU-4-6',
            acknowledged: false,
            operator: '',
          };
        }
        newAlarms.push(activeAlarms[rule.id]);
      } else {
        delete activeAlarms[rule.id];
      }
    });
    return newAlarms;
  }

  function getActiveAlarms() {
    return Object.values(activeAlarms);
  }

  // This engine has a simpler lifecycle than AHU44NewFaultEngine's: an
  // alarm is deleted from activeAlarms the instant its condition clears
  // (see evaluate() above), rather than retained in an 'inactive' state
  // for later review. That means there's no distinction between "all
  // alarms" and "active alarms" here — getAllAlarms() is provided purely
  // so AlarmSummary.jsx (which expects this method on every engine it
  // aggregates from — see AHU44NewFaultEngine, VAVFaultEngine) can treat
  // AHU-4-6 the same way as every other unit.
  function getAllAlarms() {
    return Object.values(activeAlarms);
  }

  function acknowledge(ruleId, operator) {
    var alarm = activeAlarms[ruleId];
    if (alarm) {
      alarm.acknowledged = true;
      alarm.operator = operator || '';
    }
  }

  // acknowledgeAll() was removed — real BMS practice requires acknowledging
  // every alarm individually (per Lev), so a one-call bulk-ack was dropped
  // in favor of always going through acknowledge() per alarm.

  function reset() {
    Object.keys(activeAlarms).forEach(function(k) { delete activeAlarms[k]; });
  }

  window.AHU46FaultEngine = {
    rules: rules,
    evaluate: evaluate,
    getActiveAlarms: getActiveAlarms,
    getAllAlarms: getAllAlarms,
    acknowledge: acknowledge,
    reset: reset,
  };

})();
