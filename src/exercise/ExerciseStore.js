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
    // Push BEFORE returning. An earlier edit left `return ex;` above this block, so the
    // Supabase write was unreachable dead code: every exercise saved locally, nothing
    // ever reached public.exercises, and no assignment rows were written either — which
    // is why students saw none of it.
    var B = be();
    if (B) {
      B.pushExercise(ex).then(function (res) {
        if (res && res.ok) return;
        // Reported, not swallowed. An instructor who believes an exercise was published
        // when it only exists in their browser has no way to discover that otherwise —
        // the students simply never see it.
        var st = (B.getStatus && B.getStatus()) || {};
        var why = (res && res.error) || st.lastError || 'unknown error';
        if (window.console) console.error('[ExerciseStore] NOT saved to server:', why);
        window.alert('Saved on this computer only — the server rejected it.\n\n' + why +
          '\n\nStudents will not see this exercise until it reaches the server.');
      });
    }
    return ex;
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
    // Push from the single choke point every attempt write passes through, rather than
    // from each caller. startAttempt, logAction, saveProgress, saveDiagnosis and the pass
    // check all land here, and scattering the push across them is how paths get missed —
    // which is why an instructor saw "Not started" for students who were actively working.
    var B = be();
    if (B) B.pushAttempt(attempt);
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
      completedAt: null, passed: false, actions: [], progress: {},
      // Time genuinely spent on the exercise, accumulated in beat().
      activeMs: 0, lastBeatAt: null
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

    // Failed sensors. Applied after the setup so a fault always wins over a plain value,
    // and cleared first so re-opening an exercise does not stack faults from a previous
    // attempt. A point faulted this way reports FAULT rather than MANUAL and never shows
    // among the overrides — which is the point: the student has to question the reading,
    // not find it on a list.
    var faults = ex.sensorFaults || {};
    if (typeof ctrl.clearSensorFaults === 'function') ctrl.clearSensorFaults();
    Object.keys(faults).forEach(function (k) {
      try {
        if (typeof ctrl.setSensorFault === 'function') ctrl.setSensorFault(k, faults[k]);
      } catch (e) {}
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

  // Longer than this between heartbeats and the student was not working: signed out,
  // closed the tab, or walked away. 90s is comfortably above the 20s beat, so ordinary
  // scheduling jitter never trims real work.
  var IDLE_CUTOFF_MS = 90000;
  var BEAT_MS = 20000;
  var beatTimer = null;

  /**
   * Add the time since the last beat to the attempt's active total. Called on a timer
   * while the exercise is open and focused, and once more on the way out, so the final
   * partial interval is not lost.
   */
  function beat(exerciseId, operator) {
    var a = attemptFor(exerciseId, operator);
    if (!a || a.passed) return;
    var now = Date.now();
    var last = a.lastBeatAt ? new Date(a.lastBeatAt).getTime() : now;
    var gap = now - last;
    // A gap beyond the cutoff is idle time, not work — count nothing for it.
    if (gap > 0 && gap <= IDLE_CUTOFF_MS) {
      a.activeMs = (a.activeMs || 0) + gap;
    }
    a.lastBeatAt = new Date(now).toISOString();
    saveAttempt(a);
  }

  /**
   * Start counting for this attempt. Stops on sign-out, on the tab being hidden, and
   * when the exercise is left — each of those is a moment the student is demonstrably
   * not working, and each writes a final beat first so nothing in progress is dropped.
   */
  function startTimer(exerciseId, operator) {
    stopTimer();
    var a = attemptFor(exerciseId, operator);
    if (!a || a.passed) return;
    // Reset the mark so the gap since a previous session is not counted as work.
    a.lastBeatAt = new Date().toISOString();
    saveAttempt(a);
    beatTimer = setInterval(function () {
      // A hidden tab is not work. Skipping the beat leaves lastBeatAt stale, and the
      // gap check above then discards the whole away period when they return.
      if (typeof document !== 'undefined' && document.hidden) return;
      beat(exerciseId, operator);
    }, BEAT_MS);
  }

  function stopTimer(exerciseId, operator) {
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    if (exerciseId && operator) beat(exerciseId, operator);
  }

  function durationOf(attempt) {
    if (!attempt) return null;
    // Prefer accumulated active time. Attempts recorded before this existed have no
    // activeMs, so they fall back to the old elapsed figure rather than reading zero.
    var ms;
    if (typeof attempt.activeMs === 'number' && attempt.activeMs > 0) {
      ms = attempt.activeMs;
    } else {
      if (!attempt.startedAt) return null;
      var end = attempt.completedAt ? new Date(attempt.completedAt) : new Date();
      ms = end - new Date(attempt.startedAt);
    }
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
    // build() reads occHigh/occLow — NOT onValue/offValue, which it silently ignores and
  // falls back to 900/450 on. On a binary point that renders as "on" at every hour,
  // which erases whatever fault the trend was meant to show.
  function trend(preset, pattern) { return { preset: preset, pattern: pattern }; }

    return [
      {
        // 1. Ran all weekend with nobody in the building.
        id: 'ex-lev-weekend-override',
        title: 'Unit ran through the weekend',
        instructorNotes:
          'Run Schedule is a status, not a modulating value. It is a binary input: 0 means ' +
          'off, 1 means on, and nothing in between. A speed feedback would modulate \u2014 25, ' +
          '35, 68 \u2014 but a run status is a switch.\n\n' +
          'What happened: Axel put the unit in manual to run it outside hours and never ' +
          'put it back. The schedule still said weekdays 08:00\u201318:00; the fan ran straight ' +
          'through Saturday and Sunday anyway.\n\n' +
          'Zone CO\u2082 is what proves nobody was in the building. CO\u2082 rises with occupancy, so ' +
          'a flat reading near the outdoor baseline over those same days means the space was ' +
          'empty \u2014 the unit was conditioning air for nobody. Two full days of fan energy, ' +
          'heating and cooling, for no one.\n\n' +
          'This is the most common finding in a real building and the cheapest to fix: put ' +
          'the point back to Auto so it follows its schedule. Always check whether an ' +
          'override was left behind after an event or an after-hours request.',
        unitId: 'AHU-4-4',
        instructions:
          // Run Schedule is a status, not a modulating value, so "above 0.5" reads as a
          // percentage unless the binary is spelled out. Lev asked for exactly this.
          'Run Schedule is a status, not a percentage: 0 means off, 1 means on. The goal ' +
          'reads "above 0.5" because that is how the check tells the two apart \u2014 it means ' +
          'the unit must be following its schedule again.\n\n' +
          'Check the weekly schedule for this unit, then look at the supply fan run ' +
          'status in its History tab.\n\n' +
          'The schedule says weekdays 08:00\u201318:00, but the fan tells a different ' +
          'story. Compare it against zone CO\u2082 over the same days and decide whether ' +
          'anyone was actually in the space \u2014 and note that the answer may not be the ' +
          'same on every one of those days.\n\n' +
          'The point\u2019s Recent Events tab records who changed what, and when.\n\n' +
          'Write down what you think happened, then set the unit so it follows its ' +
          'schedule again.',
        setup: { runSchedule: true },
        weather: null,
        // Authored event history. A trend shows THAT the unit ran; this shows who put it
        // that way. Without it the exercise can only be solved by inference, and Lev's
        // framing was explicit — the student should be able to read the override off the
        // point's own Recent Events, with a name and a timestamp against it.
        events: [
          // The override itself, on the schedule point where it was made.
          { pointKey: 'runSchedule', weekday: 5, hour: 18, etype: 'Mode Transition',
            prev: 'Auto', val: 'Manual', by: 'Axel' },
          { pointKey: 'runSchedule', weekday: 5, hour: 18, etype: 'Value Change',
            prev: 'OFF', val: 'ON', by: 'Axel' },
          // And its consequence on the fan, which is the point the brief sends students to.
          // Same timestamp and the same name, so opening either one answers "who did this".
          { pointKey: 'supplyFanStatus', weekday: 5, hour: 18, etype: 'Value Change',
            prev: 'OFF', val: 'ON', by: 'Axel' },
          { pointKey: 'fanRunning', weekday: 5, hour: 18, etype: 'Value Change',
            prev: 'Stopped', val: 'Running', by: 'Axel' },
          // And on fan SPEED. That is the labelled chip a student opens first, while run
          // status is the green START block, which does not read as a clickable point at
          // all — so the override was authored on points nobody found. Finding "no recent
          // events" and having to guess which other point holds the record is a hunt
          // through the UI, not through the fault.
          { pointKey: 'fanSpeed', weekday: 5, hour: 18, etype: 'Value Change',
            prev: '0 %', val: '38 %', by: 'Axel' },
          { pointKey: 'fanSpeedSetpoint', weekday: 5, hour: 18, etype: 'Value Change',
            prev: '0 %', val: '38 %', by: 'Axel' }
        ],
        trends: {
          // Both keys carry it. supplyFanStatus is the chip on the diagram — the one the
          // brief sends students to — and fanRunning is the same signal reached from the
          // left panel. Authoring only the internal flag left the visible point blank.
          supplyFanStatus: trend('fan-weekend-override', {
            // occHigh/occLow are the parameters build() actually reads. onValue/offValue
            // were silently ignored, so this emitted 900/450 and the fan read Running for
            // every hour of the window.
            days: 10, startHour: 8, endHour: 18, weekends: false, occHigh: 1, occLow: 0,
            overrides: [
              // Friday 18:00 onward as ONE uninterrupted run through to Monday morning:
              // that shape is what points at a single override rather than a broken
              // schedule. Named weekdays, so it lands on the weekend whenever it is read.
              { weekday: 5, startHour: 18, endHour: 24, value: 1 },
              { weekday: 6, startHour: 0, endHour: 24, value: 1 },
              { weekday: 0, startHour: 0, endHour: 24, value: 1 },
              { weekday: 1, startHour: 0, endHour: 8, value: 1 }
            ]
          }),
          fanRunning: trend('fan-weekend-override', {
            days: 10, startHour: 8, endHour: 18, weekends: false, occHigh: 1, occLow: 0,
            overrides: [
              // Friday 18:00 onward: the override goes in and never comes out. Continuous
              // through both weekend days rather than two separate all-day blocks, so the
              // trace reads as one uninterrupted run from a single action — which is what
              // points a student at an override rather than at a faulty schedule.
              { dayOffset: 5, startHour: 18, endHour: 24, value: 1 },
              { dayOffset: 4, startHour: 0, endHour: 24, value: 1 },
              { dayOffset: 3, startHour: 0, endHour: 24, value: 1 },
              // Still running Monday morning until someone notices.
              { dayOffset: 2, startHour: 0, endHour: 8, value: 1 }
            ]
          }),
          co2Sensor: trend('co2-occupancy', {
            days: 10, startHour: 8, endHour: 18, weekends: false,
            occHigh: 850, occLow: 470,
            jitter: 18,
            overrides: [
              // Friday evening: the event. CO2 near 1,000 through to 23:00 proves the late
              // running was justified at the time — the half of the story that stops a
              // student reporting the override as simple negligence.
              { weekday: 5, startHour: 18, endHour: 23, value: 960 },
              // 23:00 onward, and all weekend: back to the outdoor baseline. The fan is
              // still running, and now there is nobody to run it for.
              { weekday: 5, startHour: 23, endHour: 24, value: 480 },
              { weekday: 6, startHour: 0, endHour: 24, value: 472 },
              { weekday: 0, startHour: 0, endHour: 24, value: 468 }
            ]
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
        instructorNotes:
          'This one is NOT a fault, and that is the lesson. The unit ran to 23:00 instead ' +
          'of 18:00, which looks like the weekend-override problem \u2014 until you check CO\u2082.\n\n' +
          'CO\u2082 sat at 800\u2013900 ppm through those late hours. CO\u2082 rises with occupancy, so that ' +
          'is people in the building: an event, a late meeting, a legitimate after-hours ' +
          'request. The unit was doing the right thing.\n\n' +
          'An operator who reports every after-hours run as a fault stops being trusted. ' +
          'Schedule alone never tells you whether running was justified \u2014 pair it with an ' +
          'occupancy signal before you judge.',
        unitId: 'AHU-4-4',
        instructions:
          'This unit ran until 23:00 on Monday and Tuesday instead of stopping at ' +
          '18:00.\n\n' +
          'Before deciding that is a fault, check zone CO\u2082 over those same evenings. ' +
          'Does the data support someone having been in the space?\n\n' +
          'Say whether the override was justified, and what you would do about it.',
        setup: {},
        weather: null,
        // The request behind the late run. Without it a student can only infer that the
        // after-hours operation was legitimate; with it they can point at who asked and
        // when — which is the difference between a hunch and a finding. Deliberately a
        // REQUEST rather than a bare override, so it contrasts with the forgotten-override
        // exercise where the same run shape has nothing authorising it.
        events: [
          { pointKey: 'runSchedule', weekday: 1, hour: 16, etype: 'Mode Transition',
            prev: 'Auto', val: 'Manual', by: 'Axel' },
          { pointKey: 'runSchedule', weekday: 1, hour: 16, etype: 'Value Change',
            prev: 'OFF', val: 'ON (event request \u2014 conference room, to 23:00)', by: 'Axel' },
          { pointKey: 'fanSpeed', weekday: 1, hour: 16, etype: 'Value Change',
            prev: '0 %', val: '38 %', by: 'Axel' },
          { pointKey: 'fanSpeedSetpoint', weekday: 1, hour: 16, etype: 'Value Change',
            prev: '0 %', val: '38 %', by: 'Axel' },
          // And the release the next morning: the override WAS put back, which is exactly
          // what the forgotten-override exercise is missing.
          { pointKey: 'runSchedule', weekday: 2, hour: 7, etype: 'Mode Transition',
            prev: 'Manual', val: 'Auto', by: 'Axel' }
        ],
        trends: {
          // Both keys carry it. supplyFanStatus is the chip on the diagram — the one the
          // brief sends students to — and fanRunning is the same signal reached from the
          // left panel. Authoring only the internal flag left the visible point blank.
          supplyFanStatus: trend('fan-weekend-override', {
            // occHigh/occLow are the parameters build() actually reads. onValue/offValue
            // were silently ignored, so this emitted 900/450 and the fan read Running for
            // every hour of the window.
            days: 10, startHour: 8, endHour: 18, weekends: false, occHigh: 1, occLow: 0,
            overrides: [
              // Friday 18:00 onward as ONE uninterrupted run through to Monday morning:
              // that shape is what points at a single override rather than a broken
              // schedule. Named weekdays, so it lands on the weekend whenever it is read.
              { weekday: 5, startHour: 18, endHour: 24, value: 1 },
              { weekday: 6, startHour: 0, endHour: 24, value: 1 },
              { weekday: 0, startHour: 0, endHour: 24, value: 1 },
              { weekday: 1, startHour: 0, endHour: 8, value: 1 }
            ]
          }),
          fanRunning: trend('fan-weekend-override', {
            days: 10, startHour: 8, endHour: 18, weekends: false, occHigh: 1, occLow: 0,
            overrides: [
              { dayOffset: 1, startHour: 18, endHour: 23, value: 1 },
              { dayOffset: 0, startHour: 18, endHour: 23, value: 1 }
            ]
          }),
          co2Sensor: trend('co2-occupancy', {
            days: 10, startHour: 8, endHour: 18, weekends: false,
            occHigh: 850, occLow: 420,
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
        instructorNotes:
          'Compare this with the previous day. Same late running to 23:00, same override \u2014 ' +
          'but CO\u2082 is flat near the outdoor baseline, so nobody was there.\n\n' +
          'What happened: Axel set the after-hours override for a genuine event, and never ' +
          'put it back. The next evening it ran again for an empty building.\n\n' +
          'This is the most common finding in a real building and the cheapest to fix. The ' +
          'pair of exercises together is the point: identical schedule evidence, opposite ' +
          'conclusions, and CO\u2082 is what separates them. Always check whether an override ' +
          'was left behind after an event.',
        unitId: 'AHU-4-4',
        instructions:
          'There was an evening event on Monday, so the unit was held on until 23:00. ' +
          'It ran until 23:00 again on Tuesday.\n\n' +
          'Compare zone CO\u2082 on the two evenings. What does Tuesday tell you that ' +
          'Monday does not?\n\n' +
          'Explain what went wrong and put the unit back on its schedule.',
        setup: { runSchedule: true },
        weather: null,
        // Authored event history. A trend shows THAT the unit ran; this shows who put it
        // that way. Without it the exercise can only be solved by inference, and Lev's
        // framing was explicit — the student should be able to read the override off the
        // point's own Recent Events, with a name and a timestamp against it.
        events: [
          // The override itself, on the schedule point where it was made.
          { pointKey: 'runSchedule', weekday: 5, hour: 18, etype: 'Mode Transition',
            prev: 'Auto', val: 'Manual', by: 'Axel' },
          { pointKey: 'runSchedule', weekday: 5, hour: 18, etype: 'Value Change',
            prev: 'OFF', val: 'ON', by: 'Axel' },
          // And its consequence on the fan, which is the point the brief sends students to.
          // Same timestamp and the same name, so opening either one answers "who did this".
          { pointKey: 'supplyFanStatus', weekday: 5, hour: 18, etype: 'Value Change',
            prev: 'OFF', val: 'ON', by: 'Axel' },
          { pointKey: 'fanRunning', weekday: 5, hour: 18, etype: 'Value Change',
            prev: 'Stopped', val: 'Running', by: 'Axel' },
          // Fan speed too: the labelled chip is where a student looks first.
          { pointKey: 'fanSpeed', weekday: 1, hour: 18, etype: 'Value Change',
            prev: '0 %', val: '38 %', by: 'Axel' },
          { pointKey: 'fanSpeedSetpoint', weekday: 1, hour: 18, etype: 'Value Change',
            prev: '0 %', val: '38 %', by: 'Axel' }
        ],
        trends: {
          // Both keys carry it. supplyFanStatus is the chip on the diagram — the one the
          // brief sends students to — and fanRunning is the same signal reached from the
          // left panel. Authoring only the internal flag left the visible point blank.
          supplyFanStatus: trend('fan-weekend-override', {
            // occHigh/occLow are the parameters build() actually reads. onValue/offValue
            // were silently ignored, so this emitted 900/450 and the fan read Running for
            // every hour of the window.
            days: 10, startHour: 8, endHour: 18, weekends: false, occHigh: 1, occLow: 0,
            overrides: [
              // Friday 18:00 onward as ONE uninterrupted run through to Monday morning:
              // that shape is what points at a single override rather than a broken
              // schedule. Named weekdays, so it lands on the weekend whenever it is read.
              { weekday: 5, startHour: 18, endHour: 24, value: 1 },
              { weekday: 6, startHour: 0, endHour: 24, value: 1 },
              { weekday: 0, startHour: 0, endHour: 24, value: 1 },
              { weekday: 1, startHour: 0, endHour: 8, value: 1 }
            ]
          }),
          fanRunning: trend('fan-weekend-override', {
            days: 10, startHour: 8, endHour: 18, weekends: false, occHigh: 1, occLow: 0,
            overrides: [
              { dayOffset: 2, startHour: 18, endHour: 23, value: 1 },
              { dayOffset: 1, startHour: 18, endHour: 23, value: 1 }
            ]
          }),
          co2Sensor: trend('co2-occupancy', {
            days: 10, startHour: 8, endHour: 18, weekends: false,
            occHigh: 850, occLow: 420,
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
        instructorNotes:
          'Three signals, one conclusion \u2014 and no single one of them would have been enough.\n\n' +
          'Discharge air at 60\u00b0F over a weekend is the proof of mechanical cooling. Air does ' +
          'not arrive at 60\u00b0F by itself on a warm day: a chilled water valve was open and a ' +
          'fan was moving air through the coil. Read alongside a schedule that says the unit ' +
          'should be off and a CO\u2082 trace showing an empty building, that is a unit ' +
          'conditioning air for nobody.\n\n' +
          'Building a case from several readings rather than one is the habit worth taking ' +
          'from this. A fan status alone can be argued with; three agreeing signals cannot.',
        unitId: 'AHU-4-4',
        instructions:
          'Someone insists this air handler was off over the weekend.\n\n' +
          'Use three readings to test that claim: the supply fan run status, zone ' +
          'CO\u2082, and the supply air temperature. A unit that is off cannot hold ' +
          '60\u00b0F supply air \u2014 that only happens with the chilled water valve open.\n\n' +
          'Set out what each reading tells you, and what the three together prove.',
        setup: {},
        weather: null,
        // The action behind the weekend cooling. The brief teaches building a case from
        // three agreeing signals, and the third — that mechanical cooling was actually
        // called for — was only inferable from the trend. Now it is on the record.
        events: [
          { pointKey: 'runSchedule', weekday: 5, hour: 17, etype: 'Mode Transition',
            prev: 'Auto', val: 'Manual', by: 'Axel' },
          { pointKey: 'fanSpeed', weekday: 5, hour: 17, etype: 'Value Change',
            prev: '0 %', val: '38 %', by: 'Axel' },
          { pointKey: 'fanSpeedSetpoint', weekday: 5, hour: 17, etype: 'Value Change',
            prev: '0 %', val: '38 %', by: 'Axel' },
          { pointKey: 'chwValvePosition', weekday: 5, hour: 17, etype: 'Value Change',
            prev: '0 %', val: '62 %', by: 'Axel' }
        ],
        trends: {
          // Both keys carry it. supplyFanStatus is the chip on the diagram — the one the
          // brief sends students to — and fanRunning is the same signal reached from the
          // left panel. Authoring only the internal flag left the visible point blank.
          supplyFanStatus: trend('fan-weekend-override', {
            // occHigh/occLow are the parameters build() actually reads. onValue/offValue
            // were silently ignored, so this emitted 900/450 and the fan read Running for
            // every hour of the window.
            days: 10, startHour: 8, endHour: 18, weekends: false, occHigh: 1, occLow: 0,
            overrides: [
              // Friday 18:00 onward as ONE uninterrupted run through to Monday morning:
              // that shape is what points at a single override rather than a broken
              // schedule. Named weekdays, so it lands on the weekend whenever it is read.
              { weekday: 5, startHour: 18, endHour: 24, value: 1 },
              { weekday: 6, startHour: 0, endHour: 24, value: 1 },
              { weekday: 0, startHour: 0, endHour: 24, value: 1 },
              { weekday: 1, startHour: 0, endHour: 8, value: 1 }
            ]
          }),
          fanRunning: trend('fan-weekend-override', {
            days: 10, startHour: 8, endHour: 18, weekends: false, occHigh: 1, occLow: 0,
            overrides: [
              { dayOffset: 4, startHour: 0, endHour: 24, value: 1 },
              { dayOffset: 3, startHour: 0, endHour: 24, value: 1 }
            ]
          }),
          co2Sensor: trend('co2-occupancy', {
            days: 10, startHour: 8, endHour: 18, weekends: false,
            occHigh: 850, occLow: 420, overrides: []
          }),
          supplyAirTemp: trend('sat-mechanical-cooling', {
            days: 10, startHour: 8, endHour: 18, weekends: false,
            // 60 while conditioning, drifting to 74 when genuinely off.
            occHigh: 60, occLow: 74,
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
        instructorNotes:
          '62.1 applies wherever people work, not only to offices \u2014 that is why this one is ' +
          'set on the boiler-room air handler. A mechanical space with staff in it needs ' +
          'ventilation like any other.\n\n' +
          'Note what the hazard actually is here. In a boiler room the air-quality concern ' +
          'is carbon MONOXIDE from combustion, not CO\u2082 from people. Different gas, different ' +
          'sensor, different consequence \u2014 do not carry the office assumption into a plant ' +
          'room.\n\n' +
          'The fix is the minimum outdoor air position required during occupied hours. ' +
          'Temperature can look perfectly correct while a space is starved of ventilation, ' +
          'which is exactly why 62.1 sets a minimum damper position rather than trusting a ' +
          'temperature reading.',
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
        instructorNotes:
          'The cooling coil setpoint was left in Manual. That is an override, not a fault \u2014 ' +
          'the sequence was doing exactly what it had been told, which is why nothing on ' +
          'the unit looked broken.\n\n' +
          'Colour is the giveaway. A point in Auto is drawn in the normal panel colour; a ' +
          'point somebody overrode by hand is magenta. The Point Attribute Report under the ' +
          'View menu lists every override on the system, and that is the first place to ' +
          'look when a unit is behaving oddly but no alarm has tripped.\n\n' +
          'On tolerance: \u00b11.5\u00b0F \u2014 a 3\u00b0F total deadband \u2014 is normal and acceptable in a ' +
          'standard commercial building automation system. It exists on purpose: it saves ' +
          'energy by not cycling equipment constantly, it protects compressors, fans and ' +
          'valves from short-cycling, and most people cannot feel one or two degrees. Do ' +
          'not chase it. Ten degrees below setpoint, as here, is a different matter \u2014 and ' +
          'the same small swing WOULD be unacceptable in a lab, a data centre or a medical ' +
          'facility.',
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
          comparator: 'within', target: 70, tolerance: 1.5,
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
        instructorNotes:
          'CO\u2082 climbing above the ventilation indicator means the unit is not bringing in ' +
          'enough outdoor air for the number of people in the space.\n\n' +
          'Worth being precise about what that indicator is: CO\u2082 is not a compliance limit ' +
          'in 62.1. Appendix C uses it as a PROXY for ventilation rate per person \u2014 roughly ' +
          '700 ppm above outdoor air is the level at which most visitors find body-odour ' +
          'intensity acceptable. With a 400 ppm outdoor baseline that puts the indicator ' +
          'near 1,100 ppm. It is an indicator, not a legal threshold, and knowing the ' +
          'difference matters when you write it up.\n\n' +
          'Check the CO\u2082 setpoint and the minimum outdoor airflow. Demand-controlled ' +
          'ventilation should open the damper as CO\u2082 rises; if it is not, find out what is ' +
          'holding it.',
        unitId: 'AHU-4-4',
        instructions:
          'The Conference Room is at high occupancy and zone CO\u2082 has climbed past the level ' +
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
    // Same demo seat starterExercises() adds. Without it a library entry that opts into
    // published/assigned — as the sensor-failure exercise does, deliberately — reaches the
    // six lettered seats but not the shared account on the sign-on card, so the one person
    // most likely to be testing cannot see it. The refresh path's union cannot rescue this:
    // it only fires when the DEFINITION already names the seat.
    if (seats.indexOf('cta_student') < 0) seats = seats.concat(['cta_student']);
    function ex(o) {
      // Library entries default to drafts, since the instructor chooses what a class
      // sees. An entry may opt in with published/assigned — the helper used to hardcode
      // both, so those fields were silently ignored.
      var to = o.assigned || [];
      return {
        id: o.id, title: o.title, unitId: o.unit, instructions: o.brief,
        setup: o.setup, weather: o.weather || null, goal: o.goal,
        // Both of these were absent from the whitelist, so an entry could declare them
        // and have them silently dropped before reaching the store — exactly the failure
        // the note above warns about, repeated. instructorNotes is why two of Lev's three
        // reviewed exercises showed an empty notes box; trends means no library exercise
        // could ever carry an authored history either.
        instructorNotes: o.instructorNotes || '',
        trends: o.trends || null,
        sensorFaults: o.sensorFaults || null,
        assignedTo: to,
        assignment: { mode: to.length ? 'students' : 'students', groupIds: [], seatIds: to },
        published: !!o.published, createdBy: 'cta_instructor', createdAt: now
      };
    }
    return [
      // ── AHU-4-3 ───────────────────────────────────────────────────────────
      ex({
        id: 'ex-lib-43-overcool',
        title: 'Conference Room running cold',
        instructorNotes:
          'A temperature swing of \u00b11.5\u00b0F \u2014 a 3\u00b0F total deadband \u2014 around the setpoint is ' +
          'generally acceptable and normal in a standard commercial HVAC building ' +
          'automation system, depending on the space type.\n\n' +
          'Why \u00b11.5\u00b0F is acceptable:\n' +
          '  \u2022 Energy savings \u2014 a small deadband stops the system constantly turning ' +
          'equipment on and off.\n' +
          '  \u2022 Equipment protection \u2014 it prevents short-cycling, which wears out ' +
          'compressors, fans and valves far too fast.\n' +
          '  \u2022 Human comfort \u2014 most people cannot feel a change of one or two degrees.\n\n' +
          'So do not chase a swing that size; it is doing a job. The exception is a lab ' +
          'environment, a medical facility or a data centre, where the tolerance is far ' +
          'tighter. Know which kind of space you are looking at before you judge a reading.\n\n' +
          'What was actually wrong here: the cooling coil setpoint had been left in Manual ' +
          'at 46\u00b0F. That is an override, not a fault in the unit \u2014 the sequence was doing ' +
          'exactly what it had been told. Release it to Auto and supply air returns to its ' +
          'design setpoint. The Point Attribute Report under View lists every override on ' +
          'the system, which is where to look first when a unit is behaving oddly.',
        unit: 'AHU-4-3',
        brief: 'The conference room is being overcooled and staff are complaining. Supply air is well below where it should be for this unit. Find what is driving it and return supply air to its design setpoint.\n\nHint: a point left in Manual overrides the control program. The Point Attribute Report under View lists every override on the system.\n\nOn tolerance: \u00b11.5\u00b0F around setpoint \u2014 a 3\u00b0F total deadband \u2014 is normal and acceptable in a standard commercial building automation system. Do not treat a swing that size as a fault. It is deliberate: it saves energy by not cycling equipment constantly, it protects compressors, fans and valves from short-cycling, and most people cannot feel one or two degrees anyway. What you are looking at here is ten degrees below setpoint, which is a different matter entirely.',
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
        instructorNotes:
          'Check the mixed air temperature and the dampers \u2014 that is the pair that gives ' +
          'this one away.\n\n' +
          'Mixed air is a weighted blend of outdoor and return air:\n' +
          '    MAT = (%OA \u00d7 T_OA) + (%RA \u00d7 T_RA)\n' +
          'So with 20% outdoor air at 95\u00b0F and 80% return at 75\u00b0F you get ' +
          '(0.20 \u00d7 95) + (0.80 \u00d7 75) = 79\u00b0F.\n\n' +
          'Now run it with the outdoor damper closed. The outdoor fraction is zero, the ' +
          'return fraction is 100%, and the mix collapses to exactly the return air ' +
          'temperature. That is the proof: on a warm day, mixed air reading the same as ' +
          'return air means no outdoor air is entering at all, whatever position the damper ' +
          'claims. Read the two side by side rather than looking for a particular number \u2014 ' +
          'return air differs by unit and by season. Outdoor airflow will read low or zero ' +
          'for the same reason.\n\n' +
          'Supply air temperature alone would not have told you \u2014 it can look perfectly ' +
          'correct while the space is starved of ventilation. That is why 62.1 sets a ' +
          'minimum damper position for occupied hours rather than trusting temperature.',
        unit: 'AHU-4-3',
        brief: 'Temperatures look correct but the space feels stuffy. Check whether the unit is actually bringing in outdoor air, and restore the minimum position required during occupied hours.\n\nThis is a fault you will not catch by watching supply air alone.\n\nHint: check the mixed air temperature, and check the dampers.',
        setup: { oaDamperPosition: 0 },
        goal: { key: 'oaDamperPosition', label: 'OA Damper Position', unit: '%',
                comparator: 'above', target: 20, tolerance: 0,
                standard: '62.1', criterionId: 'iaq-min-damper',
                criterionLabel: 'OA damper at or above minimum position',
                citation: 'ASHRAE 62.1 \u00a75.16 \u2014 outdoor air intake, minimum position during occupancy',
                basis: 'requirement' }
      }),

      // ── AHU-23-1 ──────────────────────────────────────────────────────────
      ex({
        id: 'ex-lib-231-fan',
        title: 'Boiler room getting no air',
        instructorNotes:
          'Read the space first. This is a BOILER ROOM, not occupied office space \u2014 people ' +
          'should not be in there. So this unit is not about human comfort at all: it is a ' +
          'make-up air unit supplying combustion air to the boilers.\n\n' +
          'That changes what the fault means. With no fresh air and the boilers firing, you ' +
          'have a carbon monoxide risk, and CO is a safety hazard rather than an energy or ' +
          'comfort one. It is also the wrong gas to look for out of habit: CO\u2082 tracks ' +
          'people, CO comes from combustion. Different sensor, different consequence.\n\n' +
          'No air at all means start upstream: is the fan running? Airflow near zero with ' +
          'the schedule saying occupied points at the run status, not at a damper or a coil.\n\n' +
          'Work outward from the fan in the direction the air travels \u2014 fan, then dampers, ' +
          'then coils, then the terminal units. Chasing a coil while the fan is off wastes ' +
          'the time you have on site.\n\n' +
          'A unit that will not run during occupied hours is also a 62.1 problem, not only a ' +
          'comfort one: no fan means no outdoor air, whatever the damper position says.',
        unit: 'AHU-23-1',
        brief: 'The 2nd level boiler room has no air movement during the working day. This is a make-up air unit supplying combustion air to the boilers, not comfort air for people \u2014 so restoring airflow here is a safety matter, not a comfort one. Work out what is stopping the unit and get airflow restored.\n\nHint: check what is commanding the unit before you touch the fan itself.',
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
        instructorNotes:
          'Freeze protection is a safety, not a comfort function. The plenum minimum ' +
          'setpoint exists to keep the coil above freezing \u2014 a burst coil floods a ' +
          'mechanical room and takes the unit out for weeks.\n\n' +
          'Check the preheat valve against the plenum temperature. If plenum air is below ' +
          'the minimum and the valve is not opening, either the valve is overridden shut or ' +
          'the setpoint has been moved down. Both are things a person did.\n\n' +
          'This is the one case where you do NOT wait for a complaint. Comfort faults can ' +
          'be scheduled; a freeze risk on a cold night is acted on immediately.',
        unit: 'AHU-23-1',
        brief: 'It is a cold morning and the preheat coil is not doing its job. Find out why the plenum is running below its minimum and bring supply air back to setpoint.\n\nFreeze protection runs at all times, not only when the space calls for heat \u2014 work out what is preventing it.',
        setup: { phtValvePosition: 0, oaTemperature: 28 },
        goal: { key: 'supplyAirTemp', label: 'Supply Air Temperature', unit: '\u00b0F',
                comparator: 'within', target: 60, tolerance: 1.5,
                standard: '36', criterionId: 'soo-supply-air-setpoint',
                criterionLabel: 'Supply air at its active setpoint',
                citation: 'ASHRAE Guideline 36 \u00a75.16 \u2014 AHU supply air temperature control',
                basis: 'requirement' }
      }),

      // ── VAV-4-4-02 ────────────────────────────────────────────────────────
      // A terminal box teaches something the AHUs cannot: the zone can be wrong while
      // the air handler upstream is behaving perfectly.
      ex({
        id: 'ex-lib-vav-sensor-fail',
        title: 'Zone running hot with a good setpoint',
        instructorNotes:
          'Resolution: the zone temperature sensor is faulty and is incorrectly reading ' +
          '0\u00b0F. The sensor needs to be replaced.\n\n' +
          'Nothing was overridden and no setpoint is wrong \u2014 that is what makes this ' +
          'different from the other exercises.\n\n' +
          'Follow what the controller does with that reading. At 0\u00b0F against a 74\u00b0F ' +
          'setpoint it believes the space is freezing, so it does exactly what it should: ' +
          'reheat valve to 100%, damper to minimum position to stop dumping cold primary ' +
          'air. Both are correct responses to the information it has. The result is a space ' +
          'that overheats while every control action looks textbook.\n\n' +
          'The tell is the reading itself. 0\u00b0F is not a temperature an occupied room ' +
          'reaches \u2014 not in a heated building, not in any season. A sensor at a hard zero ' +
          'or a hard maximum is usually reporting a failure, not a measurement: an open ' +
          'circuit, a shorted input, a disconnected wire. Compare it against the other ' +
          'readings in the same zone \u2014 CO\u2082 sitting at a normal occupied level says people ' +
          'are in there, and they would not be at 0\u00b0F.\n\n' +
          'The fix in the field is to replace the sensor. Here, releasing the point to Auto ' +
          'stands in for that: the controller stops acting on the false reading, the reheat ' +
          'valve backs off and the zone recovers.\n\n' +
          'The habit worth taking away: before you chase a control problem, ask whether the ' +
          'input you are reading is credible. Equipment fails, and a confident wrong number ' +
          'is harder to spot than an obviously missing one.',
        unit: 'VAV-4-4-02',
        brief: 'The VAV 4-4 zone temperature is reading 0\u00b0F, while the room temperature ' +
          'setpoint is 74\u00b0F.\n\nBecause the zone temperature sensor is reporting 0\u00b0F, the ' +
          'controller will interpret the space as extremely cold. As a result, the reheat ' +
          'valve will open to 100%, and the VAV damper will drive to its minimum position, ' +
          'which would cause the space to overheat.\n\n' +
          'Hint: equipment can fail or provide invalid readings.',
        setup: {},
        // A failed DEVICE, not an override. Modelling it as an override meant a student
        // could find the answer in the Point Attribute Report's override list, which
        // teaches the wrong tell — Lev's lesson is to question whether the reading is
        // credible, and a real failed sensor appears nowhere on an override list.
        sensorFaults: { spaceTemp: 0 },
        // Published and assigned, unlike the rest of the library: Lev asked for this to be
        // added as an exercise, not as a draft an instructor still has to find and enable.
        published: true,
        assigned: seats.slice(),
        goal: { key: 'spaceTemp', label: 'Zone Temperature', unit: '\u00b0F',
                comparator: 'above', target: 60, tolerance: 0,
                standard: '55', criterionId: 'comfort-zone-winter',
                criterionLabel: 'Zone temperature in comfort range',
                citation: 'ASHRAE 55 \u00a75.3 \u2014 graphic comfort zone method',
                basis: 'indicator' }
      }),
      ex({
        id: 'ex-lib-vav-sensor-drift',
        title: 'Zone complaints with nothing out of range',
        instructorNotes:
          'Resolution: the zone temperature sensor is reading about 12\u00b0F low \u2014 64\u00b0F when the ' +
          'space is nearer 76\u00b0F. It is not a dead sensor; it is a wrong one. Replace it.\n\n' +
          'This is the harder sibling of the 0\u00b0F failure, and the one that actually costs ' +
          'weeks in a building. Nothing is out of range, so nothing alarms. Every control ' +
          'action is textbook: at 64\u00b0F against a 74\u00b0F setpoint the box calls for heat, so ' +
          'reheat opens and the damper backs toward minimum. The sequence is doing its job ' +
          'perfectly on a number that is not true.\n\n' +
          'A student cannot solve this by spotting an impossible value, because there is not ' +
          'one \u2014 64\u00b0F is a temperature a room genuinely reaches. They have to build a case ' +
          'from readings that disagree with each other:\n\n' +
          '\u2022 Reheat has been running for hours and the zone has not warmed. A working sensor ' +
          'in a heated space climbs; a stuck-low one does not move.\n' +
          '\u2022 CO\u2082 says the space is occupied. Occupants in a genuinely 64\u00b0F room complain of ' +
          'cold; these complaints are of heat.\n' +
          '\u2022 Discharge air is warm and airflow is at minimum, which is a box heating hard. ' +
          'If the room really were cold that combination would be raising the temperature.\n\n' +
          'The reasoning is the deliverable here, not the fix. A student who replaces the ' +
          'sensor without being able to say WHY the reading was untrustworthy has guessed. ' +
          'Ask them which two readings contradicted each other.\n\n' +
          'Field note: a drifted or partially shorted sensor does this. It is the reason ' +
          'commissioning includes checking sensors against a calibrated instrument rather ' +
          'than only checking that they report something.',
        unit: 'VAV-4-4-02',
        brief: 'Occupants in the conference room are complaining that the space is too warm. ' +
          'Nothing is in alarm, no point has been overridden by hand, and every reading on ' +
          'the box is inside its normal range.\n\nThe zone temperature reads 64\u00b0F against a ' +
          '74\u00b0F setpoint, so the controller is calling for heat \u2014 reheat is open and the ' +
          'damper has backed toward minimum.\n\nWork out why the space is getting warmer ' +
          'while the controller believes it is cold, then put it right.\n\n' +
          'Hint: no single reading here is impossible. Look for two that cannot both be ' +
          'true at once, and ask how long the box has been heating without result.',
        setup: {},
        // A plausible wrong value, not a rail. The point of this exercise is that nothing
        // looks broken — an impossible reading would hand over the answer.
        sensorFaults: { spaceTemp: 64 },
        published: true,
        assigned: seats.slice(),
        goal: { key: 'spaceTemp', label: 'Zone Temperature', unit: '\u00b0F',
                comparator: 'within', target: 74, tolerance: 3,
                standard: '55', criterionId: 'comfort-zone-winter',
                criterionLabel: 'Zone temperature in comfort range',
                citation: 'ASHRAE 55 \u00a75.3 \u2014 graphic comfort zone method',
                basis: 'indicator' }
      }),
      ex({
        id: 'ex-lib-vav-damper-v3',
        title: 'Conference room zone starved of air',
        instructorNotes:
          'The air handler upstream is behaving perfectly. The fault is at the terminal box: ' +
          'its damper was throttled well below the minimum airflow the zone needs.\n\n' +
          'That is why the zone reads warm and stuffy while supply air from the AHU is on ' +
          'setpoint \u2014 the air is being conditioned correctly and then not delivered. Zone ' +
          'CO\u2082 rises for the same reason: less air in means less ventilation for the people ' +
          'in the room.\n\n' +
          'One thing worth knowing about the real world here: a terminal damper driven fully ' +
          'CLOSED against a running fan builds duct static pressure and would trip the high ' +
          'static safety, shutting the unit down. That is why this exercise throttles the ' +
          'damper rather than closing it. A partly-starved zone is the fault you will ' +
          'actually be called about, because nothing trips \u2014 it just quietly underperforms.',
        unit: 'VAV-4-4-02',
        brief: 'The conference room is stuffy and occupants are complaining, but AHU-4-4 upstream ' +
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
  var SEED_VERSION = 28;
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
        // An untouched draft — never published, never assigned — carries no instructor
        // decision, so a definition that later opts in should be allowed to. Anything else
        // means someone chose, and that choice outranks the seed.
        var storedIsUntouchedDraft = !stored.published && !(stored.assignedTo || []).length;
        // Union the shared demo seat in rather than only carrying the stored list forward.
        // cta_student is a fixture on the sign-on card, not an instructor's choice, and it
        // was added to the seed AFTER these rows had already been written — so the
        // carry-forward kept preserving a list that never contained it, and the demo
        // student could not open any seeded scenario. A student with no assignment has no
        // attempt, and the authored history is gated on having one, which is why the fan
        // trend and CO₂ comparison read as missing rather than as empty.
        //
        // Only this one id is unioned: any other seat an instructor removed stays removed.
        var carried = (stored.assignedTo && stored.assignedTo.length)
          ? stored.assignedTo.slice() : (def.assignedTo || []).slice();
        if ((def.assignedTo || []).indexOf('cta_student') >= 0 &&
            carried.indexOf('cta_student') < 0) {
          carried.push('cta_student');
        }
        byId[def.id] = Object.assign({}, def, {
          published: storedIsUntouchedDraft ? def.published : stored.published,
          assignedTo: carried,
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
    startTimer: startTimer,
    stopTimer: stopTimer,
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
