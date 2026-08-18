/**
 * Unit tests for AHU23Controller.js
 * AHU23Controller.js attaches to `window`, so we set up globals before loading.
 *
 * This unit had no suite of its own. It covers the two corrections made after the
 * lecture-review work had already landed on the other units:
 *
 *  - Coil law: both coils are sized by capacity and modulate to REACH their
 *    setpoint. The original law used a fixed proportional gain (5%/°F heating,
 *    8%/°F cooling) that pinned the valve at 100% on any sizeable error, and the
 *    preheat discharge formula added a hardcoded +20 °F so the coil overshot its
 *    own setpoint (OA 35 / SP 55 discharged 75 °F).
 *  - Humidity: this unit received no outdoor humidity and computed no return or
 *    supply %RH at all. It now carries the same model as AHU-4-6 / 4-4 / 4-3.
 *
 * Plus the shared behaviours worth pinning here: the TMY3 push yielding to a
 * manual override, and freeze protection surviving the coil rewrite.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// These are ESM (.mjs) files, so Node does not provide __dirname — it has to be
// derived from import.meta.url. Without it every readFileSync(resolve(__dirname,
// ...)) in this suite throws ReferenceError before a single assertion runs.
const __dirname = new URL('.', import.meta.url).pathname;

const CONTROLLER_SRC = readFileSync(resolve(__dirname, 'AHU23Controller.js'), 'utf-8');

/** Fresh controller on a fresh fake window, so no test can leak into another. */
function loadController() {
  const window = {};
  new Function('window', CONTROLLER_SRC)(window);
  return window.AHU23Controller;
}

/** Fresh controller plus the window it lives on, for mocking the weather feed. */
function loadWithWindow() {
  const window = {};
  new Function('window', CONTROLLER_SRC)(window);
  return { ctrl: window.AHU23Controller, window };
}

function mockTMY3Projector(window, dryBulb, enthalpy, relHumidity) {
  window.TMY3Projector = {
    interpolateWeather: function () {
      return {
        dryBulb: dryBulb,
        enthalpy: enthalpy,
        relHumidity: (typeof relHumidity === 'number') ? relHumidity : 60
      };
    }
  };
}

/** Settle the model at a given outdoor condition and setpoint pair. */
function settle(opts) {
  const ctrl = loadController();
  if (opts.oaTemperature !== undefined) ctrl.setValue('oaTemperature', opts.oaTemperature);
  if (opts.coolingCoilSetpoint !== undefined) ctrl.setValue('coolingCoilSetpoint', opts.coolingCoilSetpoint);
  if (opts.heatingCoilSetpoint !== undefined) ctrl.setValue('heatingCoilSetpoint', opts.heatingCoilSetpoint);
  ctrl.recalculate();
  ctrl.recalculate();
  return { ctrl, state: ctrl.getState() };
}

describe('AHU23Controller — design constants', () => {
  it('seeds to the screenshot reference values', () => {
    const s = loadController().getState();
    expect(s.fanSpeedSetpoint).toBe(75);
    expect(s.cfm).toBe(12375);
    expect(s.coolingCoilSetpoint).toBe(60.0);
    expect(s.heatingCoilSetpoint).toBe(55.0);
    expect(s.plenumMinSetpoint).toBe(40.0);
    expect(s.economizerTempControlSP).toBe(58.0);
    expect(s.economizerMinPosition).toBe(20);
  });

  it('settles on its cooling setpoint at the seeded outdoor condition', () => {
    // 83.4 °F OA through a 20% damper against 72 °F return air gives a 74.3 °F
    // mix; the coil takes it to 60. Under the old 8%/°F gain this pinned at 100%.
    const s = loadController().getState();
    expect(s.mixedAirTemp).toBeCloseTo(74.3, 1);
    expect(s.supplyAirTemp).toBeCloseTo(60, 1);
    expect(s.chwValvePosition).toBe(48);
  });
});

