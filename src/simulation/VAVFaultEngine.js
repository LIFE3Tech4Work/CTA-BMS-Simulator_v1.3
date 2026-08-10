/**
 * VAVFaultEngine.js — Fault detection engine for VAV terminal units
 *
 * Evaluates fault rules against VAVController's per-zone state, same API
 * shape as FaultEngine.js / AHU44NewFaultEngine.js (evaluate/getActiveAlarms/
 * getAllAlarms/acknowledge/reset) so AlarmSummary.jsx can treat alarms from
 * all three engines uniformly.
 *
 * V-01 directly closes the gap that motivated building VAVController.js in
 * the first place: the CTA BMS Work-Based Learning Project Guide lists
 * "Excessive Reheat" as Common Issue #6 ("Cooling air to 60°F, Reheating to
 * 78°F"), and no fault rule could detect that without a VAV reheat coil to
 * detect it on.
 *
 * V-02 extends the same CO2 ventilation threshold already used at the AHU
 * level (F-06 / N-02, fixed to 1,100 ppm — the ASHRAE 62.1 upper guideline)
 * down to the zone level, keeping the threshold consistent app-wide. The
 * WBL guide's own CO2 table (Occupied 600–1,000 ppm, Concern Level >1,100
 * ppm) is a third independent confirmation of that number.
 *
 * V-03 closes the gap this file originally flagged as deliberately not
 * included: "VAV running during unoccupied hours" (parallels F-03 / Common
 * Issue #1 at the zone level). VAVController.js's damperPosition and
 * reheatValvePosition are now true Manual-able outputs (added per the BMS
 * Slide Companion lecture review — "schedule says off, airflow says
 * otherwise" is one of the most repeated real-world patterns across that
 * material), so "unoccupied but still moving air" is now a real, reachable
 * state to detect.
 *
 * Attached to window.VAVFaultEngine (no import/export — Babel standalone).
 */

(function () {
  'use strict';

  // ─── Fault Rules (V-01, V-02, V-03) ─────────────────────────────────────────
  // condition(state) receives VAVController.getState(zoneId) — these are
  // controller field names, not BACnet addresses (same convention as
  // AHU44NewFaultEngine.js).

  var rules = [
    {
      id: 'V-01',
      description: 'Excessive reheat — discharge air already near design-cold setpoint is being reheated (cooling-then-reheating waste)',
      priority: 'high',
      sourceField: 'reheatValvePosition',
      relatedStateKeys: ['reheatValvePosition', 'dischargeAirTemp'],
      condition: function (state) {
        if (state.reheatValvePosition === undefined || state.dischargeAirTemp === undefined) return false;
        return state.reheatValvePosition > 30 && state.dischargeAirTemp <= 58;
      }
    },
    {
      id: 'V-02',
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
      id: 'V-03',
      description: 'VAV running during unoccupied hours — nonzero airflow detected while the zone schedule is OFF (damper/reheat stuck open from an uncleared manual override)',
      priority: 'high',
      sourceField: 'airflowCFM',
      relatedStateKeys: ['airflowCFM', 'damperPosition', 'runSchedule'],
      condition: function (state) {
        if (state.runSchedule === undefined || state.airflowCFM === undefined) return false;
        return state.runSchedule === false && state.airflowCFM > 0;
      }
    }
  ];

  // ─── Active Alarms ──────────────────────────────────────────────────────────
  // Map<zoneId, Map<ruleId, Alarm>> — one active alarm per rule per zone.

  var activeAlarmsByZone = {};

  function zoneMap(zoneId) {
    if (!activeAlarmsByZone[zoneId]) {
      activeAlarmsByZone[zoneId] = new Map();
    }
    return activeAlarmsByZone[zoneId];
  }

  // ─── Core Methods ───────────────────────────────────────────────────────────

  /**
   * Evaluate all VAV fault rules against one zone's current state.
   * Called once per zone, per simulation tick, with
   * window.VAVController.getState(zoneId).
   *
   * @param {string} zoneId
   * @param {Object} state - VAVController state object for that zone
   * @returns {Alarm[]} - Array of newly generated alarms
   */
  function evaluate(zoneId, state) {
    var newAlarms = [];
    if (!state || !zoneId) return newAlarms;

    var activeAlarms = zoneMap(zoneId);

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
            id: rule.id + '_' + zoneId + '_' + Date.now(),
            timestamp: new Date(),
            source: rule.sourceField + '@' + zoneId,
            condition: rule.id,
            priority: rule.priority,
            description: rule.description,
            value: triggerValue !== undefined ? triggerValue : 'N/A',
            lifecycle: 'active',
            acknowledged: false,
            operator: '',
            action: '',
            subsystem: zoneId
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

  function getActiveAlarms(zoneId) {
    var result = [];
    var zones = zoneId ? [zoneId] : Object.keys(activeAlarmsByZone);
    zones.forEach(function (z) {
      zoneMap(z).forEach(function (alarm) {
        if (alarm.lifecycle === 'active') result.push(alarm);
      });
    });
    return result;
  }

  function getAllAlarms(zoneId) {
    var result = [];
    var zones = zoneId ? [zoneId] : Object.keys(activeAlarmsByZone);
    zones.forEach(function (z) {
      zoneMap(z).forEach(function (alarm) { result.push(alarm); });
    });
    return result;
  }

  /**
   * Acknowledge an alarm by zone + rule ID.
   * @param {string} zoneId
   * @param {string} ruleId - Fault rule ID (e.g., "V-01")
   * @param {string} operator
   */
  function acknowledge(zoneId, ruleId, operator) {
    var activeAlarms = zoneMap(zoneId);
    var alarm = activeAlarms.get(ruleId);
    if (alarm) {
      alarm.acknowledged = true;
      alarm.operator = operator || '';
    }
  }

  function reset() {
    activeAlarmsByZone = {};
  }

  // ─── Expose as window global ────────────────────────────────────────────────

  window.VAVFaultEngine = {
    get rules() { return rules; },

    evaluate: evaluate,
    getActiveAlarms: getActiveAlarms,
    getAllAlarms: getAllAlarms,
    acknowledge: acknowledge,
    reset: reset,

    // Testing helper — reset internal state
    _reset: function () {
      activeAlarmsByZone = {};
    }
  };
})();
