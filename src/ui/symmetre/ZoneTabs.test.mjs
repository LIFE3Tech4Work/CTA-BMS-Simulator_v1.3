/**
 * Unit tests for ZoneTabs.jsx
 *
 * Tests the zone tab navigation logic and OutsideAirStrip data formatting.
 * ZoneTabs.jsx attaches to `window`, so we set up globals before loading.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

// ─── Mock browser globals ─────────────────────────────────────────────────────

globalThis.window = globalThis;

// Mock location.hash
let mockHash = '#/symmetre/AHU-4-4';
Object.defineProperty(window, 'location', {
  value: { get hash() { return mockHash; }, set hash(v) { mockHash = v; } },
  writable: true
});

// Mock addEventListener / removeEventListener
window.addEventListener = vi.fn();
window.removeEventListener = vi.fn();

// Mock React hooks minimally for IIFE execution (the IIFE just defines functions)
const mockState = {};
window.React = {
  useState: (init) => [typeof init === 'function' ? init() : init, vi.fn()],
  useEffect: vi.fn(),
  useContext: vi.fn(() => ({ currentRow: 1, interpolationFraction: 0 })),
  useCallback: vi.fn((fn) => fn),
  createElement: vi.fn((...args) => args)
};

// Mock TMY3 data (create enough rows to cover May 1 – June 12)
const mockTMY3 = [];
for (let i = 0; i < 8760; i++) {
  mockTMY3.push({
    hour: i + 1,
    dryBulb: 55.0 + (i % 30) * 0.5,
    dewPoint: 45.0 + (i % 20) * 0.3,
    relHumidity: 60.0 + (i % 40) * 0.2,
    wetBulb: 50.0 + (i % 25) * 0.4,
    enthalpy: 20.0 + (i % 15) * 0.6
  });
}
window.TMY3_DATA = mockTMY3;

// Load TMY3Projector (sets up window.TMY3Projector)
const require = createRequire(import.meta.url);
require('../../simulation/TMY3Projector.js');

// Load ZoneTabs (sets up window.ZoneTabs and window.OutsideAirStrip)
require('./ZoneTabs.jsx');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ZoneTabs', () => {
  it('exposes ZoneTabs as a window global', () => {
    expect(window.ZoneTabs).toBeDefined();
    expect(typeof window.ZoneTabs).toBe('function');
  });

  it('exposes OutsideAirStrip as a window global', () => {
    expect(window.OutsideAirStrip).toBeDefined();
    expect(typeof window.OutsideAirStrip).toBe('function');
  });
});

describe('TMY3Projector.interpolateWeather integration', () => {
  it('returns weather data for simulation row 1 with fraction 0', () => {
    const data = window.TMY3Projector.interpolateWeather(1, 0);
    expect(data).not.toBeNull();
    expect(data).toHaveProperty('dryBulb');
    expect(data).toHaveProperty('dewPoint');
    expect(data).toHaveProperty('relHumidity');
    expect(data).toHaveProperty('wetBulb');
    expect(data).toHaveProperty('enthalpy');
  });

  it('interpolates linearly between adjacent rows with fraction 0.5', () => {
    const row = 100;
    const data0 = window.TMY3Projector.interpolateWeather(row, 0);
    const data1 = window.TMY3Projector.interpolateWeather(row + 1, 0);
    const dataHalf = window.TMY3Projector.interpolateWeather(row, 0.5);

    expect(dataHalf).not.toBeNull();
    // Verify interpolation: midpoint = (data0 + data1) / 2
    const expectedDryBulb = (data0.dryBulb + data1.dryBulb) / 2;
    expect(dataHalf.dryBulb).toBeCloseTo(expectedDryBulb, 5);
  });

  it('formats values to 1 decimal place', () => {
    const data = window.TMY3Projector.interpolateWeather(1, 0);
    // Verify values are numeric and can be formatted
    expect(Number(data.dryBulb).toFixed(1)).toMatch(/^\d+\.\d$/);
    expect(Number(data.relHumidity).toFixed(1)).toMatch(/^\d+\.\d$/);
    expect(Number(data.wetBulb).toFixed(1)).toMatch(/^\d+\.\d$/);
    expect(Number(data.dewPoint).toFixed(1)).toMatch(/^\d+\.\d$/);
    expect(Number(data.enthalpy).toFixed(1)).toMatch(/^\d+\.\d$/);
  });

  it('returns null for out-of-range rows', () => {
    expect(window.TMY3Projector.interpolateWeather(0, 0)).toBeNull();
    expect(window.TMY3Projector.interpolateWeather(1018, 0)).toBeNull();
    expect(window.TMY3Projector.interpolateWeather(-1, 0)).toBeNull();
  });

  it('clamps fraction to [0, 1]', () => {
    // Negative fraction should be treated as 0
    const dataNeg = window.TMY3Projector.interpolateWeather(1, -0.5);
    const data0 = window.TMY3Projector.interpolateWeather(1, 0);
    expect(dataNeg.dryBulb).toBe(data0.dryBulb);

    // Fraction > 1 should be treated as 1
    const dataOver = window.TMY3Projector.interpolateWeather(1, 1.5);
    const data1 = window.TMY3Projector.interpolateWeather(1, 1);
    expect(dataOver.dryBulb).toBe(data1.dryBulb);
  });
});
