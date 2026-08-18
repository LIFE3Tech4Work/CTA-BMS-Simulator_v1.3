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

  // active: override in effect. presetKey: which PRESET_DATES entry, or null
  // for a hand-typed custom condition. dateLabel: "Jan 1, 3:00 PM" for a
  // preset (so the UI can show which real recorded day this is), null for
  // custom. weather: the full TMY3-shaped reading currently applied
  // (dryBulb/dewPoint/relHumidity/wetBulb/enthalpy) — this is what the
  // Outside Air strip displays instead of the live sim-clock TMY row while
  // active, since the sim clock itself can't represent an out-of-window date.
  var state = { active: false, presetKey: null, dateLabel: null, weather: null };
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

    applyToControllers(weather.dryBulb, weather.relHumidity, weather.enthalpy);
    var hour12 = ((PRESET_HOUR + 11) % 12) + 1;
    var ampm = PRESET_HOUR < 12 ? 'AM' : 'PM';
    state = {
      active: true,
      presetKey: key,
      dateLabel: MONTH_NAMES[d.month] + ' ' + d.day + ', ' + hour12 + ':00 ' + ampm,
      weather: weather
    };
    notify();
  }

  function applyCustom(oaTemperature, oaRelHumidity) {
    var t = Number(oaTemperature), rh = Number(oaRelHumidity);
    if (!isFinite(t) || !isFinite(rh)) return;
    rh = Math.max(1, Math.min(100, rh));
    var enthalpy = enthalpyFromTAndRH(t, rh);
    applyToControllers(t, rh, enthalpy);
    state = {
      active: true,
      presetKey: null,
      dateLabel: null,
      weather: { dryBulb: t, relHumidity: rh, enthalpy: enthalpy, dewPoint: null, wetBulb: null }
    };
    notify();
  }

  function release() {
    releaseControllers();
    state = { active: false, presetKey: null, dateLabel: null, weather: null };
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
    getState: getState,
    subscribe: subscribe,
    applyPreset: applyPreset,
    applyCustom: applyCustom,
    release: release
  };
})();
