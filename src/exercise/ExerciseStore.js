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
    // Background push. The local copy is already written, so a failed network call
    // leaves the instructor's own view intact and getStatus().lastError explains why
    // students have not seen it yet.
    var B = be();
    if (B) B.pushExercise(ex);
  }

  function deleteExercise(id) {
    writeJSON(EX_KEY, listExercises().filter(function (e) { return e.id !== id; }));
    writeJSON(ATTEMPT_KEY, listAttempts().filter(function (a) { return a.exerciseId !== id; }));
    notify();
    var B = be();
    if (B) B.deleteExercise(id);
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
    var existing = attemptFor(exerciseId, operator);

    // Resume where they left off. Signing out used to lose everything a student had
    // changed: the attempt record survived, but the diagram state did not, so they
    // came back to the exercise's original fault with their partial fix gone. For a
    // multi-hour project that is the difference between usable and not.
    if (existing && existing.progress && Object.keys(existing.progress).length) {
      applySetup(ex);
      restoreProgress(ex, existing.progress);
    } else {
      applySetup(ex);
    }

    var attempt = existing || {
      exerciseId: exerciseId, operator: operator,
      startedAt: new Date().toISOString(),
      completedAt: null, passed: false, actions: [], progress: {}
    };
    // Restarting keeps the original start time and log: a student who resets is
    // still on the same attempt, and hiding that from the instructor would make
    // the duration column a lie.
    if (!existing) saveAttempt(attempt); else notify();

    // Push BEFORE the return — an earlier edit put this after it, where it never ran.
    var B = be();
    if (B) B.pushAttempt(attempt);
    return attempt;
  }

  /**
   * Re-apply a student's own overrides on top of the exercise's starting state, so
   * resuming shows the unit as they left it rather than as the instructor authored it.
   */
  function restoreProgress(ex, progress) {
    var ctrl = controllerFor(ex.unitId);
    if (!ctrl || typeof ctrl.setValue !== 'function') return;
    Object.keys(progress).forEach(function (k) {
      try { ctrl.setValue(k, progress[k]); } catch (e) {}
    });
    if (typeof ctrl.recalculate === 'function') ctrl.recalculate();
  }

  /**
   * Capture the student's current overrides into their attempt. Called on every
   * logged action, so progress is saved continuously rather than needing a Save
   * button nobody would remember to press before signing out.
   */
  /**
   * Capture progress for whatever exercise is currently open. Used by the exit paths
   * (page unload, sign-out, tab switch), which know a student is leaving but not which
   * exercise they were on.
   */
  function saveActiveProgress() {
    var id = null;
    try { id = localStorage.getItem('cta_exercise_active'); } catch (e) {}
    var op = window.CTAAuthOperator;
    if (!id || !op) return;
    saveProgress(id, op);
  }

  /**
   * The student's written answer. Several scenarios ask them to explain what happened
   * — Lev's diagnosis exercises are about reading evidence, not moving a number — and
   * there was nowhere to write it, so the brief asked for something the screen could
   * not accept. Kept on the attempt so it travels with their work and reaches the
   * instructor's report.
   */
  function saveDiagnosis(exerciseId, operator, text) {
    var attempt = attemptFor(exerciseId, operator);
    if (!attempt) return false;
    attempt.diagnosis = String(text || '');
    attempt.diagnosisAt = new Date().toISOString();
    saveAttempt(attempt);
    var B = be();
    if (B) B.pushAttempt(attempt);
    return true;
  }

  function saveProgress(exerciseId, operator) {
    var ex = getExercise(exerciseId);
    var attempt = attemptFor(exerciseId, operator);
    if (!ex || !attempt || attempt.passed) return;
    try {
      var snap = snapshot(ex.unitId);
      attempt.progress = snap.setup || {};
      saveAttempt(attempt);
      var B = be();
      if (B) B.pushAttempt(attempt);
    } catch (e) {}
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
      // Progress saved HERE, inside the loop that already matched the unit. It was
      // outside, keyed on open[0] — whichever attempt happened to be first — so with
      // two exercises open on different units it snapshotted a unit the student was
      // not touching and wrote the empty result onto the wrong attempt, losing the
      // work entirely. Silent loss is worse than no resume at all, because the
      // student has been told their progress persists.
      saveProgress(a.exerciseId, operator);
    });
    var B = be();
    if (B) {
      var mine = listAttempts().filter(function (a) { return a.operator === operator; });
      var latest = mine[mine.length - 1];
      if (latest) B.pushAttempt(latest);
    }
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
      // The pass is the thing an instructor's report is built from, so it goes to
      // the server the moment it happens rather than waiting for the next sync.
      var Bp = be();
      if (Bp) {
        Bp.pushAttempt({
          exerciseId: attempt.exerciseId,
          startedAt: attempt.startedAt,
          passedAt: attempt.completedAt,
          actions: attempt.actions || []
        });
      }
      passed = true;
    }
    return { ok: true, value: res.value, heldMs: heldMs, passed: passed };
  }

  function goalText(ex) {
    if (!ex.goal || !ex.goal.key) return '—';
    var label = ex.goal.label || ex.goal.key;
    var c = COMPARATORS[ex.goal.comparator] || COMPARATORS.within;
    var unit = ex.goal.unit || '';
    var body = (ex.goal.comparator === 'within')
      ? label + ' within \u00b1' + (ex.goal.tolerance || 0.5) + ' of ' + ex.goal.target + unit
      : label + ' ' + c.label + ' ' + ex.goal.target + unit;
    // An ASHRAE-linked goal carries its standard, so every surface showing the
    // goal shows what the number comes from.
    var AC = window.ASHRAECriteria;
    if (ex.goal.standard && AC) return body + ' \u00b7 ' + AC.badge(ex.goal.standard);
    return body;
  }

  /** The standard behind a goal, or null for a hand-set target. */
  function goalStandard(ex) {
    return (ex && ex.goal && ex.goal.standard) ? ex.goal.standard : null;
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
    if (a.passed) return 'passed';
    // Started but nothing changed yet is a different situation from started and
    // actively working, and the instructor's report reads better for the distinction.
    var touched = (a.actions && a.actions.length) ||
                  (a.progress && Object.keys(a.progress).length);
    return touched ? 'in-progress' : 'started';
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
    // Include the shared demo student, so the seeded scenarios are visible to whoever
    // signs in with the credentials on the sign-on card rather than only to the
    // lettered seats an instructor would assign by hand.
    if (seats.indexOf('cta_student') < 0) seats = seats.concat(['cta_student']);
    var now = new Date().toISOString();

    // Occupied window these scenarios are judged against — the same 08:00-18:00 the
    // Schedule Manager and the F-03 unoccupied alarm both use, so the three agree.
    function trend(preset, pattern) { return { preset: preset, pattern: pattern }; }

    return [
      {
        // 1. Ran all weekend with nobody in the building.
        id: 'ex-lev-weekend-override',
        title: 'Unit ran through the weekend',
        unitId: 'AHU-4-4',
        instructions:
          'Check the weekly schedule for this unit, then look at the supply fan run ' +
          'status in its History tab.\n\n' +
          'The schedule says weekdays 08:00\u201318:00, but the fan tells a different ' +
          'story. Compare it against zone CO\u2082 over the same days and decide whether ' +
          'anyone was actually in the space.\n\n' +
          'Write down what you think happened, then set the unit so it follows its ' +
          'schedule again.',
        setup: { runSchedule: true },
        weather: null,
        trends: {
          fanRunning: trend('fan-weekend-override', {
            days: 10, startHour: 8, endHour: 18, weekends: false, onValue: 1, offValue: 0,
            overrides: [
              { dayOffset: 4, startHour: 0, endHour: 24, value: 1 },
              { dayOffset: 3, startHour: 0, endHour: 24, value: 1 }
            ]
          }),
          co2Sensor: trend('co2-occupancy', {
            days: 10, startHour: 8, endHour: 18, weekends: false,
            onValue: 850, offValue: 420,
            // CO2 stays at baseline right through the weekend: the space was empty.
            overrides: []
          })
        },
        goal: {
          key: 'runSchedule', label: 'Run Schedule', unit: '',
          comparator: 'above', target: 0.5, tolerance: 0,
          standard: '36', criterionId: 'soo-supply-air-setpoint',
          criterionLabel: 'Unit follows its occupancy schedule',
          citation: 'ASHRAE Guideline 36 \u00a75.16 \u2014 AHU scheduling and occupancy',
          basis: 'requirement'
        },
        assignedTo: seats.slice(), published: true,
        createdBy: 'cta_instructor', createdAt: now
      },
      {
        // 2. Late running that WAS justified — the control case.
        id: 'ex-lev-extended-occupied',
        title: 'Late running \u2014 was it justified?',
        unitId: 'AHU-4-4',
        instructions:
          'This unit ran until 23:00 on Monday and Tuesday instead of stopping at ' +
          '18:00.\n\n' +
          'Before deciding that is a fault, check zone CO\u2082 over those same evenings. ' +
          'Does the data support someone having been in the space?\n\n' +
          'Say whether the override was justified, and what you would do about it.',
        setup: {},
        weather: null,
        trends: {
          fanRunning: trend('fan-weekend-override', {
            days: 10, startHour: 8, endHour: 18, weekends: false, onValue: 1, offValue: 0,
            overrides: [
              { dayOffset: 1, startHour: 18, endHour: 23, value: 1 },
              { dayOffset: 0, startHour: 18, endHour: 23, value: 1 }
            ]
          }),
          co2Sensor: trend('co2-occupancy', {
            days: 10, startHour: 8, endHour: 18, weekends: false,
            onValue: 850, offValue: 420,
            // CO2 stays high into the evening: the room was genuinely in use.
            overrides: [
              { dayOffset: 1, startHour: 18, endHour: 23, value: 900 },
              { dayOffset: 0, startHour: 18, endHour: 23, value: 880 }
            ]
          })
        },
        goal: {
          key: 'co2Sensor', label: 'Zone CO\u2082', unit: ' PPM',
          comparator: 'below', target: 1100, tolerance: 0,
          standard: '62.1', criterionId: 'iaq-co2-differential',
          criterionLabel: 'Zone CO\u2082 within ventilation indicator',
          citation: 'ASHRAE 62.1 Appendix C \u2014 CO\u2082 as an indicator of ventilation rate per person',
          basis: 'indicator'
        },
        assignedTo: seats.slice(), published: true,
        createdBy: 'cta_instructor', createdAt: now
      },
      {
        // 3. The same late running, one day later, with nobody there.
        id: 'ex-lev-forgotten-override',
        title: 'The override nobody reset',
        unitId: 'AHU-4-4',
        instructions:
          'There was an evening event on Monday, so the unit was held on until 23:00. ' +
          'It ran until 23:00 again on Tuesday.\n\n' +
          'Compare zone CO\u2082 on the two evenings. What does Tuesday tell you that ' +
          'Monday does not?\n\n' +
          'Explain what went wrong and put the unit back on its schedule.',
        setup: { runSchedule: true },
        weather: null,
        trends: {
          fanRunning: trend('fan-weekend-override', {
            days: 10, startHour: 8, endHour: 18, weekends: false, onValue: 1, offValue: 0,
            overrides: [
              { dayOffset: 2, startHour: 18, endHour: 23, value: 1 },
              { dayOffset: 1, startHour: 18, endHour: 23, value: 1 }
            ]
          }),
          co2Sensor: trend('co2-occupancy', {
            days: 10, startHour: 8, endHour: 18, weekends: false,
            onValue: 850, offValue: 420,
            // Monday evening occupied, Tuesday evening empty — the whole exercise.
            overrides: [{ dayOffset: 2, startHour: 18, endHour: 23, value: 900 }]
          })
        },
        goal: {
          key: 'runSchedule', label: 'Run Schedule', unit: '',
          comparator: 'above', target: 0.5, tolerance: 0,
          standard: '36', criterionId: 'soo-supply-air-setpoint',
          criterionLabel: 'Unit follows its occupancy schedule',
          citation: 'ASHRAE Guideline 36 \u00a75.16 \u2014 AHU scheduling and occupancy',
          basis: 'requirement'
        },
        assignedTo: seats.slice(), published: true,
        createdBy: 'cta_instructor', createdAt: now
      },
      {
        // 4. Three signals, one conclusion — Lev's "prove it was mechanically cooling".
        id: 'ex-lev-supply-temp-evidence',
        title: 'Prove the unit was running',
        unitId: 'AHU-4-4',
        instructions:
          'Someone insists this air handler was off over the weekend.\n\n' +
          'Use three readings to test that claim: the supply fan run status, zone ' +
          'CO\u2082, and the supply air temperature. A unit that is off cannot hold ' +
          '60\u00b0F supply air \u2014 that only happens with the chilled water valve open.\n\n' +
          'Set out what each reading tells you, and what the three together prove.',
        setup: {},
        weather: null,
        trends: {
          fanRunning: trend('fan-weekend-override', {
            days: 10, startHour: 8, endHour: 18, weekends: false, onValue: 1, offValue: 0,
            overrides: [
              { dayOffset: 4, startHour: 0, endHour: 24, value: 1 },
              { dayOffset: 3, startHour: 0, endHour: 24, value: 1 }
            ]
          }),
          co2Sensor: trend('co2-occupancy', {
            days: 10, startHour: 8, endHour: 18, weekends: false,
            onValue: 850, offValue: 420, overrides: []
          }),
          supplyAirTemp: trend('sat-mechanical-cooling', {
            days: 10, startHour: 8, endHour: 18, weekends: false,
            // 60 while conditioning, drifting to 74 when genuinely off.
            onValue: 60, offValue: 74,
            overrides: [
              { dayOffset: 4, startHour: 0, endHour: 24, value: 60 },
              { dayOffset: 3, startHour: 0, endHour: 24, value: 60 }
            ]
          })
        },
        goal: {
          key: 'co2Sensor', label: 'Zone CO\u2082', unit: ' PPM',
          comparator: 'below', target: 1100, tolerance: 0,
          standard: '62.1', criterionId: 'iaq-co2-differential',
          criterionLabel: 'Zone CO\u2082 within ventilation indicator',
          citation: 'ASHRAE 62.1 Appendix C \u2014 CO\u2082 as an indicator of ventilation rate per person',
          basis: 'indicator'
        },
        assignedTo: seats.slice(), published: true,
        createdBy: 'cta_instructor', createdAt: now
      },
      {
        // 5. ASHRAE violation on AHU-23-1 — the scenario that needed this unit to be
        // able to raise an alarm at all. Boiler-room air handler, so the teaching point
        // is that 62.1 ventilation applies wherever people work, not only to offices.
        id: 'ex-lev-ashrae-ventilation',
        title: 'Ventilation violation \u2014 ASHRAE 62.1',
        unitId: 'AHU-23-1',
        instructions:
          'An alarm has been raised against this unit. Open the Alarm Summary, find it, ' +
          'and work out which condition tripped.\n\n' +
          'Then fix it on the diagram and say which ASHRAE standard the original state ' +
          'violated, and why that standard exists.\n\n' +
          'Hint: the outdoor air damper has a minimum position for a reason.',
        setup: { oaDamperPosition: 0, co2Sensor: 1250 },
        weather: null,
        trends: null,
        goal: {
          key: 'oaDamperPosition', label: 'OA Damper Position', unit: '%',
          comparator: 'above', target: 19.5, tolerance: 0,
          standard: '62.1', criterionId: 'iaq-min-damper',
          criterionLabel: 'OA damper at or above minimum position',
          citation: 'ASHRAE 62.1 \u00a75.16 \u2014 outdoor air intake, minimum position during occupancy',
          basis: 'requirement'
        },
        assignedTo: seats.slice(), published: true,
        createdBy: 'cta_instructor', createdAt: now
      },
      {
        id: 'ex-starter-overcool-v2',
        title: 'Space is being overcooled',
        unitId: 'AHU-4-6',
        instructions:
          'Occupants on the 2nd level are complaining that the space is far too cold.\n\n' +
          'The room wants 72\u00b0F. The cooling coil setpoint for this unit is 70\u00b0F in ' +
          'Auto. So why is supply air sitting at 60\u00b0F?\n\n' +
          'Work out what is holding it there, put it back, and say in your diagnosis what ' +
          'the evidence told you.\n\n' +
          'Hint: check the colour of each reading. A point in Auto is drawn in the normal ' +
          'panel colour; a point somebody has overridden by hand is magenta. The Point ' +
          'Attribute Report (View menu) lists every override on the system.',
        // The zone setpoint is the reference that makes the mismatch visible, and the
        // overridden coil setpoint is the fault. 70 is its Auto value, so releasing the
        // override is the fix rather than typing a number from the brief.
        setup: { coolingCoilSetpoint: 60, zoneTempSetpoint: 72 },
        weather: null,
        goal: {
          key: 'supplyAirTemp', label: 'Supply Air Temperature', unit: '\u00b0F',
          comparator: 'within', target: 70, tolerance: 2,
          standard: '36', criterionId: 'soo-supply-air-setpoint',
          criterionLabel: 'Supply air at its active setpoint',
          citation: 'ASHRAE Guideline 36 \u00a75.16 \u2014 AHU supply air temperature control',
          basis: 'requirement'
        },
        assignedTo: seats.slice(),
        published: true,
        createdBy: 'cta_instructor',
        createdAt: now
      },
      {
        id: 'ex-starter-nostart',
        title: 'Ventilation not keeping up with occupancy',
        unitId: 'AHU-4-4',
        instructions:
          'The Ballroom is at high occupancy and zone CO\u2082 has climbed past the level ' +
          'ASHRAE 62.1 uses to indicate adequate ventilation. Bring it back down.\n\n' +
          'Hint: the sequence should be bringing in more outdoor air as CO\u2082 rises \u2014 ' +
          'check the outdoor air damper and what is commanding the unit.',
        setup: { co2Sensor: 1450, oaDamperPosition: 0 },
        weather: null,
        // CO2 below the 62.1 Appendix C indicator, not a raw airflow number: 1000 CFM
        // on a unit rated for 16,500 is not a fault, and reads as a typo for ppm.
        goal: {
          key: 'co2Sensor', label: 'Zone CO\u2082', unit: ' PPM',
          comparator: 'below', target: 1100, tolerance: 0,
          standard: '62.1', criterionId: 'iaq-co2-differential',
          criterionLabel: 'Zone CO\u2082 within ventilation indicator',
          citation: 'ASHRAE 62.1 Appendix C \u2014 CO\u2082 as an indicator of ventilation rate per person',
          basis: 'indicator'
        },
        assignedTo: seats.slice(),
        published: true,
        createdBy: 'cta_instructor',
        createdAt: now
      }
    ];
  }

  /** Ids already seeded at some point, so a deliberately deleted starter stays gone. */
  function seededIds() {
    try {
      var raw = localStorage.getItem(SEED_FLAG);
      if (!raw || raw === '1') return [];          // legacy boolean marker
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  /**
   * A library of ready-made exercises across the units the seeded scenarios miss.
   * Saved as drafts so cta_instructor can review, retarget and publish them rather
   * than finding them already live in front of a class.
   */
  function libraryExercises() {
    var now = new Date().toISOString();
    var seats = (window.AuthHelpers && window.AuthHelpers.STUDENT_SEATS) ||
      ['student_a', 'student_b', 'student_c', 'student_d', 'student_e', 'student_f'];
    function ex(o) {
      // Library entries default to drafts, since the instructor chooses what a class
      // sees. An entry may opt in with published/assigned — the helper used to hardcode
      // both, so those fields were silently ignored.
      var to = o.assigned || [];
      return {
        id: o.id, title: o.title, unitId: o.unit, instructions: o.brief,
        setup: o.setup, weather: o.weather || null, goal: o.goal,
        assignedTo: to,
        assignment: { mode: to.length ? 'students' : 'students', groupIds: [], seatIds: to },
        published: !!o.published, createdBy: 'cta_instructor', createdAt: now
      };
    }
    return [
      // ── AHU-4-3 ───────────────────────────────────────────────────────────
      ex({
        id: 'ex-lib-43-overcool',
        title: 'Ballroom running cold',
        unit: 'AHU-4-3',
        brief: 'The ballroom is being overcooled and staff are complaining. Supply air is well below where it should be for this unit. Find what is driving it and return supply air to its design setpoint.\n\nHint: a point left in Manual overrides the control program. The Point Attribute Report under View lists every override on the system.',
        setup: { coolingCoilSetpoint: 46 },
        goal: { key: 'supplyAirTemp', label: 'Supply Air Temperature', unit: '\u00b0F',
                comparator: 'within', target: 60, tolerance: 1.5,
                standard: '36', criterionId: 'soo-supply-air-setpoint',
                criterionLabel: 'Supply air at its active setpoint',
                citation: 'ASHRAE Guideline 36 \u00a75.16 \u2014 AHU supply air temperature control',
                basis: 'requirement' }
      }),
      ex({
        id: 'ex-lib-43-damper',
        title: 'Ventilation shut off during occupancy',
        unit: 'AHU-4-3',
        brief: 'Temperatures look correct but the space feels stuffy. Check whether the unit is actually bringing in outdoor air, and restore the minimum position required during occupied hours.\n\nThis is a fault a student will not catch by watching supply air alone.',
        setup: { oaDamperPosition: 0 },
        goal: { key: 'oaDamperPosition', label: 'OA Damper Position', unit: '%',
                comparator: 'above', target: 19.5, tolerance: 0,
                standard: '62.1', criterionId: 'iaq-min-damper',
                criterionLabel: 'OA damper at or above minimum position',
                citation: 'ASHRAE 62.1 \u00a75.16 \u2014 outdoor air intake, minimum position during occupancy',
                basis: 'requirement' }
      }),

      // ── AHU-23-1 ──────────────────────────────────────────────────────────
      ex({
        id: 'ex-lib-231-fan',
        title: 'Meeting rooms getting no air',
        unit: 'AHU-23-1',
        brief: 'Occupants on the 2nd level report no air movement during the working day. Work out what is stopping the unit and get airflow restored.\n\nHint: check what is commanding the unit before you touch the fan itself.',
        setup: { runSchedule: false },
        goal: { key: 'cfm', label: 'Supply Airflow', unit: ' CFM',
                comparator: 'above', target: 1000, tolerance: 0,
                standard: '62.1', criterionId: 'iaq-min-oa-airflow',
                criterionLabel: 'Minimum outdoor airflow maintained',
                citation: 'ASHRAE 62.1 \u00a76.2 \u2014 Ventilation Rate Procedure, minimum outdoor air intake',
                basis: 'requirement' }
      }),
      ex({
        id: 'ex-lib-231-freeze',
        title: 'Preheat coil not protecting the plenum',
        unit: 'AHU-23-1',
        brief: 'It is a cold morning and the preheat coil is not doing its job. Find out why the plenum is running below its minimum and bring supply air back to setpoint.\n\nFreeze protection runs at all times, not only when the space calls for heat \u2014 work out what is preventing it.',
        setup: { phtValvePosition: 0, oaTemperature: 28 },
        goal: { key: 'supplyAirTemp', label: 'Supply Air Temperature', unit: '\u00b0F',
                comparator: 'within', target: 60, tolerance: 2,
                standard: '36', criterionId: 'soo-supply-air-setpoint',
                criterionLabel: 'Supply air at its active setpoint',
                citation: 'ASHRAE Guideline 36 \u00a75.16 \u2014 AHU supply air temperature control',
                basis: 'requirement' }
      }),

      // ── VAV-4-4-02 ────────────────────────────────────────────────────────
      // A terminal box teaches something the AHUs cannot: the zone can be wrong while
      // the air handler upstream is behaving perfectly.
      ex({
        id: 'ex-lib-vav-damper-v3',
        title: 'Ballroom zone starved of air',
        unit: 'VAV-4-4-02',
        brief: 'The ballroom is stuffy and occupants are complaining, but AHU-4-4 upstream ' +
          'looks healthy \u2014 its fan is running and its discharge air is on setpoint.\n\n' +
          'Three readings at this box tell you what is wrong. Take them in order:\n\n' +
          '\u2022 Zone airflow \u2014 how much air is actually reaching the room\n' +
          '\u2022 Zone CO\u2082 \u2014 whether the room is occupied and being ventilated\n' +
          '\u2022 Damper position \u2014 what the box is doing about it\n\n' +
          'The damper is throttled rather than shut. In a real plant a terminal damper ' +
          'driven fully closed against a running fan builds duct static until the ' +
          'high-pressure safety trips and stops the unit \u2014 so a starved zone you can ' +
          'actually stand and diagnose is a throttled one, not a closed one.\n\n' +
          'Put the box back on its own sequence and airflow will recover; CO\u2082 falling is ' +
          'how you know it worked. Then say what each reading told you and how they fit ' +
          'together.\n\n' +
          'Two things worth being precise about in your answer. The box never drops below ' +
          'its 200 CFM minimum, so this is not a minimum-airflow violation. And CO\u2082 never ' +
          'reaches the 1,100 ppm figure 62.1 Appendix C cites \u2014 it is a rise well above ' +
          'this zone\u0027s own normal reading, which is what tells you ventilation has fallen ' +
          'behind the occupancy. Say which standard applies, and why a rising trend matters ' +
          'before any published limit is crossed.\n\n' +
          'Hint: check the colour of the damper reading. A point in Auto is drawn in the ' +
          'normal panel colour; one somebody has overridden by hand is magenta.',
        // 5%, not 0%: deep enough that airflow (240 CFM) sits well under the 320 CFM pass
        // threshold, so the exercise cannot be cleared by nudging the damper a percent —
        // releasing the override to Auto is what passes it. And not 0%, because a terminal
        // damper driven shut against a running fan would trip the high-static safety.
        setup: { damperPosition: 5 },
        published: true,
        assigned: seats.slice(),
        // Graded on airflow, reasoned with CO2. Grading on a CO2 number cannot work here:
        // releasing the override lands at 705 ppm and 62.1's indicator is 1100, so any
        // threshold that fails the fault also fails the correct fix, and any threshold
        // matching the standard never trips at all. Airflow has real headroom either side —
        // fault 240, Auto 360 — so releasing to Auto passes, which is the habit every other
        // exercise in this set teaches. CO2 stays as the evidence, not the test.
        goal: { key: 'airflowCFM', label: 'Zone Airflow', unit: ' CFM',
                comparator: 'above', target: 320, tolerance: 0,
                standard: '62.1', criterionId: 'iaq-co2-differential',
                criterionLabel: 'Zone ventilation adequate for occupancy',
                citation: 'ASHRAE 62.1 Appendix C \u2014 CO\u2082 as an indicator of ventilation rate per person',
                basis: 'indicator' }
      })
    ];
  }

  // Bump when a seeded definition changes. Any stored copy seeded at a lower version is
  // refreshed, so a content fix reaches browsers that have already seeded.
  // BUMP THIS whenever a seeded definition's content changes. The upgrade guard skips any
  // stored copy already at this version, so an edit without a bump is silently inert —
  // that is how the reworked VAV brief failed to reach a browser that had already seeded.
  var SEED_VERSION = 4;
  var SNAPSHOT_KEY = 'cta_exercises_seed_snapshot';

  // Superseded seeds. A stored copy is dropped when it still matches what was seeded;
  // if the instructor changed it, theirs is kept and only logged. Listing the successor
  // means a browser cannot end up holding both versions of the same exercise.
  var RETIRED_SEEDS = {
    'ex-starter-overcool': 'ex-starter-overcool-v2',
    'ex-lib-vav-damper': 'ex-lib-vav-damper-v2',
    // Superseded again: the 0% damper tripped the high-static safety (SME review).
    'ex-lib-vav-damper-v2': 'ex-lib-vav-damper-v3'
  };

  /**
   * Remove a superseded exercise and any attempts against it.
   *
   * Unconditional on purpose. The earlier version tried to protect edited copies by
   * checking whether anyone had started the exercise, which is not the same question —
   * and the result was that a rejected definition stayed published next to its
   * replacement. A retired id has a successor carrying the corrected content; leaving
   * both means a student picks between two identical titles.
   */
  function dropRetired(list) {
    var kept = list.filter(function (e) { return !RETIRED_SEEDS[e.id]; });
    var dropped = list.length - kept.length;
    if (dropped) {
      var dead = {};
      list.forEach(function (e) { if (RETIRED_SEEDS[e.id]) dead[e.id] = true; });
      // Attempts on a removed exercise would otherwise sit in the report forever with
      // nothing to attach to.
      writeJSON(ATTEMPT_KEY, listAttempts().filter(function (a) { return !dead[a.exerciseId]; }));
    }
    return { kept: kept, dropped: dropped };
  }

  function readSnapshot() {
    try {
      var raw = localStorage.getItem(SNAPSHOT_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }

  /** What matters for "has the instructor changed this?" — not timestamps or ids. */
  function seedFingerprint(e) {
    return JSON.stringify({
      title: e.title, instructions: e.instructions, setup: e.setup,
      weather: e.weather, goal: e.goal, published: e.published,
      assignedTo: (e.assignedTo || []).slice().sort()
    });
  }

  function seedIfEmpty() {
    try {
      var seen = seededIds();
      var snapshot = readSnapshot();
      var existing = listExercises();
      var byId = {};
      existing.forEach(function (e) { byId[e.id] = e; });

      var defs = starterExercises().concat(libraryExercises());
      var add = [];
      var refreshed = 0, keptEdited = [], retired = [];

      // Drop superseded copies before adding their replacements.
      existing.forEach(function (e) { if (RETIRED_SEEDS[e.id]) retired.push(e.id); });
      var pruned = dropRetired(existing);
      existing = pruned.kept;
      byId = {};
      existing.forEach(function (e) { byId[e.id] = e; });

      // Verifier probe rows that were published to the student list by mistake. Matched
      // by id prefix rather than title, so a real exercise cannot be caught by accident.
      var beforeProbe = existing.length;
      existing = existing.filter(function (e) {
        return !/^verify-|^probe-|^audit-/.test(String(e.id));
      });
      if (existing.length !== beforeProbe) {
        retired.push((beforeProbe - existing.length) + ' test row(s)');
        byId = {};
        existing.forEach(function (e) { byId[e.id] = e; });
      }
      // And the throwaway operators those probes left behind.
      writeJSON(ATTEMPT_KEY, listAttempts().filter(function (a) {
        return !/^verif_|^probe_|^progress_test|^multi_test/.test(String(a.operator || ''));
      }));

      defs.forEach(function (def) {
        var stored = byId[def.id];

        // Never seeded, and not deleted by hand — add it.
        if (!stored) {
          if (seen.indexOf(def.id) < 0) add.push(def);
          return;
        }

        var snap = snapshot[def.id];
        // Seeded before versioning existed, or already current: leave it.
        if (!snap || (snap.version || 1) >= SEED_VERSION) return;

        // Only replace a copy that still matches what was seeded. If the instructor has
        // touched the title, brief, setup, goal or assignment, their version wins.
        if (snap.fingerprint && snap.fingerprint !== seedFingerprint(stored)) {
          keptEdited.push(def.id);
          return;
        }

        // Carry the instructor's own publication and assignment forward rather than
        // resetting them: a content fix should not un-assign a live exercise.
        byId[def.id] = Object.assign({}, def, {
          published: stored.published,
          assignedTo: stored.assignedTo || def.assignedTo,
          assignment: stored.assignment || def.assignment,
          createdAt: stored.createdAt || def.createdAt
        });
        refreshed++;
      });

      var nextSeen = seen.slice();
      defs.forEach(function (e) {
        if (nextSeen.indexOf(e.id) < 0) nextSeen.push(e.id);
      });
      localStorage.setItem(SEED_FLAG, JSON.stringify(nextSeen));

      if (!add.length && !refreshed && !retired.length) {
        // Still record the snapshot, so a browser seeded before versioning gets a
        // baseline and the NEXT bump can reach it.
        writeSnapshot(existing, defs, snapshot);
        return;
      }

      // Rebuild in the stored order, with refreshed copies swapped in place, then append.
      var next = existing.map(function (e) { return byId[e.id] || e; }).concat(add);
      writeJSON(EX_KEY, next);
      writeSnapshot(next, defs, snapshot);
      if (window.console && (keptEdited.length || retired.length)) {
        if (retired.length) {
          console.info('[Exercises] Replaced superseded seed(s): ' + retired.join(', '));
        }
        if (keptEdited.length) {
          console.info('[Exercises] Kept your edited copy of: ' + keptEdited.join(', '));
        }
      }
      notify();
    } catch (e) {}
  }

  /** Record what each seeded exercise looked like when written, for the next upgrade. */
  function writeSnapshot(list, defs, prev) {
    try {
      var seedIds = {};
      defs.forEach(function (d) { seedIds[d.id] = true; });
      var out = Object.assign({}, prev);
      list.forEach(function (e) {
        if (!seedIds[e.id]) return;
        var was = prev[e.id];
        // Keep the old fingerprint if this copy was not refreshed this run, so an edit
        // made since the last seed is still detectable.
        out[e.id] = { version: SEED_VERSION, fingerprint: seedFingerprint(e) };
        if (was && (was.version || 1) >= SEED_VERSION && was.fingerprint) {
          out[e.id].fingerprint = was.fingerprint;
        }
      });
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(out));
    } catch (e) {}
  }

  seedIfEmpty();

  /** The backend, when one is configured. */
  function be() {
    var B = window.SupabaseBackend;
    return (B && B.isConfigured()) ? B : null;
  }

  /**
   * The exercise the signed-in student currently has open, or null. Used by the
   * History tab to find authored trends — it has no other way to know an exercise is
   * running.
   */
  function activeExercise() {
    var op = window.CTAAuthOperator;
    if (!op) return null;
    var open = listAttempts().filter(function (a) {
      return a.operator === op && !a.passed;
    });
    if (!open.length) return null;
    return getExercise(open[open.length - 1].exerciseId);
  }

  // Closing the tab is the most common way a session ends, and it gave no chance to
  // write anything. beforeunload is best-effort but localStorage is synchronous, so the
  // local record lands even when the network push does not.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', function () {
      try { saveActiveProgress(); } catch (e) {}
    });
    // Fires when a tab is backgrounded or the browser is closed on mobile, where
    // beforeunload is unreliable.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        try { saveActiveProgress(); } catch (e) {}
      }
    });
  }

  window.ExerciseStore = {
    activeExercise: activeExercise,
    saveActiveProgress: saveActiveProgress,
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
    saveProgress: saveProgress,
    saveDiagnosis: saveDiagnosis,
    logAction: logAction,
    evaluate: evaluate,
    check: check,
    goalText: goalText,
    goalStandard: goalStandard,
    durationOf: durationOf,
    statusFor: statusFor,
    controllerFor: controllerFor,
    seedIfEmpty: seedIfEmpty
  };
})();
