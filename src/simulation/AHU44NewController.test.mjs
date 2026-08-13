/**
 * Unit tests for AHU44NewController.js
 * AHU44NewController.js attaches to `window`, so we set up globals before loading.
 *
 * Covers:
 *  - Corrected design constants match the Honeywell screenshot reference
 *    (Hotel_AHU4_4Edit.png — Service: Pre-Function/Ballroom Level 2)
 *  - TMY3 weather wiring (updateFromTMY3) drives oaTemperature/oaEnthalpy
 *  - Outdoor air temperature has NO manual override: setValue('oaTemperature', ...)
 *    is rejected outright, since OAT is real weather, not an operator setpoint
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadController() {
  const code = readFileSync(
    resolve(__dirname, 'AHU44NewController.js'),
    'utf-8'
  );
  const window = {};
  const fn = new Function('window', code);
  fn(window);
  return window.AHU44NewController;
}

function mockTMY3Projector(window, dryBulb, enthalpy) {
  window.TMY3Projector = {
    interpolateWeather: function (row, fraction) {
      return { dryBulb: dryBulb, enthalpy: enthalpy };
    }
  };
}

describe('AHU44NewController — design constants match Honeywell reference', () => {
  it('produces 8550 CFM at 75% fan speed (screenshot reference value)', () => {
    const ctrl = loadController();
    const state = ctrl.getState();
    expect(state.fanSpeedSetpoint).toBe(75);
    expect(state.cfm).toBe(8550);
  });

  it('economizerTempControlSP is 58.0°F (screenshot reference, was 52.0)', () => {
    const ctrl = loadController();
    expect(ctrl.getState().economizerTempControlSP).toBe(58.0);
  });

  it('lowOATLockout defaults to false / Off (screenshot reference, was true)', () => {
    const ctrl = loadController();
    expect(ctrl.getState().lowOATLockout).toBe(false);
  });

  it('returnAirTemp is 72.0°F (screenshot reference, was hardcoded 75)', () => {
    const ctrl = loadController();
    expect(ctrl.getState().returnAirTemp).toBe(72.0);
  });
});

describe('AHU44NewController — TMY3 weather wiring', () => {
  it('updateFromTMY3 sets oaTemperature and oaEnthalpy from the projector', () => {
    const code = readFileSync(resolve(__dirname, 'AHU44NewController.js'), 'utf-8');
    const window = {};
    mockTMY3Projector(window, 67.5, 28.3);
    new Function('window', code)(window);

    window.AHU44NewController.updateFromTMY3(100, 0.5);

    const state = window.AHU44NewController.getState();
    expect(state.oaTemperature).toBe(67.5);
    expect(state.oaEnthalpy).toBe(28.3);
  });

  it('updateFromTMY3 is a no-op when TMY3Projector is unavailable', () => {
    const ctrl = loadController(); // no window.TMY3Projector set
    const before = ctrl.getState().oaTemperature;

    expect(() => ctrl.updateFromTMY3(100, 0.5)).not.toThrow();
    expect(ctrl.getState().oaTemperature).toBe(before);
  });

  it('updateFromTMY3 recalculates downstream values (economizer/valves react to new OAT)', () => {
    const code = readFileSync(resolve(__dirname, 'AHU44NewController.js'), 'utf-8');
    const window = {};
    // Cold OAT, enthalpy OK, lockout off → economizer should engage at 100% OA damper
    mockTMY3Projector(window, 40.0, 15.0);
    new Function('window', code)(window);

    window.AHU44NewController.setValue('enthalpyOKForEconomizer', true);
    window.AHU44NewController.updateFromTMY3(50, 0);

    const state = window.AHU44NewController.getState();
    expect(state.oaTemperature).toBe(40.0);
    expect(state.economizerActive).toBe(true);
    expect(state.oaDamperPosition).toBe(100);
  });
});

describe('AHU44NewController — outdoor air temperature has no manual override', () => {
  it('setValue on oaTemperature is rejected and does not change state', () => {
    const ctrl = loadController();
    const before = ctrl.getState().oaTemperature;

    ctrl.setValue('oaTemperature', 999);

    expect(ctrl.getState().oaTemperature).toBe(before);
  });

  it('setValue on oaEnthalpy is rejected and does not change state', () => {
    const ctrl = loadController();
    const before = ctrl.getState().oaEnthalpy;

    ctrl.setValue('oaEnthalpy', 999);

    expect(ctrl.getState().oaEnthalpy).toBe(before);
  });

  it('setValue on oaTemperature logs a warning rather than throwing', () => {
    const ctrl = loadController();
    expect(() => ctrl.setValue('oaTemperature', 50)).not.toThrow();
  });

  it('updateFromTMY3 always applies, with no override to suspend it', () => {
    const code = readFileSync(resolve(__dirname, 'AHU44NewController.js'), 'utf-8');
    const window = {};
    mockTMY3Projector(window, 90.0, 35.0);
    new Function('window', code)(window);

    // Attempt to "override" — should be rejected
    window.AHU44NewController.setValue('oaTemperature', 50.0);
    expect(window.AHU44NewController.getState().oaTemperature).not.toBe(50.0);

    // Tick fires — TMY3 value applies (always does, unconditionally)
    window.AHU44NewController.updateFromTMY3(200, 0.25);
    expect(window.AHU44NewController.getState().oaTemperature).toBe(90.0);
  });

  it('setValue on other (legitimately editable) keys still works normally', () => {
    const ctrl = loadController();
    ctrl.setValue('fanSpeedSetpoint', 60);
    ctrl.setValue('coolingCoilSetpoint', 58.5);
    ctrl.setValue('lowOATLockout', true);

    const state = ctrl.getState();
    expect(state.fanSpeedSetpoint).toBe(60);
    expect(state.coolingCoilSetpoint).toBe(58.5);
    expect(state.lowOATLockout).toBe(true);
  });

  it('oaTemperatureAuto field no longer exists on state', () => {
    const ctrl = loadController();
    expect(ctrl.getState().oaTemperatureAuto).toBeUndefined();
  });

  it('relinquishOAT is not exposed on the public API', () => {
    const ctrl = loadController();
    expect(ctrl.relinquishOAT).toBeUndefined();
  });
});

describe('AHU44NewController — manual-mode tracking (M indicator)', () => {
  it('getModes() is empty before any setValue call', () => {
    const ctrl = loadController();
    expect(ctrl.getModes()).toEqual({});
  });

  it('flags a key Manual after setValue is called on it', () => {
    const ctrl = loadController();
    ctrl.setValue('co2Sensor', 650);
    expect(ctrl.getModes().co2Sensor).toBe('Manual');
  });

  it('does not flag keys that were never set via setValue', () => {
    const ctrl = loadController();
    ctrl.setValue('co2Sensor', 650);
    expect(ctrl.getModes().fanSpeedSetpoint).toBeUndefined();
    expect(ctrl.getModes().supplyAirTemp).toBeUndefined();
  });

  it('oaTemperature/oaEnthalpy are never flagged Manual, since setValue rejects them outright', () => {
    const ctrl = loadController();
    ctrl.setValue('oaTemperature', 999);
    ctrl.setValue('oaEnthalpy', 999);
    expect(ctrl.getModes().oaTemperature).toBeUndefined();
    expect(ctrl.getModes().oaEnthalpy).toBeUndefined();
  });

  it('getModes() returns a copy, not a live reference', () => {
    const ctrl = loadController();
    ctrl.setValue('co2Sensor', 650);
    const modes1 = ctrl.getModes();
    modes1.co2Sensor = 'tampered';
    expect(ctrl.getModes().co2Sensor).toBe('Manual');
  });

  it('multiple distinct keys can be flagged Manual independently', () => {
    const ctrl = loadController();
    ctrl.setValue('co2Sensor', 650);
    ctrl.setValue('fanSpeedSetpoint', 50);
    const modes = ctrl.getModes();
    expect(modes.co2Sensor).toBe('Manual');
    expect(modes.fanSpeedSetpoint).toBe('Manual');
  });
});

describe('AHU44NewController — oaDamperPosition is a true Manual-able output', () => {
  it('under normal auto operation, oaDamperPosition is computed by the sequence (not Manual)', () => {
    const ctrl = loadController();
    expect(ctrl.getModes().oaDamperPosition).toBeUndefined();
    // Default state: economizer not active, CO2 below setpoint → floor
    expect(ctrl.getState().oaDamperPosition).toBe(20);
  });

  it('setValue forces oaDamperPosition and flags it Manual', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 2);
    const state = ctrl.getState();
    expect(state.oaDamperPosition).toBe(2);
    expect(ctrl.getModes().oaDamperPosition).toBe('Manual');
  });

  it('a forced low oaDamperPosition SURVIVES a subsequent recalculate (e.g. a later setValue on another field) — this is the literal AHU-4-4 screenshot pattern: 215 CFM actual OA vs. a 4,900 CFM configured minimum', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 2); // forced near-closed
    ctrl.setValue('co2Sensor', 600); // any unrelated input change triggers recalculate()
    const state = ctrl.getState();
    expect(state.oaDamperPosition).toBe(2); // still held, not recomputed back to the 20% floor
  });

  it('a manually-forced low oaDamperPosition starves oaCFM, proportionally', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 1); // ~1% of the 20% floor reference
    const state = ctrl.getState();
    // oaCFM = minOAAirflowSetpoint * (oaDamperPosition / economizerMinPosition)
    // = 4900 * (1/20) = 245
    expect(state.oaCFM).toBe(245);
    expect(state.oaCFM).toBeLessThan(state.minOAAirflowSetpoint);
  });

  it('economizerActive stays false while the damper is manually held, even when OAT/enthalpy conditions would otherwise trigger it', () => {
    const code = readFileSync(resolve(__dirname, 'AHU44NewController.js'), 'utf-8');
    const window = {};
    mockTMY3Projector(window, 40.0, 15.0); // cold OAT — would normally engage the economizer
    new Function('window', code)(window);
    const ctrl = window.AHU44NewController;

    ctrl.setValue('enthalpyOKForEconomizer', true);
    ctrl.updateFromTMY3(50, 0);
    // Sanity check: without any override, this combination DOES engage the economizer
    expect(ctrl.getState().economizerActive).toBe(true);
    expect(ctrl.getState().oaDamperPosition).toBe(100);

    // Now manually hold the damper — economizer logic should no longer apply
    ctrl.setValue('oaDamperPosition', 15);
    ctrl.updateFromTMY3(51, 0); // another tick, still cold OAT
    const state = ctrl.getState();
    expect(state.economizerActive).toBe(false);
    expect(state.oaDamperPosition).toBe(15); // not bumped back to 100 by economizer logic
  });

  it('CO2 DCV does not override a manually-held oaDamperPosition', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 5);
    ctrl.setValue('co2Sensor', 2000); // would normally push the damper open via DCV
    expect(ctrl.getState().oaDamperPosition).toBe(5); // still held
  });

  it('fan-off (Run Schedule off) still forces oaDamperPosition to 0, even if manually held open', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 50);
    ctrl.setValue('runSchedule', false);
    expect(ctrl.getState().oaDamperPosition).toBe(0);
  });

  it('a value forced above the floor is also held (not just low overrides)', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 75);
    ctrl.setValue('co2Sensor', 600); // trigger another recalculate
    expect(ctrl.getState().oaDamperPosition).toBe(75);
  });
});
