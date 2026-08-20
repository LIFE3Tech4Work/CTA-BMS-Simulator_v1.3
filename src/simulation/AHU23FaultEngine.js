/**
 * AHU23FaultEngine.js — fault detection for AHU-23-1
 *
 * This unit had no fault engine at all. The Alarm Summary already had a tree node for
 * it and already routed DEV2301 addresses to it, so everything downstream was ready —
 * but nothing ever generated an alarm, which is why Omar's AHU-23-1 condition never
 * appeared in the list during the 20 Aug debrief while AHU-4-4's did.
 *
 * Rules are scoped to what this unit actually has. It is a single-coil-pair boiler-room
 * air handler: no return fan, no DPS chain, no freezestat latch — so rules borrowed
 * wholesale from AHU-4-6 would reference points that do not exist and never fire.
 *
 * Shape matches AHU44NewFaultEngine / AHU46FaultEngine: getAllAlarms() returns the
 * current list, reset() clears it. AlarmSummary polls both.
 *
 * No import/export — exposes window.AHU23FaultEngine.
 */
(function () {
  'use strict';

  var DEV = 'DEV2301';

  // Occupied window, matching the Schedule Manager entry for this unit and the occupied
  // test the Alarm Summary's own preloaded rules use. Three places agreeing beats three
  // places each guessing.
  var OCCUPIED_START = 8;
  var OCCUPIED_END = 18;

  function isOccupiedNow() {
    var eng = window.SimulationEngine;
    var d = (eng && typeof eng.getCurrentTimestamp === 'function')
      ? eng.getCurrentTimestamp() : new Date();
    if (!d || typeof d.getHours !== 'function') return true;
    var day = d.getDay();
    if (day === 0 || day === 6) return false;
    var h = d.getHours();
    return h >= OCCUPIED_START && h < OCCUPIED_END;
  }

  /**
   * Each rule names the point it reports on, so the Alarm Summary can show a LIVE value
   * with the right unit rather than a number frozen at trip time.
   */
  var RULES = [
    {
      id: 'N-01',
      sourceField: 'supplyAirTemp',
      addr: 'AI301@' + DEV,
      priority: 'urgent',
      description: 'Supply air temperature deviation exceeds 5\u00b0F from active setpoint',
      test: function (s) {
        if (!s.fanRunning) return false;
        var sp = (typeof s.activeSetpoint === 'number') ? s.activeSetpoint : s.coolingCoilSetpoint;
        return typeof sp === 'number' && Math.abs(s.supplyAirTemp - sp) > 5;
      }
    },
    {
      id: 'N-02',
      sourceField: 'preheatTemp',
      addr: 'AI302@' + DEV,
      priority: 'urgent',
      // Freeze protection is the safety case on this unit: it has a plenum minimum and a
      // preheat coil, and a discharge below that minimum is what the coil exists to stop.
      description: 'Preheat discharge below plenum minimum \u2014 freeze protection at risk',
      test: function (s) {
        return !!s.fanRunning && typeof s.plenumMinSetpoint === 'number' &&
               s.preheatTemp < s.plenumMinSetpoint;
      }
    },
    {
      id: 'N-03',
      sourceField: 'phtValvePosition',
      addr: 'AO201@' + DEV,
      priority: 'high',
      description: 'Simultaneous heating and cooling \u2014 both coil valves open',
      test: function (s) {
        // Dehumidification is the legitimate exception: cooling to dry and reheating to
        // temperature is correct operation, not a fault.
        return s.phtValvePosition > 0 && s.chwValvePosition > 0 && !s.dehumidifying;
      }
    },
    {
      id: 'N-04',
      sourceField: 'oaDamperPosition',
      addr: 'AO202@' + DEV,
      priority: 'high',
      description: 'Outdoor air damper below minimum position during occupied hours',
      test: function (s) {
        return !!s.fanRunning && isOccupiedNow() &&
               s.oaDamperPosition < (s.economizerMinPosition || 20) - 0.5;
      }
    },
    {
      id: 'N-05',
      sourceField: 'fanRunning',
      addr: 'BI601@' + DEV,
      priority: 'high',
      description: 'Unit running outside scheduled occupied hours',
      test: function (s) { return !!s.fanRunning && !isOccupiedNow(); }
    },
    {
      id: 'N-06',
      sourceField: 'supplyAirRH',
      addr: 'AI401@' + DEV,
      priority: 'high',
      description: 'Supply air humidity above the upper limit for occupied comfort',
      // Only while the cooling coil is shut. This unit's normal supply RH is ~70%, so an
      // unconditional 65% threshold alarmed on a healthy unit at every page load — the
      // kind of noise that teaches students to ignore the alarm list. What is genuinely
      // wrong is humid air the unit is making no attempt to dry.
      test: function (s) {
        return !!s.fanRunning && typeof s.supplyAirRH === 'number' &&
               s.supplyAirRH > 72 && (s.chwValvePosition || 0) < 5;
      }
    }
  ];

  // Live alarms, keyed by rule id. Kept across evaluations so an alarm kseeps its original
  // timestamp and acknowledgment rather than being recreated on every poll.
  var active = {};

  function stamp() { return new Date(); }

  function evaluate(state) {
    if (!state) return getAllAlarms();
    RULES.forEach(function (r) {
      var fires = false;
      try { fires = !!r.test(state); } catch (e) { fires = false; }
      var existing = active[r.id];

      if (fires && !existing) {
        active[r.id] = {
          id: 'ahu23-' + r.id + '-' + Date.now(),
          ruleId: r.id,
          timestamp: stamp(),
          source: r.addr,
          sourceField: r.sourceField,
          unitId: 'AHU-23-1',
          condition: r.id,
          priority: r.priority,
          description: r.description,
          value: state[r.sourceField],
          lifecycle: 'active',
          acknowledged: false,
          operator: '',
          action: '',
          subsystem: 'AHU-23-1'
        };
      } else if (fires && existing) {
        existing.lifecycle = 'active';
      } else if (!fires && existing) {
        // Returned to normal, but it stays in the list until acknowledged — the operator
        // still has to sign for a condition that happened.
        existing.lifecycle = 'inactive';
      }
    });
    return getAllAlarms();
  }

  function getAllAlarms() {
    return Object.keys(active).map(function (k) { return active[k]; });
  }

  function reset() { active = {}; }

  /** Drop an acknowledged-and-cleared alarm, so it can trip cleanly again later. */
  function retire(alarmId) {
    Object.keys(active).forEach(function (k) {
      if (active[k].id === alarmId) delete active[k];
    });
  }

  // Follow the unit rather than waiting to be polled: the Alarm Summary is not always
  // open, and an alarm that only exists while someone is looking at the list is not an
  // alarm. Deferred so the controller is on window by the time this runs.
  if (typeof window.setTimeout === 'function') {
    window.setTimeout(function () {
      var c = window.AHU23Controller;
      if (c && typeof c.subscribe === 'function') {
        c.subscribe(function (s) { evaluate(s); });
        if (typeof c.getState === 'function') evaluate(c.getState());
      }
    }, 0);
  }

  window.AHU23FaultEngine = {
    RULES: RULES,
    evaluate: evaluate,
    getAllAlarms: getAllAlarms,
    reset: reset,
    retire: retire
  };
})();
