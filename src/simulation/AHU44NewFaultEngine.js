/**
 * AHU44NewFaultEngine.js — Fault detection engine for AHU-4-4
 *
 * AHU-4-4 is driven by AHU44NewController.js's own formula-driven state
 * object, NOT by PointRegistry/BACnet addresses. The legacy FaultEngine.js
 * rules F-02/F-03/F-04/F-06 (all DEV4004-scoped) only ever evaluate against
 * PointRegistry's historical-data points, which belong to the deprecated
 * AHU-4-4 tab — they never see anything a student does on the AHU-4-4
 * screen, and AHU-4-4 never sees them. This module closes that gap with
 * a small rule set written directly against AHU44NewController's state.
 *
 * Two of the original ruleset's fault patterns (F-03: fan running while
 * Run Schedule is OFF; F-04: OA damper <5% during occupied hours) were NOT
 * portable 1:1 when this engine was first built — they were structurally
 * impossible on this controller:
 *   - fanRunning is deterministically derived FROM runSchedule (and
 *     fireAlarmShutdown) in recalculate(); the fan can never be "stuck on"
 *     independent of the schedule the way two independent historical data
 *     columns could disagree in the legacy model.
 *   - oaDamperPosition WAS always floored at OA_DAMPER_FLOOR (20%, ASHRAE
 *     62.1) any time the fan ran — it could never read <5% while occupied.
 *     N-03 (below) was added at the time to replace that gap with a fault
 *     that genuinely was reachable.
 * That second limitation no longer holds: AHU44NewController.js now
 * supports a true Manual override on oaDamperPosition (added per the BMS
 * Slide Companion lecture review — the real AHU-4-4 screenshot itself shows
 * exactly this fault, 215 CFM actual OA against a 4,900 CFM configured
 * minimum). N-04 below is the F-04 pattern, finally portable in spirit
 * (not the original <5% threshold, but the same "ventilation minimum not
 * actually being met" idea, expressed against this controller's real floor).
 *
 * Attached to window.AHU44NewFaultEngine (no import/export — Babel standalone).
 * Same public API shape as FaultEngine.js (evaluate/getActiveAlarms/
 * getAllAlarms/acknowledge/reset) so AlarmSummary.jsx and AlarmsTab.jsx can
 * treat alarms from both engines uniformly.
 */

(function () {
  'use strict';

  // ─── Fault Rules (N-01 through N-03) ───────────────────────────────────────
  // condition(state) receives AHU44NewController.getState() directly —
  // these are controller field names, not BACnet addresses.

  const rules = [
    {
      id: 'N-01',
      description: 'Supply air temperature outside expected design band (52–58°F)',
      priority: 'high',
      sourceField: 'supplyAirTemp',
      relatedStateKeys: ['supplyAirTemp'],
      condition: function (state) {
        var sat = state.supplyAirTemp;
        if (sat === undefined) return false;
        return sat < 52 || sat > 58;
      }
    },
    {
      id: 'N-02',
      description: 'CO2 exceeds ventilation threshold (>1,100 ppm, ASHRAE 62.1 upper guideline)',
      priority: 'urgent',
      sourceField: 'co2Sensor',
      relatedStateKeys: ['co2Sensor'],
      condition: function (state) {
        var co2 = state.co2Sensor;
        if (co2 === undefined) return false;
        return co2 > 1100;
      }
    },
    {
      id: 'N-03',
      description: 'Economizer fully open (free cooling) while mechanical cooling (CHW valve) is still active — cooling setpoint and economizer changeover point may be misconfigured',
      priority: 'high',
      sourceField: 'chwValvePosition',
      relatedStateKeys: ['chwValvePosition', 'oaDamper'],
      condition: function (state) {
        if (state.economizerActive === undefined || state.chwValvePosition === undefined) return false;
        return state.economizerActive === true && state.chwValvePosition > 0;
      }
    },
    {
      id: 'N-04',
      description: 'Outside air damper below the ASHRAE 62.1 minimum position (20%) while the fan is running — ventilation shortfall, typically a manually stuck/overridden damper',
      priority: 'high',
      sourceField: 'oaDamperPosition',
      relatedStateKeys: ['oaDamperPosition', 'oaCFM', 'minOAAirflowSetpoint'],
      condition: function (state) {
        if (state.fanRunning === undefined || state.oaDamperPosition === undefined) return false;
        return state.fanRunning === true && state.oaDamperPosition < 20;
      }
    }
  ];

  // ─── Active Alarms ──────────────────────────────────────────────────────────
  // Map<ruleId, Alarm> — one active alarm per rule at most, mirroring
  // FaultEngine.js's Property 20/21 behavior.

  const activeAlarms = new Map();

  // ─── Core Methods ───────────────────────────────────────────────────────────

  /**
   * Evaluate all AHU-4-4 fault rules against the controller's current state.
   * Called on each simulation tick with window.AHU44NewController.getState().
   *
   * @param {Object} state - AHU44NewController state object
   * @returns {Alarm[]} - Array of newly generated alarms
   */
  function evaluate(state) {
    const newAlarms = [];
    if (!state) return newAlarms;

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var conditionMet = false;

      try {
        conditionMet = rule.condition(state);
      } catch (e) {
        conditionMet = false;
      }

      if (conditionMet) {
        if (!activeAlarms.has(rule.id)) {
          var triggerValue = state[rule.sourceField];
          var alarm = {
            id: rule.id + '_' + Date.now(),
            timestamp: new Date(),
            source: rule.sourceField + '@AHU-4-4',
            condition: rule.id,
            priority: rule.priority,
            description: rule.description,
            value: triggerValue !== undefined ? triggerValue : 'N/A',
            lifecycle: 'active',
            acknowledged: false,
            operator: '',
            action: '',
            subsystem: 'AHU-4-4'
          };

          activeAlarms.set(rule.id, alarm);
          newAlarms.push(alarm);
        }
      } else {
        if (activeAlarms.has(rule.id)) {
          var existingAlarm = activeAlarms.get(rule.id);
          if (existingAlarm.lifecycle === 'active') {
            existingAlarm.lifecycle = 'inactive';
            // acknowledged state is preserved (no change) — same as FaultEngine.js
          }
        }
      }
    }

    return newAlarms;
  }

  function getActiveAlarms() {
    var result = [];
    activeAlarms.forEach(function (alarm) {
      if (alarm.lifecycle === 'active') {
        result.push(alarm);
      }
    });
    return result;
  }

  function getAllAlarms() {
    return Array.from(activeAlarms.values());
  }

  function acknowledge(ruleId, operator) {
    var alarm = activeAlarms.get(ruleId);
    if (alarm) {
      alarm.acknowledged = true;
      alarm.operator = operator || '';
    }
  }

  function reset() {
    activeAlarms.clear();
  }

  function acknowledgeAll(operator) {
    activeAlarms.forEach(function(alarm) {
      alarm.acknowledged = true;
      alarm.operator = operator || '';
    });
  }

  // ─── Expose as window global ────────────────────────────────────────────────

  window.AHU44NewFaultEngine = {
    get rules() { return rules; },
    get activeAlarms() { return activeAlarms; },

    evaluate: evaluate,
    getActiveAlarms: getActiveAlarms,
    getAllAlarms: getAllAlarms,
    acknowledge: acknowledge,
    acknowledgeAll: acknowledgeAll,
    reset: reset,

    _reset: function () {
      activeAlarms.clear();
    }
  };
})();
