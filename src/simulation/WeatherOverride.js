/**
 * WeatherOverride.js — instructor-facing manual weather control (checklist
 * Section C, item "Manual outdoor air temperature & humidity control" — the
 * instructor's most-repeated request across every working session).
 *
 * Each unit controller (AHU46Controller, AHU44NewController, AHU43Controller,
 * AHU23Controller) already supports an operator override on oaTemperature /
 * oaEnthalpy / oaRelHumidity via its own setValue()/clearMode() — "a hand-set
 * outdoor condition outranks the TMY3 file". What was missing was a single
 * place to drive all three at once instead of setting each unit separately,
 * plus quick presets so an instructor can jump straight to "winter" or
 * "summer" without hand-computing a psychrometrically consistent enthalpy.
 *
 * Presets pull REAL recorded TMY3 readings for the 1st of a representative
 * month, rather than invented numbers — window.SimulationEngine's clock
 * itself can't move there (its row scheme is hard-scoped to a May 1 - June
 * 12, 2026 window, see Engine.js BASE_DATE/TOTAL_ROWS), but the full-year
 * TMY3 dataset backing it covers every month, and TMY3Projector.
 * getWeatherAtHour(month, day, hour) can look up any date in it directly —
 * so a "Winter" preset is Jan 1's actual recorded weather, not a guess.
 *
 * This module holds no invented weather of its own — the controllers remain
 * the source of truth for what each unit is doing with a condition, and the
 * TMY3 dataset is the source of truth for what that condition actually is —
 * this only fans a single instructor action out to every connected
 * controller that has a matching field, and tracks what's currently applied
 * so the UI (including the Outside Air strip) can show it.
 *
 * Exposed as window.WeatherOverride — no import/export (Babel standalone).
 */

