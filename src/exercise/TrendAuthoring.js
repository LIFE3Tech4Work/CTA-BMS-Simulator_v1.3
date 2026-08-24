/**
 * TrendAuthoring.js — instructor-authored history for exercises
 *
 * Lev's scenario: a unit was manually overridden to run through a weekend, and the
 * student is meant to notice by comparing the fan's run history against zone CO₂ —
 * high CO₂ on the Monday evening the space really was occupied, near-baseline CO₂
 * across the weekend the unit ran anyway. That reasoning is impossible while every
 * trend is generated from the live value, because the past always agrees with now.
 *
 * So a saved exercise may carry authored history for specific points. When the exercise
 * is running, the History tab reads that instead of the seeded series.
 *
 * SHAPE: patterns rather than 240 hand-typed numbers. An instructor describes an
 * occupied window and what the point reads inside and outside it — which is how they
 * think about it anyway — and the hours are generated. A points-and-clicks editor for
 * ten days of hourly data would be unusable.
 *
 * Hour 0 is the OLDEST sample and the last is "now", matching what the History tab's
 * `series.slice(-histPeriod)` expects.
 *
 * No import/export — exposes window.TrendAuthoring.
 */
(function () {
  'use strict';

  var HOURS_PER_DAY = 24;

  /**
   * Build an hourly series from a pattern.
   *
   * pattern = {
   *   days:        how many days back to generate (default 10)
   *   occHigh:     value during occupied hours
   *   occLow:      value outside them
   *   startHour:   occupied window start (default 8)
   *   endHour:     occupied window end (default 18)
   *   weekends:    true if the window also applies at weekends
   *   overrides:   [{ dayOffset, startHour, endHour, value }] — the anomaly the
   *                student is meant to find, e.g. the unit running all weekend
   *   jitter:      random variation, so a flat line does not look synthetic
   *   endsAt:      Date the series ends at (defaults to now)
   * }
   */
  function build(pattern) {
    var p = pattern || {};
    var days = p.days || 10;
    var total = days * HOURS_PER_DAY;
    var hi = num(p.occHigh, 900);
    var lo = num(p.occLow, 450);
    var startH = num(p.startHour, 8);
    var endH = num(p.endHour, 18);
    var jitter = num(p.jitter, 0);
    var endsAt = p.endsAt ? new Date(p.endsAt) : new Date();

    var out = [];
    for (var i = 0; i < total; i++) {
      // hoursBack counts from the end, so index 0 is the oldest sample.
      var hoursBack = total - 1 - i;
      var d = new Date(endsAt.getTime() - hoursBack * 3600000);
      var hour = d.getHours();
      var dow = d.getDay();
      var isWeekend = (dow === 0 || dow === 6);

      var occupied = (hour >= startH && hour < endH) && (p.weekends || !isWeekend);
      var v = occupied ? hi : lo;

      // Overrides win — this is the fault the exercise is about.
      var ov = matchOverride(p.overrides, d, endsAt, days);
      if (ov) v = num(ov.value, v);

      if (jitter) v += (Math.random() - 0.5) * 2 * jitter;
      out.push(Math.round(v * 10) / 10);
    }
    return out;
  }

  /**
   * Match an override window against a sample's timestamp.
   *
   * Two ways to name the day:
   *   dayOffset — a fixed count back from the end of the series (0 = today)
   *   weekday   — 0=Sun..6=Sat, resolved to the MOST RECENT occurrence of that day
   *
   * weekday exists because a story about a weekend override has to land on the weekend.
   * With a fixed offset it does not: dayOffset 5 authored on a Wednesday lands on Friday,
   * but read back on a Monday it lands on Wednesday — so the fan trace showed a "weekend"
   * run midweek and the brief no longer described the data. An exercise is read weeks
   * after it is written, so the day has to be named, not counted.
   */
  function matchOverride(list, d, endsAt, days) {
    if (!list || !list.length) return null;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.weekday !== undefined && o.weekday !== null) {
        if (d.getDay() !== num(o.weekday, -1)) continue;
        // Most recent occurrence only — without this the window would also match the same
        // weekday a week earlier, painting the fault twice in a 10-day series.
        var back = Math.floor((startOfDay(endsAt) - startOfDay(d)) / 86400000);
        if (back >= 7) continue;
      } else {
        var dayBack = Math.floor((startOfDay(endsAt) - startOfDay(d)) / 86400000);
        if (dayBack !== num(o.dayOffset, -1)) continue;
      }
      var h = d.getHours();
      var s = num(o.startHour, 0), e = num(o.endHour, 24);
      if (h >= s && h < e) return o;
    }
    return null;
  }

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }

  function num(v, dflt) {
    var n = Number(v);
    return isFinite(n) ? n : dflt;
  }

  /**
   * Ready-made patterns for the scenarios that come up. Named for the STORY rather
   * than the shape, because that is what an instructor is choosing between.
   */
  var PRESETS = {
    'weekend-override-co2': {
      label: 'Weekend override — CO\u2082 shows the space was empty',
      hint: 'Zone CO\u2082 sits at baseline through the weekend, so the space was unoccupied even though the unit ran. Pair with the fan-status trend below.',
      appliesTo: ['co2Sensor'],
      pattern: { days: 10, occHigh: 880, occLow: 430, jitter: 25,
                 overrides: [{ dayOffset: 3, startHour: 18, endHour: 23, value: 910 }] }
    },
    'weekend-override-fan': {
      label: 'Weekend override — fan ran when it should not have',
      hint: 'The fan runs right through the weekend and late into Monday evening, against a schedule of 08:00\u201318:00 weekdays.',
      appliesTo: ['fanRunning', 'supplyFanStatus', 'returnFanStatus'],
      pattern: { days: 10, occHigh: 1, occLow: 0,
                 overrides: [
                   { dayOffset: 3, startHour: 18, endHour: 24, value: 1 },
                   { dayOffset: 2, startHour: 0, endHour: 24, value: 1 },
                   { dayOffset: 1, startHour: 0, endHour: 24, value: 1 }
                 ] }
    },
    'late-evening-event': {
      label: 'Evening event, schedule left extended',
      hint: 'An event on one evening was covered by extending the schedule, and it was never put back \u2014 the unit ran late the following day too.',
      appliesTo: ['co2Sensor', 'fanRunning', 'cfm'],
      pattern: { days: 10, occHigh: 850, occLow: 430, jitter: 20,
                 overrides: [
                   { dayOffset: 4, startHour: 18, endHour: 23, value: 940 },
                   { dayOffset: 3, startHour: 18, endHour: 23, value: 440 }
                 ] }
    },
    'steady-occupied': {
      label: 'Normal operation (no anomaly)',
      hint: 'A clean weekday pattern, for a point the student should find nothing wrong with.',
      appliesTo: null,
      pattern: { days: 10, occHigh: 780, occLow: 430, jitter: 18 }
    }
  };

  /** Presets sensible for a given point, plus the always-applicable ones. */
  function presetsFor(pointKey) {
    return Object.keys(PRESETS).filter(function (k) {
      var a = PRESETS[k].appliesTo;
      return !a || a.indexOf(pointKey) >= 0;
    }).map(function (k) {
      return Object.assign({ id: k }, PRESETS[k]);
    });
  }

  /** The authored series for a point in the running exercise, or null. */
  function seriesFor(pointKey) {
    // Authoring preview, and ONLY while authoring is armed. Without that check a draft
    // left on an instructor's machine would keep overriding the chart afterwards — and
    // on a shared classroom machine a student would inherit it.
    var armed = !!(window.ExerciseAuthoring && window.ExerciseAuthoring.isArmed &&
                   window.ExerciseAuthoring.isArmed());
    if (armed) {
      var pv = previewFor(pointKey);
      if (pv) return pv;
    }
    var ES = window.ExerciseStore;
    if (!ES || !ES.activeExercise) return null;
    var ex = ES.activeExercise();
    if (!ex || !ex.trends || !ex.trends[pointKey]) return null;
    // An authored history belongs to the exercise being WORKED, not to the app. Outside
    // a running attempt the History tab must show the live series, or a student browsing
    // the station would be reading a fabricated past as though it were real data.
    if (!armed && ES.attemptFor && window.CTAAuthOperator) {
      var att = ES.attemptFor(ex.id, window.CTAAuthOperator);
      if (!att || att.passed) return null;
    }
    var t = ex.trends[pointKey];
    // Cached on the exercise so the chart does not regenerate — and re-randomise the
    // jitter — on every re-render.
    if (!t.__series) t.__series = build(t.pattern || (PRESETS[t.preset] || {}).pattern);
    return t.__series;
  }

  /**
   * Authored events for a point in the running exercise, or null.
   *
   * Same gating as seriesFor: an authored history belongs to the exercise being WORKED,
   * so a student browsing the station outside an attempt never reads a fabricated past
   * as real data.
   *
   * dayOffset/hour are resolved to real timestamps at read time rather than stored as
   * dates, so an exercise authored in August still reads correctly in November — the
   * story is "five days ago", not "the 14th".
   */
  function eventsFor(pointKey) {
    var ES = window.ExerciseStore;
    if (!ES || !ES.activeExercise) return null;
    var ex = ES.activeExercise();
    if (!ex || !ex.events || !ex.events.length) return null;

    var armed = !!(window.ExerciseAuthoring && window.ExerciseAuthoring.isArmed &&
                   window.ExerciseAuthoring.isArmed());
    if (!armed && ES.attemptFor && window.CTAAuthOperator) {
      var att = ES.attemptFor(ex.id, window.CTAAuthOperator);
      if (!att || att.passed) return null;
    }

    var now = new Date();
    return ex.events
      .filter(function (e) { return e.pointKey === pointKey; })
      .map(function (e) {
        var d;
        if (e.weekday !== undefined && e.weekday !== null) {
          // Same reasoning as override windows: a Friday override has to read "Fri". A
          // fixed offset drifts with the day the exercise is opened, so the event stamp
          // stopped matching the brief that describes it.
          d = new Date(now.getTime());
          var delta = (d.getDay() - e.weekday + 7) % 7;
          if (delta === 0) delta = 7 * 0;   // today counts as the most recent occurrence
          d = new Date(d.getTime() - delta * 86400000);
        } else {
          d = new Date(now.getTime() - (e.dayOffset || 0) * 86400000);
        }
        d.setHours(e.hour || 0, e.minute || 0, 0, 0);
        return {
          // Day name included: Lev asked for the weekday on the history axis so a student
          // does not have to open a calendar to find the weekend, and the same reasoning
          // applies to an event list where "Friday 18:00" is the whole point.
          t: d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' +
             d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
             d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          key: pointKey,
          etype: e.etype || 'Value Change',
          prev: e.prev,
          val: e.val,
          by: e.by
        };
      });
  }

  // Trends chosen in the point dialog before the exercise exists. The dialog closes
  // before Save is pressed, so the choice cannot live in component state.
  var draft = {};
  function setDraft(key, presetId) {
    if (!presetId) { delete draft[key]; return draft; }
    // Seed an editable copy of the preset's pattern. The preset is a starting point,
    // not a fixed shape — the instructor decides which days and hours the anomaly
    // covers, because that IS the scenario.
    var base = (PRESETS[presetId] || {}).pattern || {};
    draft[key] = { preset: presetId, pattern: JSON.parse(JSON.stringify(base)) };
    return draft;
  }

  /** Edit one field of a draft pattern, discarding the cached series so it redraws. */
  function editDraft(key, field, value) {
    var d = draft[key];
    if (!d) return null;
    d.pattern = d.pattern || {};
    d.pattern[field] = value;
    delete d.__series;
    return d.pattern;
  }

  /** Edit one field of one override window. */
  function editOverride(key, idx, field, value) {
    var d = draft[key];
    if (!d || !d.pattern || !d.pattern.overrides || !d.pattern.overrides[idx]) return null;
    d.pattern.overrides[idx][field] = value;
    delete d.__series;
    return d.pattern;
  }

  function addOverride(key) {
    var d = draft[key];
    if (!d) return null;
    d.pattern = d.pattern || {};
    d.pattern.overrides = (d.pattern.overrides || []).concat([
      { dayOffset: 1, startHour: 0, endHour: 24, value: num(d.pattern.occHigh, 1) }
    ]);
    delete d.__series;
    return d.pattern;
  }

  function removeOverride(key, idx) {
    var d = draft[key];
    if (!d || !d.pattern || !d.pattern.overrides) return null;
    d.pattern.overrides.splice(idx, 1);
    delete d.__series;
    return d.pattern;
  }

  function patternFor(key) { return draft[key] ? (draft[key].pattern || null) : null; }

  /** "Sat 16 Aug" for a day offset, so the instructor edits real days not integers. */
  function dayLabel(offset) {
    var d = new Date(Date.now() - num(offset, 0) * 86400000);
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function draftFor(key) { return draft[key] ? draft[key].preset : ''; }
  function draftAll() {
    var keys = Object.keys(draft);
    if (!keys.length) return null;
    var out = {};
    keys.forEach(function (k) {
      // Strip the cached series: it is derived from the pattern, so persisting it only
      // bloats the record and risks the two disagreeing.
      out[k] = { preset: draft[k].preset, pattern: draft[k].pattern || null };
    });
    return JSON.parse(JSON.stringify(out));
  }
  function clearDraft() { draft = {}; }

  /**
   * Series to display. While authoring, the instructor sees the trend they just picked
   * — otherwise they would be choosing blind and could not tell whether the anomaly
   * lands where they intended. While running, the saved exercise wins.
   */
  function previewFor(key) {
    if (draft[key]) {
      var d = draft[key];
      // The edited pattern, not the preset's, so the chart follows every change.
      if (!d.__series) d.__series = build(d.pattern || (PRESETS[d.preset] || {}).pattern);
      return d.__series;
    }
    return null;
  }

  window.TrendAuthoring = {
    eventsFor: eventsFor,
    setDraft: setDraft,
    editDraft: editDraft,
    editOverride: editOverride,
    addOverride: addOverride,
    removeOverride: removeOverride,
    patternFor: patternFor,
    dayLabel: dayLabel,
    draftFor: draftFor,
    draftAll: draftAll,
    clearDraft: clearDraft,
    previewFor: previewFor,
    build: build,
    PRESETS: PRESETS,
    presetsFor: presetsFor,
    seriesFor: seriesFor
  };
})();
