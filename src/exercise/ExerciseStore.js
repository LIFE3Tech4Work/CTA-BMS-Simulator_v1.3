/**
 * ExerciseStore.js — instructor-authored exercises: storage, goal checking,
 * attempt tracking and the operator action log.
 *
 * An exercise is a faulted starting state plus a goal the simulator can check
 * itself. The instructor sets values on the live diagram, saves a snapshot, and
 * assigns it to students; a student starts it, works the unit, and the sim marks
 * them complete when the goal is met.
 *
 * Snapshotting reads each controller's OWN override list (getModes()), so an
 * exercise records exactly the points the instructor took to Manual and nothing
 * else — no separate list to keep in step with the simulation.
 *
 * Persistence is localStorage, matching how capstone submissions already travel
 * from student to instructor in this simulator (no backend).
 *
 * No import/export — exposes window.ExerciseStore
 */
(function () {
  'use strict';

  var EX_KEY = 'cta_exercises';
  var ATTEMPT_KEY = 'cta_exercise_attempts';

  // A goal has to hold, not merely flicker true: coil valves and fan ramps pass
  // through a correct value on their way somewhere wrong, and a graded exercise
  // that credits a transient is worse than one that credits nothing.
  var HOLD_MS = 3000;

  var UNIT_CONTROLLERS = {
    'AHU-4-6': 'AHU46Controller',
    'AHU-4-4': 'AHU44NewController',
    'AHU-4-3': 'AHU43Controller',
    'AHU-23-1': 'AHU23Controller',
    'VAV-4-4-02': 'VAV4402Controller',
    'VAV-02-03': 'VAV0203Controller'
  };

  var COMPARATORS = {
    within: { label: 'is within', needsTolerance: true },
    above: { label: 'is above', needsTolerance: false },
    below: { label: 'is below', needsTolerance: false },
    equals: { label: 'equals', needsTolerance: false }
  };

  var subscribers = [];

  function notify() {
    subscribers.forEach(function (cb) { try { cb(); } catch (e) {} });
  }

  function subscribe(cb) {
    subscribers.push(cb);
    return function () {
      var i = subscribers.indexOf(cb);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed || fallback;
    } catch (e) { return fallback; }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  function controllerFor(unitId) {
    var name = UNIT_CONTROLLERS[unitId];
    return (name && window[name]) ? window[name] : null;
  }

  // ─── Exercises ──────────────────────────────────────────────────────────────

  function listExercises() { return readJSON(EX_KEY, []); }

  function exercisesFor(operator) {
    return listExercises().filter(function (ex) {
      return ex.published && (ex.assignedTo || []).indexOf(operator) !== -1;
    });
  }

  function getExercise(id) {
    var found = null;
    listExercises().forEach(function (ex) { if (ex.id === id) found = ex; });
    return found;
  }

  /**
   * Capture the unit's current overrides as an exercise starting state. Only
   * points the instructor actually commanded are recorded — everything else
   * starts from the unit's own defaults, so an exercise stays valid if the
   * underlying model is recalibrated later.
   */
  function snapshot(unitId) {
    var ctrl = controllerFor(unitId);
    if (!ctrl || typeof ctrl.getModes !== 'function') return { setup: {}, weather: null };
    var modes = ctrl.getModes() || {};
    var state = ctrl.getState() || {};
    var setup = {};
    Object.keys(modes).forEach(function (k) {
      if (modes[k] === 'Manual' && state[k] !== undefined) setup[k] = state[k];
    });
    // A hand-set outdoor condition is part of the scenario — a freeze exercise is
    // not the same exercise in July — so it travels with the snapshot.
    var weather = null;
    if (window.WeatherOverride) {
      var w = window.WeatherOverride.getState();
      if (w && w.active && w.weather) {
        weather = {
          presetKey: w.presetKey || null,
          dryBulb: w.weather.dryBulb,
          relHumidity: w.weather.relHumidity
        };
      }
    }
    return { setup: setup, weather: weather };
  }

  function saveExercise(ex) {
    var all = listExercises();
    var idx = -1;
    all.forEach(function (e, i) { if (e.id === ex.id) idx = i; });
    if (idx >= 0) all[idx] = ex; else all.push(ex);
    writeJSON(EX_KEY, all);
    notify();
    return ex;
  }

  function deleteExercise(id) {
    writeJSON(EX_KEY, listExercises().filter(function (e) { return e.id !== id; }));
    writeJSON(ATTEMPT_KEY, listAttempts().filter(function (a) { return a.exerciseId !== id; }));
    notify();
  }

  function newId() {
    return 'ex-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4).toString(36);
  }

  // ─── Attempts ───────────────────────────────────────────────────────────────

  function listAttempts() { return readJSON(ATTEMPT_KEY, []); }

  function attemptFor(exerciseId, operator) {
    var found = null;
    listAttempts().forEach(function (a) {
      if (a.exerciseId === exerciseId && a.operator === operator) found = a;
    });
    return found;
  }

  function saveAttempt(attempt) {
    var all = listAttempts();
    var idx = -1;
    all.forEach(function (a, i) {
      if (a.exerciseId === attempt.exerciseId && a.operator === attempt.operator) idx = i;
    });
    if (idx >= 0) all[idx] = attempt; else all.push(attempt);
    writeJSON(ATTEMPT_KEY, all);
    notify();
    return attempt;
  }

  /** Apply an exercise's starting state and open (or reopen) the student's attempt. */
  function startAttempt(exerciseId, operator) {
    var ex = getExercise(exerciseId);
    if (!ex) return null;
    applySetup(ex);
    var existing = attemptFor(exerciseId, operator);
    var attempt = existing || {
      exerciseId: exerciseId, operator: operator,
      startedAt: new Date().toISOString(),
      completedAt: null, passed: false, actions: []
    };
    // Restarting keeps the original start time and log: a student who resets is
    // still on the same attempt, and hiding that from the instructor would make
    // the duration column a lie.
    if (!existing) saveAttempt(attempt); else notify();
    return attempt;
  }

  // Outdoor-condition keys, which two different mechanisms can own: the weather
  // override drives them for every unit at once, and setValue holds them on one.
  var OA_KEYS = { oaTemperature: true, oaRelHumidity: true, oaEnthalpy: true };

  function applySetup(ex) {
    var ctrl = controllerFor(ex.unitId);
    if (!ctrl) return;
    if (typeof ctrl.clearModes === 'function') ctrl.clearModes();

    var setup = ex.setup || {};
    var setupHoldsOA = Object.keys(setup).some(function (k) { return OA_KEYS[k]; });

    // Weather FIRST, then the point setup. Both can write the same OA keys, and
    // releasing the override clears their Manual flags — done in the other order
    // it wiped an outdoor condition the exercise had just applied, so a freeze
    // exercise opened at whatever the live weather happened to be.
    if (window.WeatherOverride) {
      if (ex.weather) {
        if (ex.weather.presetKey) window.WeatherOverride.applyPreset(ex.weather.presetKey);
        else window.WeatherOverride.applyCustom(ex.weather.dryBulb, ex.weather.relHumidity);
      } else if (!setupHoldsOA) {
        // Only hand the weather back to the live file when the exercise does not
        // depend on an outdoor condition of its own.
        window.WeatherOverride.release();
      }
    }

    Object.keys(setup).forEach(function (k) {
      try { ctrl.setValue(k, setup[k]); } catch (e) {}
    });
    if (typeof ctrl.recalculate === 'function') ctrl.recalculate();
  }

  function logAction(operator, unitId, key, from, to) {
    var open = listAttempts().filter(function (a) {
      return a.operator === operator && !a.completedAt;
    });
    if (!open.length) return;
    open.forEach(function (a) {
      var ex = getExercise(a.exerciseId);
      if (!ex || ex.unitId !== unitId) return;
      a.actions = a.actions || [];
      a.actions.push({ at: new Date().toISOString(), key: key, from: from, to: to });
      // Keep the log bounded; an exercise that runs long shouldn't fill storage.
      if (a.actions.length > 300) a.actions = a.actions.slice(-300);
      saveAttempt(a);
    });
  }

  // ─── Goal checking ──────────────────────────────────────────────────────────

  var holdSince = {};

  /**
   * Is the goal currently satisfied? Reported with the live value so the student
   * can see how close they are rather than only pass/fail.
   */
  function evaluate(ex) {
    var ctrl = controllerFor(ex.unitId);
    var goal = ex.goal;
    if (!ctrl || !goal || !goal.key) return { ok: false, value: null };
    var value = (ctrl.getState() || {})[goal.key];
    if (typeof value !== 'number') return { ok: false, value: value };
    var target = Number(goal.target);
    var tol = Number(goal.tolerance || 0);
    var ok = false;
    if (goal.comparator === 'within') ok = Math.abs(value - target) <= (tol || 0.5);
    else if (goal.comparator === 'above') ok = value > target;
    else if (goal.comparator === 'below') ok = value < target;
    else ok = value === target;
    return { ok: ok, value: value };
  }

  /**
   * Evaluate and, once the goal has held long enough, mark the attempt passed.
   * Returns { ok, value, heldMs, passed }.
   */
  function check(ex, operator) {
    var res = evaluate(ex);
    var id = ex.id + '|' + operator;
    var now = Date.now();
    if (!res.ok) { delete holdSince[id]; return { ok: false, value: res.value, heldMs: 0, passed: false }; }
    if (!holdSince[id]) holdSince[id] = now;
    var heldMs = now - holdSince[id];
    var attempt = attemptFor(ex.id, operator);
    var passed = !!(attempt && attempt.passed);
    if (!passed && heldMs >= HOLD_MS && attempt) {
      attempt.passed = true;
      attempt.completedAt = new Date().toISOString();
      saveAttempt(attempt);
      passed = true;
    }
    return { ok: true, value: res.value, heldMs: heldMs, passed: passed };
  }

  function goalText(ex) {
    if (!ex.goal || !ex.goal.key) return '—';
    var label = ex.goal.label || ex.goal.key;
    var c = COMPARATORS[ex.goal.comparator] || COMPARATORS.within;
    var unit = ex.goal.unit || '';
    if (ex.goal.comparator === 'within') {
      return label + ' within \u00b1' + (ex.goal.tolerance || 0.5) + ' of ' + ex.goal.target + unit;
    }
    return label + ' ' + c.label + ' ' + ex.goal.target + unit;
  }

  function durationOf(attempt) {
    if (!attempt || !attempt.startedAt) return null;
    var end = attempt.completedAt ? new Date(attempt.completedAt) : new Date();
    var ms = end - new Date(attempt.startedAt);
    if (!isFinite(ms) || ms < 0) return null;
    var mins = Math.floor(ms / 60000);
    var secs = Math.floor((ms % 60000) / 1000);
    return mins + 'm ' + (secs < 10 ? '0' : '') + secs + 's';
  }

  function statusFor(ex, operator) {
    var a = attemptFor(ex.id, operator);
    if (!a) return 'not-started';
    return a.passed ? 'passed' : 'in-progress';
  }

  // ─── Starter exercises ──────────────────────────────────────────────────────
  // Two ready-to-run exercises so a student signing in has something to do before
  // any instructor has authored anything, and so the flow can be demonstrated
  // without prep. Seeded ONCE — a marker records that it ran, so an instructor who
  // deletes them does not get them back on the next reload, and nothing here ever
  // touches exercises somebody authored.
  //
  // Both faults were chosen because they genuinely break their goal: the fix has
  // to change the measured value, or the exercise grades itself as already passed.
  var SEED_FLAG = 'cta_exercises_seeded';

  function starterExercises() {
    var seats = (window.AuthHelpers && window.AuthHelpers.STUDENT_SEATS) ||
                ['student_a', 'student_b', 'student_c', 'student_d', 'student_e', 'student_f'];
    var now = new Date().toISOString();
    return [
      {
        id: 'ex-starter-overcool',
        title: 'Space is being overcooled',
        unitId: 'AHU-4-6',
        instructions:
          'Occupants on the 2nd level are complaining that the space is far too cold. ' +
          'Supply air is running well below where it should be. Find out why and return ' +
          'supply air to its 60\u00b0F design setpoint.\n\n' +
          'Hint: a point left in Manual overrides the control program. The Point ' +
          'Attribute Report (View menu) lists every override on the system.',
        setup: { coolingCoilSetpoint: 45 },
        weather: null,
        goal: {
          key: 'supplyAirTemp', label: 'Supply Air Temperature', unit: '\u00b0F',
          comparator: 'within', target: 60, tolerance: 1.5
        },
        assignedTo: seats.slice(),
        published: true,
        createdBy: 'cta_instructor',
        createdAt: now
      },
      {
        id: 'ex-starter-nostart',
        title: 'Unit will not run during occupied hours',
        unitId: 'AHU-4-4',
        instructions:
          'The Ballroom air handler is delivering no air during occupied hours and the ' +
          'space is going stale. Get the unit running and airflow restored.\n\n' +
          'Hint: check what is commanding the unit before you touch the fan itself.',
        setup: { runSchedule: false },
        weather: null,
        goal: {
          key: 'cfm', label: 'Supply Airflow', unit: ' CFM',
          comparator: 'above', target: 1000, tolerance: 0
        },
        assignedTo: seats.slice(),
        published: true,
        createdBy: 'cta_instructor',
        createdAt: now
      }
    ];
  }

  function seedIfEmpty() {
    try {
      if (localStorage.getItem(SEED_FLAG)) return;
      localStorage.setItem(SEED_FLAG, '1');
      var existing = listExercises();
      var byId = {};
      existing.forEach(function (e) { byId[e.id] = true; });
      var add = starterExercises().filter(function (e) { return !byId[e.id]; });
      if (!add.length) return;
      writeJSON(EX_KEY, existing.concat(add));
      notify();
    } catch (e) {}
  }

  seedIfEmpty();

  window.ExerciseStore = {
    HOLD_MS: HOLD_MS,
    COMPARATORS: COMPARATORS,
    UNIT_CONTROLLERS: UNIT_CONTROLLERS,
    subscribe: subscribe,
    listExercises: listExercises,
    exercisesFor: exercisesFor,
    getExercise: getExercise,
    saveExercise: saveExercise,
    deleteExercise: deleteExercise,
    newId: newId,
    snapshot: snapshot,
    applySetup: applySetup,
    listAttempts: listAttempts,
    attemptFor: attemptFor,
    saveAttempt: saveAttempt,
    startAttempt: startAttempt,
    logAction: logAction,
    evaluate: evaluate,
    check: check,
    goalText: goalText,
    durationOf: durationOf,
    statusFor: statusFor,
    controllerFor: controllerFor,
    seedIfEmpty: seedIfEmpty
  };
})();
