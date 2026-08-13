/**
 * FaultEngine.js — Fault detection engine for the BMS Simulator
 *
 * Evaluates 6 fault detection rules (F-01 through F-06) on every simulation tick.
 * Generates alarms when fault conditions are met, transitions alarms to inactive
 * when conditions clear (preserving acknowledgment state), and prevents duplicates.
 *
 * Attached to window.FaultEngine (no import/export — Babel standalone).
 *
 * Validates: Requirements 17.1, 17.2, 17.4, 17.5
 */

(function () {
  'use strict';

  // ─── Fault Rules (F-01 through F-06) ───────────────────────────────────────
  // Defined inline to avoid import dependency (no bundler).
  // These match the design spec's 6 fault conditions.

  const rules = [
    {
      id: 'F-01',
      description: 'Simultaneous heating and cooling',
      priority: 'urgent',
      sourcePoint: 'AO103@DEV4006',
      condition: function (values) {
        const pht = values.get('AO103@DEV4006');
        const chw = values.get('AO102@DEV4006');
        return pht > 20 && chw > 20;
      }
    },
    {
      id: 'F-02',
      description: 'Supply air temperature outside expected design band (52–58°F)',
      priority: 'high',
      sourcePoint: 'AI301@DEV4004',
      designBand: { min: 52, max: 58 },
      condition: function (values) {
        const sat = values.get('AI301@DEV4004');
        if (sat === undefined) return false;
        return sat < 52 || sat > 58;
      }
    },
    {
      id: 'F-03',
      description: 'AHU running while Run Schedule is OFF',
      priority: 'high',
      sourcePoint: 'AO101@DEV4004',
      condition: function (values) {
        const fanSpeed = values.get('AO101@DEV4004');
        const runSchedule = values.get('BI601@DEV4004');
        return fanSpeed > 0 && runSchedule === 0;
      }
    },
    {
      id: 'F-04',
      description: 'Outdoor air damper fully closed during occupied hours',
      priority: 'urgent',
      sourcePoint: 'AO104@DEV4004',
      condition: function (values) {
        const oad = values.get('AO104@DEV4004');
        const schedule = values.get('BI601@DEV4004');
        return oad < 5 && schedule === 1;
      }
    },
    {
      id: 'F-05',
      description: 'Mechanical cooling support running while free-cooling conditions are available (OAT < 55°F) and OA damper is not fully open',
      priority: 'high',
      sourcePoint: 'BI801@DEV6000',
      condition: function (values) {
        const ctOn = values.get('BI801@DEV6000');
        const oat = values.get('AI701@DEV5000');
        const oaDamper = values.get('AO104@DEV4004');
        if (ctOn === undefined || oat === undefined || oaDamper === undefined) return false;
        return ctOn === 1 && oat < 55 && oaDamper < 80;
      }
    },
    {
      id: 'F-06',
      description: 'CO2 exceeds ventilation threshold (>1,100 ppm, ASHRAE 62.1 upper guideline)',
      priority: 'urgent',
      sourcePoint: 'AI401@DEV4004',
      condition: function (values) {
        const co2 = values.get('AI401@DEV4004');
        return co2 > 1100;
      }
    }
  ];

  // ─── Active Alarms ──────────────────────────────────────────────────────────
  // Map<ruleId, Alarm> — one active alarm per rule at most (Property 20)

  const activeAlarms = new Map();

  // ─── Core Methods ───────────────────────────────────────────────────────────

  /**
   * Evaluate all fault rules against current point values.
   * Called on each simulation tick with the current point values.
   *
   * - If a rule's condition is TRUE and no active alarm exists: generate alarm (Property 20)
   * - If a rule's condition is FALSE and an active alarm exists: transition to inactive (Property 21)
   *
   * @param {Map<string, number>} pointValues - Current point values keyed by BACnet address
   * @returns {Alarm[]} - Array of newly generated alarms (for notification to AlarmStore)
   */
  function evaluate(pointValues) {
    const newAlarms = [];

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var conditionMet = false;

      try {
        conditionMet = rule.condition(pointValues);
      } catch (e) {
        // If condition evaluation fails, treat as not met
        conditionMet = false;
      }

      if (conditionMet) {
        // Condition is TRUE — generate alarm if none exists for this rule
        if (!activeAlarms.has(rule.id)) {
          var triggerValue = pointValues.get(rule.sourcePoint);
          var alarm = {
            id: rule.id + '_' + Date.now(),
            timestamp: new Date(),
            source: rule.sourcePoint,
            condition: rule.id,
            priority: rule.priority,
            description: rule.description,
            value: triggerValue !== undefined ? triggerValue : 'N/A',
            lifecycle: 'active',
            acknowledged: false,
            operator: '',
            action: ''
          };

          activeAlarms.set(rule.id, alarm);
          newAlarms.push(alarm);
        }
      } else {
        // Condition is FALSE — if alarm exists, transition to inactive
        // Property 21: preserve acknowledgment state
        if (activeAlarms.has(rule.id)) {
          var existingAlarm = activeAlarms.get(rule.id);
          if (existingAlarm.lifecycle === 'active') {
            existingAlarm.lifecycle = 'inactive';
            // acknowledged state is preserved (no change)
          }
        }
      }
    }

    return newAlarms;
  }

  /**
   * Returns array of all currently active alarms (lifecycle === 'active').
   * @returns {Alarm[]}
   */
  function getActiveAlarms() {
    var result = [];
    activeAlarms.forEach(function (alarm) {
      if (alarm.lifecycle === 'active') {
        result.push(alarm);
      }
    });
    return result;
  }

  /**
   * Returns array of ALL alarms (active and inactive) still tracked.
   * @returns {Alarm[]}
   */
  function getAllAlarms() {
    return Array.from(activeAlarms.values());
  }

  /**
   * Acknowledge an alarm by its fault rule ID.
   * @param {string} ruleId - Fault rule ID (e.g., "F-01")
   * @param {string} operator - Name of operator acknowledging
   */
  function acknowledge(ruleId, operator) {
    var alarm = activeAlarms.get(ruleId);
    if (alarm) {
      alarm.acknowledged = true;
      alarm.operator = operator || '';
    }
  }

  /**
   * Reset all active alarms (for scenario changes).
   */
  function reset() {
    activeAlarms.clear();
  }

  // ─── Expose as window global ────────────────────────────────────────────────

  window.FaultEngine = {
    // State accessors
    get rules() { return rules; },
    get activeAlarms() { return activeAlarms; },

    // Methods
    evaluate: evaluate,
    getActiveAlarms: getActiveAlarms,
    getAllAlarms: getAllAlarms,
    acknowledge: acknowledge,
    reset: reset,

    // Testing helper — reset internal state
    _reset: function () {
      activeAlarms.clear();
    }
  };
})();
