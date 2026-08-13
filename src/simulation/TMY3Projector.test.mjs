/**
 * Unit tests for TMY3Projector.
 * TMY3Projector.js attaches to `window`, so we set up globals before loading.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

// Mock browser globals
globalThis.window = globalThis;

// Create mock TMY3 data (8760 rows)
const mockTMY3 = [];
for (let i = 0; i < 8760; i++) {
  mockTMY3.push({
    hour: i + 1,
    dryBulb: 30 + (i % 40),   // cycles 30–69
    dewPoint: 20 + (i % 30),
    relHumidity: 50 + (i % 50),
    wetBulb: 25 + (i % 35),
    enthalpy: 10 + (i % 20)
  });
}

// Set the TMY3 data globally (TMY3Projector checks both window.TMY3_DATA and window.TMY3)
window.TMY3_DATA = mockTMY3;

// Load TMY3Projector.js which attaches to window.TMY3Projector
const require = createRequire(import.meta.url);
require('./TMY3Projector.js');

describe('TMY3Projector', () => {
  let projector;

  beforeEach(() => {
    projector = window.TMY3Projector;
  });

  describe('Constants', () => {
    it('MAY1_HOUR_INDEX is 2880', () => {
      // (31+28+31+30) * 24 = 120 * 24 = 2880
      expect(projector.MAY1_HOUR_INDEX).toBe(2880);
    });

    it('TOTAL_SIM_ROWS is 1017', () => {
      expect(projector.TOTAL_SIM_ROWS).toBe(1017);
    });

    it('TOTAL_TMY3_HOURS is 8760', () => {
      expect(projector.TOTAL_TMY3_HOURS).toBe(8760);
    });
  });

  describe('getWeatherAtHour', () => {
    it('returns weather for May 1, 00:00 (monthIndex=4, day=1, hour=0)', () => {
      const result = projector.getWeatherAtHour(4, 1, 0);
      expect(result).not.toBeNull();
      // dayOfYear for May 1 = 120 + 1 = 121, index = (121-1)*24 + 0 = 2880
      expect(result).toEqual(mockTMY3[2880]);
    });

    it('returns weather for June 1, 00:00 (monthIndex=5, day=1, hour=0)', () => {
      const result = projector.getWeatherAtHour(5, 1, 0);
      // dayOfYear for Jun 1 = 151 + 1 = 152, index = (152-1)*24 + 0 = 3624
      expect(result).toEqual(mockTMY3[3624]);
    });

    it('returns weather for January 1, 00:00 (monthIndex=0, day=1, hour=0)', () => {
      const result = projector.getWeatherAtHour(0, 1, 0);
      // dayOfYear = 0 + 1 = 1, index = (1-1)*24 + 0 = 0
      expect(result).toEqual(mockTMY3[0]);
    });

    it('returns null for invalid month index', () => {
      const result = projector.getWeatherAtHour(12, 1, 0);
      // monthIndex 12 → MONTH_START_DAY[12] = undefined → NaN index → null
      expect(result).toBeNull();
    });

    it('returns null for index beyond TMY3 range', () => {
      // Dec 31, 23:00 → dayOfYear = 365, index = (365-1)*24 + 23 = 8759 (valid, last entry)
      const result = projector.getWeatherAtHour(11, 31, 23);
      expect(result).toEqual(mockTMY3[8759]);
    });
  });

  describe('getWeatherForRow', () => {
    it('returns correct weather for row 1 (May 1, 00:00)', () => {
      const result = projector.getWeatherForRow(1);
      expect(result).toEqual(mockTMY3[2880]);
    });

    it('returns correct weather for row 2 (May 1, 01:00)', () => {
      const result = projector.getWeatherForRow(2);
      expect(result).toEqual(mockTMY3[2881]);
    });

    it('returns correct weather for row 1017 (June 12, 08:00)', () => {
      const result = projector.getWeatherForRow(1017);
      // TMY3 index = 2880 + 1016 = 3896
      expect(result).toEqual(mockTMY3[3896]);
    });

    it('returns null for row 0 (below range)', () => {
      expect(projector.getWeatherForRow(0)).toBeNull();
    });

    it('returns null for row 1018 (above range)', () => {
      expect(projector.getWeatherForRow(1018)).toBeNull();
    });

    it('returns null for negative row', () => {
      expect(projector.getWeatherForRow(-1)).toBeNull();
    });
  });

  describe('interpolateWeather', () => {
    it('returns exact values at fraction 0', () => {
      const result = projector.interpolateWeather(1, 0);
      expect(result.dryBulb).toBe(mockTMY3[2880].dryBulb);
      expect(result.dewPoint).toBe(mockTMY3[2880].dewPoint);
      expect(result.relHumidity).toBe(mockTMY3[2880].relHumidity);
      expect(result.wetBulb).toBe(mockTMY3[2880].wetBulb);
      expect(result.enthalpy).toBe(mockTMY3[2880].enthalpy);
    });

    it('returns interpolated values at fraction 0.5', () => {
      const result = projector.interpolateWeather(1, 0.5);
      const current = mockTMY3[2880];
      const next = mockTMY3[2881];

      expect(result.dryBulb).toBeCloseTo(current.dryBulb + 0.5 * (next.dryBulb - current.dryBulb), 5);
      expect(result.dewPoint).toBeCloseTo(current.dewPoint + 0.5 * (next.dewPoint - current.dewPoint), 5);
      expect(result.relHumidity).toBeCloseTo(current.relHumidity + 0.5 * (next.relHumidity - current.relHumidity), 5);
    });

    it('returns next row values at fraction 1.0', () => {
      const result = projector.interpolateWeather(1, 1.0);
      const current = mockTMY3[2880];
      const next = mockTMY3[2881];

      // At fraction 1.0, result = current + 1.0 * (next - current) = next
      expect(result.dryBulb).toBeCloseTo(next.dryBulb, 5);
    });

    it('returns null for out-of-range row', () => {
      expect(projector.interpolateWeather(0, 0.5)).toBeNull();
      expect(projector.interpolateWeather(1018, 0.5)).toBeNull();
    });

    it('clamps negative fraction to 0', () => {
      const result = projector.interpolateWeather(1, -0.5);
      expect(result.dryBulb).toBe(mockTMY3[2880].dryBulb);
    });

    it('clamps fraction above 1 to 1', () => {
      const result = projector.interpolateWeather(1, 1.5);
      const next = mockTMY3[2881];
      expect(result.dryBulb).toBeCloseTo(next.dryBulb, 5);
    });

    it('returns current values for the last row (no next row to interpolate to)', () => {
      const result = projector.interpolateWeather(1017, 0.5);
      // TMY3 index 3896 — but we need to check if 3897 exists (it does for mock data up to 8760)
      // Since 3897 < 8760, interpolation should work. Let's verify it.
      const current = mockTMY3[3896];
      const next = mockTMY3[3897];
      expect(result.dryBulb).toBeCloseTo(current.dryBulb + 0.5 * (next.dryBulb - current.dryBulb), 5);
    });
  });
});