describe('AHU23Controller — cooling coil reaches setpoint without pinning', () => {
  // One case per outdoor condition: the valve should settle at the opening that
  // reaches setpoint. The original gain pinned all four at 100%.
  const cases = [
    { oa: 60, valve: 32 },
    { oa: 70, valve: 39 },
    { oa: 80, valve: 45 },
    { oa: 90, valve: 52 },
  ];

  cases.forEach(({ oa, valve }) => {
    it(`OA ${oa} °F lands on the 60 °F setpoint at ${valve}% valve`, () => {
      const { state } = settle({ oaTemperature: oa, coolingCoilSetpoint: 60 });
      // The valve is commanded in whole percent, so the discharge lands within
      // the rounding of one percent of coil capacity (0.3 °F) rather than dead on.
      expect(Math.abs(state.supplyAirTemp - 60)).toBeLessThanOrEqual(0.15);
      expect(state.chwValvePosition).toBe(valve);
      expect(state.chwValvePosition).toBeLessThan(100);
      expect(state.chwValveStatus).toBe('ON');
    });
  });

  it('closes the valve and passes mixed air through when no cooling is called for', () => {
    const { state } = settle({ oaTemperature: 40, coolingCoilSetpoint: 80 });
    expect(state.chwValvePosition).toBe(0);
    expect(state.chwValveStatus).toBe('OFF');
    expect(state.supplyAirTemp).toBeCloseTo(state.mixedAirTemp, 1);
  });
});

describe('AHU23Controller — preheat coil does not overshoot its setpoint', () => {
  const cases = [
    { oa: 50, valve: 17 },
    { oa: 45, valve: 33 },
    { oa: 40, valve: 50 },
  ];

  cases.forEach(({ oa, valve }) => {
    it(`OA ${oa} °F reaches the 55 °F setpoint at ${valve}% valve, no overshoot`, () => {
      const { state } = settle({ oaTemperature: oa, heatingCoilSetpoint: 55, coolingCoilSetpoint: 60 });
      // Same whole-percent rounding as the cooling coil; the ceiling is what
      // matters here, since the old law overshot the setpoint by a fixed 20 °F.
      expect(Math.abs(state.preheatTemp - 55)).toBeLessThanOrEqual(0.15);
      expect(state.preheatTemp).toBeLessThanOrEqual(55.05);
      expect(state.phtValvePosition).toBe(valve);
      expect(state.phtValvePosition).toBeLessThan(100);
    });
  });

  it('a saturated coil pins at 100% and lands short of setpoint rather than claiming it', () => {
    // 45 °F of rise asked of a 30 °F coil. The old formula asserted the setpoint
    // was met regardless of capacity.
    const { state } = settle({ oaTemperature: 10, heatingCoilSetpoint: 55, coolingCoilSetpoint: 60 });
    expect(state.phtValvePosition).toBe(100);
    expect(state.preheatTemp).toBeLessThan(55);
  });

  it('closes the valve when the outdoor air is already above the heating setpoint', () => {
    const { state } = settle({ oaTemperature: 80, heatingCoilSetpoint: 55 });
    expect(state.phtValvePosition).toBe(0);
    expect(state.phtValveStatus).toBe('OFF');
    expect(state.preheatTemp).toBeCloseTo(80, 1);
  });
});

describe('AHU23Controller — freeze protection survives the coil rewrite', () => {
  it('drives the valve open to hold the plenum minimum', () => {
    // Heating setpoint deliberately below the plenum minimum, so only freeze
    // protection can be what opens the valve.
    const { state } = settle({ oaTemperature: 20, heatingCoilSetpoint: 25, coolingCoilSetpoint: 60 });
    expect(state.phtValvePosition).toBe(100);
    expect(state.preheatTemp).toBeGreaterThanOrEqual(state.plenumMinSetpoint - 0.05);
  });

  it('is still capped by coil capacity when the plenum minimum is out of reach', () => {
    const { ctrl } = settle({ oaTemperature: -10, heatingCoilSetpoint: 25, coolingCoilSetpoint: 60 });
    ctrl.setValue('plenumMinSetpoint', 60);
    ctrl.recalculate();
    const s = ctrl.getState();
    expect(s.phtValvePosition).toBe(100);
    expect(s.preheatTemp).toBeLessThan(60);
  });
});

