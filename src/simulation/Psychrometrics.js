/**
 * Psychrometrics.js — moist-air property calculations, IP units.
 *
 * Single source of truth for the temperature/humidity → enthalpy relation.
 * Three places used to carry their own copy of the same approximation
 * (AHU46Controller's liveReturnAirEnthalpy, WeatherOverride's
 * enthalpyFromTAndRH, boardPoints' returnEnthalpy), and that approximation was
 * wrong: its saturation-pressure term returned about 3.8x the true value, so
 * enthalpies came out roughly double. 72°F/50%RH computed as 53.4 BTU/lb
 * against a true 26.4. Because TMY3 rows carry real enthalpies, comparing them
 * against an inflated return-air figure biased the economizer changeover
 * toward "favourable" — it read OK to economize at 75.9°F/91%RH, which is the
 * textbook case for staying on minimum outdoor air.
 *
 * Formulas are ASHRAE Fundamentals, Chapter 1:
 *   Eq. 5/6  saturation pressure over ice (< 32°F) and over liquid water
 *   Eq. 20   humidity ratio from partial pressures
 *   Eq. 30   enthalpy of moist air
 *
 * Attached to window.Psychrometrics (no import/export — Babel standalone).
 * Must load before any controller that uses it.
 */

(function () {
  'use strict';

  /** Standard sea-level atmospheric pressure, psia. */
  var STANDARD_PRESSURE = 14.696;

  /** ASHRAE Eq. 5 — over ice, valid -148 to 32°F. */
  var ICE = [-1.0214165e4, -4.8932428, -5.3765794e-3, 1.9202377e-7,
             3.5575832e-10, -9.0344688e-14, 4.1635019];

  /** ASHRAE Eq. 6 — over liquid water, valid 32 to 392°F. */
  var WATER = [-1.0440397e4, -1.1294650e1, -2.7022355e-2, 1.2890360e-5,
               -2.4780681e-9, 6.5459673];

  /**
   * Saturation vapour pressure of water, psia, for a dry-bulb temperature in °F.
   * Uses absolute temperature in degrees Rankine, as the ASHRAE correlations do.
   */
  function saturationPressure(tempF) {
    var T = tempF + 459.67; // °R
    if (!isFinite(T) || T <= 0) return NaN;
    var lnP;
    if (tempF < 32) {
      lnP = ICE[0] / T + ICE[1] + ICE[2] * T + ICE[3] * T * T +
            ICE[4] * T * T * T + ICE[5] * T * T * T * T + ICE[6] * Math.log(T);
    } else {
      lnP = WATER[0] / T + WATER[1] + WATER[2] * T + WATER[3] * T * T +
            WATER[4] * T * T * T + WATER[5] * Math.log(T);
    }
    return Math.exp(lnP);
  }

  /**
   * Humidity ratio, lb moisture per lb dry air, from dry bulb (°F) and
   * relative humidity (%). Optional pressure in psia for non-sea-level use.
   */
  function humidityRatio(tempF, rhPercent, pressurePsia) {
    var p = (typeof pressurePsia === 'number' && pressurePsia > 0)
      ? pressurePsia : STANDARD_PRESSURE;
    var pws = saturationPressure(tempF);
    if (!isFinite(pws)) return NaN;
    var rh = Math.max(0, Math.min(100, rhPercent));
    var pw = (rh / 100) * pws;
    // Guard the degenerate case where vapour pressure approaches total pressure.
    return 0.621945 * pw / Math.max(p - pw, 1e-6);
  }

  /**
   * Specific enthalpy of moist air, BTU per lb of dry air, from dry bulb (°F)
   * and relative humidity (%). ASHRAE Eq. 30: h = 0.240 t + W (1061 + 0.444 t).
   *
   * Reference points: 72°F/50%RH -> 26.4, 75°F/55%RH -> 29.1, 55°F/40%RH -> 18.5.
   */
  function enthalpy(tempF, rhPercent, pressurePsia) {
    if (typeof tempF !== 'number' || typeof rhPercent !== 'number') return NaN;
    if (!isFinite(tempF) || !isFinite(rhPercent)) return NaN;
    var W = humidityRatio(tempF, rhPercent, pressurePsia);
    if (!isFinite(W)) return NaN;
    return 0.240 * tempF + W * (1061 + 0.444 * tempF);
  }

  /** Dew-point temperature, °F, from dry bulb (°F) and relative humidity (%). */
  function dewPoint(tempF, rhPercent) {
    var rh = Math.max(0.01, Math.min(100, rhPercent));
    var pw = (rh / 100) * saturationPressure(tempF);
    if (!isFinite(pw) || pw <= 0) return NaN;
    // ASHRAE Eq. 37/38 — fit in terms of ln(pw), pw in psia.
    var a = Math.log(pw);
    var td = 100.45 + 33.193 * a + 2.319 * a * a + 0.17074 * a * a * a +
             1.2063 * Math.pow(pw, 0.1984);
    if (td < 32) td = 90.12 + 26.142 * a + 0.8927 * a * a;
    return td;
  }

  window.Psychrometrics = {
    STANDARD_PRESSURE: STANDARD_PRESSURE,
    saturationPressure: saturationPressure,
    humidityRatio: humidityRatio,
    enthalpy: enthalpy,
    dewPoint: dewPoint
  };
})();