(function () {
  'use strict';

  // AHU-4-3 is a separate instance of the AHU-4-4 model with its own state, so it
  // needs listing explicitly — otherwise a hand-set outdoor condition skips it.
  var CONTROLLER_NAMES = ['AHU46Controller', 'AHU44NewController', 'AHU43Controller', 'AHU23Controller'];
  var WEATHER_KEYS = ['oaTemperature', 'oaEnthalpy', 'oaRelHumidity'];
  var PRESET_HOUR = 15; // 3 PM — a representative daytime reading, not the coldest/hottest instant

  // month is 0-based (TMY3Projector convention: 0=Jan). Day is always the
  // 1st, per the instructor's own ask ("land around the month... starting
  // with the 1st that corresponds with the season").
  var PRESET_DATES = {
    winter: { label: 'Winter',       month: 0,  day: 1 }, // Jan 1
    summer: { label: 'Summer',       month: 6,  day: 1 }, // Jul 1
    rainy:  { label: 'Rainy / Damp', month: 3,  day: 1 }, // Apr 1
    dry:    { label: 'Hot & Dry',    month: 7,  day: 1 }  // Aug 1
  };

  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // The dataset runs Jul 1 2025 - Jun 30 2026 (Engine.BASE_DATE), so a preset
  // month maps onto whichever calendar year that month falls in within the
  // window: Jul-Dec are 2025, Jan-Jun are 2026. Used to give the station clock a
  // real date for the condition being held, instead of leaving it on the live
  // sim date while the weather says January.
  function fiscalDateFor(month, day, hour) {
    var base = (window.SimulationEngine && window.SimulationEngine.BASE_DATE)
      ? window.SimulationEngine.BASE_DATE
      : new Date('2025-07-01T00:00:00-04:00');
    var baseYear = base.getFullYear();
    var year = (month >= base.getMonth()) ? baseYear : baseYear + 1;
    return new Date(year, month, day, hour, 0, 0);
  }

  // active: override in effect. presetKey: which PRESET_DATES entry, or null
  // for a hand-typed custom condition. dateLabel: "Jan 1, 3:00 PM" for a
  // preset (so the UI can show which real recorded day this is), null for
  // custom. weather: the full TMY3-shaped reading currently applied
  // (dryBulb/dewPoint/relHumidity/wetBulb/enthalpy) — this is what the
  // Outside Air strip displays instead of the live sim-clock TMY row while
  // active, since the sim clock itself can't represent an out-of-window date.
  var state = { active: false, presetKey: null, dateLabel: null, date: null, weather: null };
  var subscribers = [];

  function notify() {
    subscribers.forEach(function (cb) { try { cb(getState()); } catch (e) {} });
  }

  // Shared psychrometrics (src/simulation/Psychrometrics.js) so a hand-typed
  // custom condition is computed exactly the way the controllers and the board
  // compute theirs. Presets don't need this — their enthalpy comes straight
  // from the recorded TMY3 row.
  function enthalpyFromTAndRH(t, rh) {
    var psy = (typeof window !== 'undefined') && window.Psychrometrics;
    if (!psy) return null;
    var h = psy.enthalpy(t, rh);
    return isFinite(h) ? Math.round(h * 10) / 10 : null;
  }

  function dewPointFromTAndRH(t, rh) {
    var psy = (typeof window !== 'undefined') && window.Psychrometrics;
    if (!psy || typeof psy.dewPoint !== 'function') return null;
    var d = psy.dewPoint(t, rh);
    return isFinite(d) ? Math.round(d * 10) / 10 : null;
  }

  // Wet bulb by the standard iteration: find the temperature whose saturation
  // enthalpy matches this air's enthalpy. Bisection over a physical range — no
  // closed form exists, and this converges in well under a millisecond.
  function wetBulbFromTAndRH(t, rh) {
    var psy = (typeof window !== 'undefined') && window.Psychrometrics;
    if (!psy) return null;
    var target = psy.enthalpy(t, rh);
    if (!isFinite(target)) return null;
    var lo = -60, hi = t;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      var hSat = psy.enthalpy(mid, 100);
      if (!isFinite(hSat)) return null;
      if (hSat < target) lo = mid; else hi = mid;
    }
    var wb = (lo + hi) / 2;
    // Wet bulb can never exceed dry bulb; clamp against rounding at saturation.
    return Math.round(Math.min(wb, t) * 10) / 10;
  }

  // The AHU supply air feeding each VAV box is pushed in from the simulation
  // tick loop (App.jsx). An override changes the AHU immediately, so without
  // this the VAV screens keep showing the pre-override discharge temperature
  // until the next tick — which never arrives while the sim is paused.
  // An override changes each AHU immediately, so the zones downstream have to be
  // re-pulled in the same action rather than waiting for a tick that never comes
  // while the simulation is paused. VAVController owns the zone-to-AHU mapping.
  function propagateToVAVs() {
    var vav = window.VAVController;
    if (vav && typeof vav.syncFromUpstream === 'function') vav.syncFromUpstream();
  }

  function forEachController(fn) {
    CONTROLLER_NAMES.forEach(function (name) {
      var ctrl = window[name];
      if (ctrl) fn(ctrl);
    });
  }

  function applyToControllers(oaTemperature, oaRelHumidity, oaEnthalpy) {
    forEachController(function (ctrl) {
      if (typeof ctrl.setValue !== 'function' || typeof ctrl.getState !== 'function') return;
      var s = ctrl.getState();
      if (Object.prototype.hasOwnProperty.call(s, 'oaTemperature')) ctrl.setValue('oaTemperature', oaTemperature);
      if (Object.prototype.hasOwnProperty.call(s, 'oaEnthalpy')) ctrl.setValue('oaEnthalpy', oaEnthalpy);
      if (Object.prototype.hasOwnProperty.call(s, 'oaRelHumidity')) ctrl.setValue('oaRelHumidity', oaRelHumidity);
    });
  }

  function releaseControllers() {
    forEachController(function (ctrl) {
      if (typeof ctrl.clearMode !== 'function') return;
      WEATHER_KEYS.forEach(function (k) { ctrl.clearMode(k); });
    });
  }

  function applyPreset(key) {
    var d = PRESET_DATES[key];
    if (!d) return;
    if (!window.TMY3Projector || typeof window.TMY3Projector.getWeatherAtHour !== 'function') return;
    var weather = window.TMY3Projector.getWeatherAtHour(d.month, d.day, PRESET_HOUR);
    if (!weather) return;

    var presetDate = fiscalDateFor(d.month, d.day, PRESET_HOUR);
    // Move the simulation itself, not just the reading. Without this the clock ran on
    // from today's date while the weather claimed to be January.
    if (window.SimulationEngine && typeof window.SimulationEngine.jumpToDate === 'function') {
      window.SimulationEngine.jumpToDate(presetDate);
    }

    applyToControllers(weather.dryBulb, weather.relHumidity, weather.enthalpy);
    propagateToVAVs();
    var hour12 = ((PRESET_HOUR + 11) % 12) + 1;
    var ampm = PRESET_HOUR < 12 ? 'AM' : 'PM';
    state = {
      active: true,
      presetKey: key,
      dateLabel: MONTH_NAMES[d.month] + ' ' + d.day + ', ' + hour12 + ':00 ' + ampm,
      // The date the simulation was moved to, kept for the label.
      date: presetDate,
      weather: weather
    };
    notify();
  }

  function applyCustom(oaTemperature, oaRelHumidity, dateMeta) {
    var t = Number(oaTemperature), rh = Number(oaRelHumidity);
    if (!isFinite(t) || !isFinite(rh)) return;
    rh = Math.max(1, Math.min(100, rh));
    var enthalpy = enthalpyFromTAndRH(t, rh);
    applyToControllers(t, rh, enthalpy);
    propagateToVAVs();
    state = {
      active: true,
      presetKey: null,
      // A hand-typed condition normally belongs to no particular day. When the
      // operator picks a date, that date travels with it, so the station clock
      // and the Outside Air strip both report the day being simulated.
      dateLabel: (dateMeta && dateMeta.dateLabel) || null,
      date: (dateMeta && dateMeta.date) || null,
      // Dew point and wet bulb were left null, so the Outside Air strip read "--"
      // for both whenever a custom condition was set. Both are derivable.
      weather: {
        dryBulb: t,
        relHumidity: rh,
        enthalpy: enthalpy,
        dewPoint: dewPointFromTAndRH(t, rh),
        wetBulb: wetBulbFromTAndRH(t, rh)
      }
    };
    notify();
  }

  // Look up the real recorded reading for any date in the dataset, so an operator
  // can pick a day directly rather than being limited to the four season presets.
  // Returns the TMY3 row plus a display label and a real Date for the clock.
  function lookupForDate(month, day, hour) {
    if (!window.TMY3Projector || typeof window.TMY3Projector.getWeatherAtHour !== 'function') return null;
    var h = (hour === undefined || hour === null) ? PRESET_HOUR : Number(hour);
    if (!isFinite(h)) h = PRESET_HOUR;
    h = Math.max(0, Math.min(23, Math.round(h)));
    var weather = window.TMY3Projector.getWeatherAtHour(month, day, h);
    if (!weather) return null;
    var hour12 = ((h + 11) % 12) + 1;
    var ampm = h < 12 ? 'AM' : 'PM';
    return {
      weather: weather,
      date: fiscalDateFor(month, day, h),
      dateLabel: MONTH_NAMES[month] + ' ' + day + ', ' + hour12 + ':00 ' + ampm
    };
  }

  function release() {
    releaseControllers();
    propagateToVAVs();
    state = { active: false, presetKey: null, dateLabel: null, date: null, weather: null };
    notify();
  }

  function getState() {
    return Object.assign({}, state);
  }

  function subscribe(cb) {
    subscribers.push(cb);
    return function unsubscribe() {
      subscribers = subscribers.filter(function (c) { return c !== cb; });
    };
  }

  window.WeatherOverride = {
    PRESETS: PRESET_DATES,
    PRESET_HOUR: PRESET_HOUR,
    lookupForDate: lookupForDate,
    fiscalDateFor: fiscalDateFor,
    getState: getState,
    subscribe: subscribe,
    applyPreset: applyPreset,
    applyCustom: applyCustom,
    release: release
  };
})();