describe('AHU23Controller — fan off', () => {
  it('closes both valves and the damper', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', false);
    ctrl.recalculate();
    const s = ctrl.getState();
    expect(s.phtValvePosition).toBe(0);
    expect(s.chwValvePosition).toBe(0);
    expect(s.oaDamperPosition).toBe(0);
  });

  it('closes the damper even against a manual hold (SOO System Off #1)', () => {
    // The override latch must yield to a safety-driven output while the
    // condition is active, and keep the Manual flag so the hold resumes.
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 40);
    ctrl.setValue('runSchedule', false);
    ctrl.recalculate();
    expect(ctrl.getState().oaDamperPosition).toBe(0);
    expect(ctrl.getModes().oaDamperPosition).toBe('Manual');
  });
});

describe('AHU23Controller — humidity model', () => {
  it('computes return and supply %RH, which this unit previously had no model for', () => {
    const s = loadController().getState();
    expect(typeof s.oaRelHumidity).toBe('number');
    expect(Number.isFinite(s.returnAirRH)).toBe(true);
    expect(Number.isFinite(s.supplyAirRH)).toBe(true);
  });

  it('humid outdoor air raises return-air %RH above dry outdoor air', () => {
    const humid = loadWithWindow();
    mockTMY3Projector(humid.window, 85, 30, 90);
    humid.ctrl.updateFromTMY3(1, 0);

    const dry = loadWithWindow();
    mockTMY3Projector(dry.window, 85, 30, 15);
    dry.ctrl.updateFromTMY3(1, 0);

    expect(humid.ctrl.getState().returnAirRH).toBeGreaterThan(dry.ctrl.getState().returnAirRH);
  });

  it('clamps return-air %RH to its 30-70% bounds', () => {
    const humid = loadWithWindow();
    mockTMY3Projector(humid.window, 85, 30, 100);
    humid.ctrl.updateFromTMY3(1, 0);
    const h = humid.ctrl.getState().returnAirRH;

    const dry = loadWithWindow();
    mockTMY3Projector(dry.window, 85, 30, 1);
    dry.ctrl.updateFromTMY3(1, 0);
    const d = dry.ctrl.getState().returnAirRH;

    expect(h).toBeLessThanOrEqual(70);
    expect(d).toBeGreaterThanOrEqual(30);
  });

  it('a wet cooling coil drives supply air toward saturation', () => {
    const { ctrl } = settle({ oaTemperature: 90, coolingCoilSetpoint: 52 });
    const s = ctrl.getState();
    expect(s.chwValvePosition).toBeGreaterThan(0);
    expect(s.supplyAirRH).toBeGreaterThan(s.returnAirRH);
  });
});

describe('AHU23Controller — TMY3 weather wiring', () => {
  it('pulls dry bulb, enthalpy and relative humidity from the weather row', () => {
    const { ctrl, window } = loadWithWindow();
    mockTMY3Projector(window, 77, 30.5, 84);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.oaTemperature).toBe(77);
    expect(s.oaEnthalpy).toBe(30.5);
    expect(s.oaRelHumidity).toBe(84);
  });

  it('a hand-set outdoor condition outranks the weather row and releases cleanly', () => {
    // The 14 Aug review asked for this: hold a winter or humid-summer condition
    // steady while the rest of the model runs.
    const { ctrl, window } = loadWithWindow();
    mockTMY3Projector(window, 77, 30, 20);
    ctrl.setValue('oaTemperature', 22);
    ctrl.setValue('oaRelHumidity', 95);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().oaTemperature).toBe(22);
    expect(ctrl.getState().oaRelHumidity).toBe(95);

    ctrl.clearMode('oaTemperature');
    ctrl.clearMode('oaRelHumidity');
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().oaTemperature).toBe(77);
    expect(ctrl.getState().oaRelHumidity).toBe(20);
  });

  it('a weather row without relHumidity cannot turn readings into NaN', () => {
    const { ctrl, window } = loadWithWindow();
    window.TMY3Projector = {
      interpolateWeather: function () { return { dryBulb: 77, enthalpy: 30 }; }
    };
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(Number.isFinite(s.oaRelHumidity)).toBe(true);
    expect(Number.isFinite(s.returnAirRH)).toBe(true);
    expect(Number.isFinite(s.supplyAirRH)).toBe(true);
  });

  it('does nothing when no projector is loaded', () => {
    const ctrl = loadController();
    const before = ctrl.getState().oaTemperature;
    expect(() => ctrl.updateFromTMY3(1, 0)).not.toThrow();
    expect(ctrl.getState().oaTemperature).toBe(before);
  });
});
