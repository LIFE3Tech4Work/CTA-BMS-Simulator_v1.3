/**
 * Unit tests for Psychrometrics.js.
 *
 * These assert against PUBLISHED psychrometric values, not against whatever the
 * implementation happens to produce. That distinction matters here: the three
 * call sites this helper replaced all carried the same bad approximation, and
 * the test that covered it mirrored the same formula — so the error was
 * invisible. Saturation pressures below are ASHRAE Fundamentals Ch.1 Table 3;
 * enthalpies are the standard psychrometric-chart values for sea level.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

function loadPsychrometrics() {
  const code = readFileSync(resolve(__dirname, 'Psychrometrics.js'), 'utf-8');
  const w = {};
  new Function('window', code)(w);
  return w.Psychrometrics;
}

const psy = loadPsychrometrics();

describe('Psychrometrics — saturation vapour pressure (ASHRAE Ch.1 Table 3)', () => {
  // psia, over liquid water above 32°F and over ice below it.
  const cases = [
    { t: 0, pws: 0.0186 },
    { t: 20, pws: 0.0505 },
    { t: 32, pws: 0.0887 },
    { t: 55, pws: 0.2141 },
    { t: 72, pws: 0.3894 },
    { t: 80, pws: 0.5073 },
    { t: 95, pws: 0.8153 }
  ];

  cases.forEach(({ t, pws }) => {
    it(`${t}°F -> ${pws} psia (within 1%)`, () => {
      const got = psy.saturationPressure(t);
      expect(Math.abs(got - pws) / pws).toBeLessThan(0.01);
    });
  });

  it('switches to the over-ice correlation below freezing', () => {
    // The two correlations agree at the triple point and diverge below it;
    // the ice branch must not simply extrapolate the water branch.
    expect(psy.saturationPressure(32)).toBeCloseTo(0.0887, 3);
    expect(psy.saturationPressure(10)).toBeLessThan(psy.saturationPressure(32));
    expect(psy.saturationPressure(10)).toBeGreaterThan(0);
  });
});

describe('Psychrometrics — humidity ratio', () => {
  it('72°F / 50%RH is about 0.00835 lb/lb', () => {
    expect(psy.humidityRatio(72, 50)).toBeCloseTo(0.00835, 4);
  });

  it('is zero at 0% RH', () => {
    expect(psy.humidityRatio(72, 0)).toBe(0);
  });

  it('rises with temperature at fixed RH', () => {
    expect(psy.humidityRatio(85, 50)).toBeGreaterThan(psy.humidityRatio(72, 50));
  });
});

describe('Psychrometrics — enthalpy against chart values', () => {
  // BTU per lb dry air. The headline case is 72°F/50%RH: the old approximation
  // returned 53.4 here, more than double the correct figure.
  const cases = [
    { t: 72, rh: 50, h: 26.39 },
    { t: 75, rh: 55, h: 29.13 },
    { t: 80, rh: 60, h: 33.63 },
    { t: 55, rh: 40, h: 17.16 },
    { t: 95, rh: 40, h: 38.39 },
    { t: 32, rh: 100, h: 11.74 },
    { t: 20, rh: 60, h: 6.17 }
  ];

  cases.forEach(({ t, rh, h }) => {
    it(`${t}°F / ${rh}%RH -> ${h} BTU/lb`, () => {
      expect(psy.enthalpy(t, rh)).toBeCloseTo(h, 1);
    });
  });

  it('is dry-bulb sensible heat alone at 0% RH', () => {
    expect(psy.enthalpy(72, 0)).toBeCloseTo(0.24 * 72, 5);
  });

  it('returns NaN for non-numeric input rather than a misleading number', () => {
    expect(Number.isNaN(psy.enthalpy(undefined, 50))).toBe(true);
    expect(Number.isNaN(psy.enthalpy(72, null))).toBe(true);
  });
});

describe('Psychrometrics — economizer changeover realism', () => {
  // The behaviour the correction exists for: the changeover compares outdoor
  // enthalpy against return-air enthalpy, and TMY3 rows carry true enthalpies.
  const RETURN_AIR = () => psy.enthalpy(72, 50); // ~26.4 BTU/lb design return

  it('hot and humid outdoor air is worse than return air — do not economize', () => {
    // 75.9°F / 91%RH is the case observed live where the old formula said OK.
    const oa = psy.enthalpy(75.9, 91);
    expect(oa).toBeGreaterThan(RETURN_AIR());
    expect(oa).toBeGreaterThan(RETURN_AIR() - 5.0); // above the enable threshold
  });

  it('cool and dry outdoor air is better than return air — economize', () => {
    // Lev's textbook free-cooling case from the 2026-08-16 walkthrough.
    const oa = psy.enthalpy(55, 40);
    expect(oa).toBeLessThan(RETURN_AIR() - 5.0);
  });

  it('mild but very humid outdoor air is NOT free cooling despite the low temperature', () => {
    // The case a dry-bulb-only changeover gets wrong, and the reason the
    // sequence checks enthalpy at all.
    const oa = psy.enthalpy(68, 95);
    expect(oa).toBeGreaterThan(RETURN_AIR() - 5.0);
  });

  it('dew point is consistent with the chart at 72°F / 50%RH', () => {
    expect(psy.dewPoint(72, 50)).toBeCloseTo(52.3, 0);
  });
});
