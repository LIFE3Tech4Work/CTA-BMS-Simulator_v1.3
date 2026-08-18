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

// These are ESM (.mjs) files, so Node does not provide __dirname — it has to be
// derived from import.meta.url. Without it every readFileSync(resolve(__dirname,
// ...)) in this suite throws ReferenceError before a single assertion runs.
const __dirname = new URL('.', import.meta.url).pathname;

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

function mockTMY3Projector(window, dryBulb, enthalpy, relHumidity) {
  window.TMY3Projector = {
    interpolateWeather: function (row, fraction) {
      // relHumidity is part of a real TMY3 row and now drives this unit's
      // humidity model, so the mock supplies it rather than leaving it undefined.
      return {
        dryBulb: dryBulb,
        enthalpy: enthalpy,
        relHumidity: (typeof relHumidity === 'number') ? relHumidity : 60
      };
    }
  };
}

describe('AHU44NewController — outdoor humidity wiring', () => {
  // This unit received only dryBulb and enthalpy from TMY3; outdoor humidity was
  // inferred from enthalpy (15 + (h-13)*2.8) because no reading arrived. It now
  // comes from the weather file, and returnAirRH — which the dehumidification
  // call below depends on — is actually assigned.
  it('pulls relHumidity from the weather row', () => {
    const code = readFileSync(resolve(__dirname, 'AHU44NewController.js'), 'utf-8');
    const window = {};
    new Function('window', code)(window);
    const ctrl = window.AHU44NewController;
    mockTMY3Projector(window, 77, 30, 84);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().oaRelHumidity).toBe(84);
  });

  it('assigns returnAirRH, which the dehumidification call reads', () => {
    const ctrl = loadController();
    const rh = ctrl.getState().returnAirRH;
    expect(typeof rh).toBe('number');
    expect(isFinite(rh)).toBe(true);
  });

  it('a hand-set outdoor humidity outranks the weather row', () => {
    const code = readFileSync(resolve(__dirname, 'AHU44NewController.js'), 'utf-8');
    const window = {};
    new Function('window', code)(window);
    const ctrl = window.AHU44NewController;
    ctrl.setValue('oaRelHumidity', 95);
    mockTMY3Projector(window, 77, 30, 20);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().oaRelHumidity).toBe(95);
    ctrl.clearMode('oaRelHumidity');
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().oaRelHumidity).toBe(20);
  });

  it('cooling opens against a heating call on a cold humid day (was unreachable)', () => {
    // dehumidCall44 read state.returnAirRH before that field existed, so
    // undefined > 52 was always false and this branch was dead code.
    const ctrl = loadController();
    ctrl.setValue('oaTemperature', 45);
    ctrl.setValue('oaRelHumidity', 95);
    ctrl.setValue('heatingCoilSetpoint', 65);
    ctrl.recalculate();
    const s = ctrl.getState();
    expect(s.returnAirRH).toBeGreaterThan(52);
    expect(s.phtValvePosition).toBeGreaterThan(0);
    expect(s.chwValvePosition).toBeGreaterThan(0);
    expect(s.dehumidifying).toBe(true);
  });
});

describe('AHU44NewController — design constants match Honeywell reference', () => {
  it('produces 4332 CFM at 38% fan speed (real 3-month export average, not the 75% screenshot moment)', () => {
    const ctrl = loadController();
    const state = ctrl.getState();
    expect(state.fanSpeedSetpoint).toBe(38);
    expect(state.cfm).toBe(4332);
  });

  it('economizerTempControlSP is 58.0°F (screenshot reference, was 52.0)', () => {
    const ctrl = loadController();
    expect(ctrl.getState().economizerTempControlSP).toBe(58.0);
  });

  it('lowOATLockout defaults to false / Off (screenshot reference, was true)', () => {
    const ctrl = loadController();
    expect(ctrl.getState().lowOATLockout).toBe(false);
  });

  it('returnAirTemp is 62.0°F (real 3-month export average of 61.86°F, not the 72°F screenshot moment)', () => {
    const ctrl = loadController();
    expect(ctrl.getState().returnAirTemp).toBe(62.0);
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
    // Cold OAT, enthalpy OK, lockout off → economizer engages. The damper
    // modulates to the outdoor-air fraction that holds the supply low limit
    // rather than pinning at 100%: at 40°F OAT, 100% outdoor air would drive
    // mixed air far below the heating setpoint with the heating call
    // suppressed, which is what used to strand the unit in a cold state.
    mockTMY3Projector(window, 40.0, 15.0);
    new Function('window', code)(window);

    window.AHU44NewController.setValue('enthalpyOKForEconomizer', true);
    window.AHU44NewController.updateFromTMY3(50, 0);

    const state = window.AHU44NewController.getState();
    expect(state.oaTemperature).toBe(40.0);
    expect(state.economizerActive).toBe(true);
    expect(state.oaDamperPosition).toBe(32);
    expect(state.oaDamperPosition).toBeGreaterThan(state.economizerMinPosition);
  });
});

describe('AHU44NewController — outdoor air temperature is operator-overridable', () => {
  it('setValue on oaTemperature is accepted and holds', () => {
    // Outdoor conditions used to refuse writes. The 14 Aug review asked for the
    // opposite: an instructor hand-sets a winter or humid-summer condition and
    // it holds until released, so the class can watch the unit respond.
    const ctrl = loadController();
    ctrl.setValue('oaTemperature', 22);
    expect(ctrl.getState().oaTemperature).toBe(22);
    expect(ctrl.getModes().oaTemperature).toBe('Manual');
  });

  it('setValue on oaEnthalpy is accepted and holds', () => {
    const ctrl = loadController();
    ctrl.setValue('oaEnthalpy', 18);
    expect(ctrl.getState().oaEnthalpy).toBe(18);
    expect(ctrl.getModes().oaEnthalpy).toBe('Manual');
  });

  it('setValue on oaTemperature does not throw', () => {
    const ctrl = loadController();
    expect(() => ctrl.setValue('oaTemperature', 50)).not.toThrow();
  });

  it('the TMY3 push yields to a manual override, and resumes once released', () => {
    const code = readFileSync(resolve(__dirname, 'AHU44NewController.js'), 'utf-8');
    const window = {};
    mockTMY3Projector(window, 90.0, 35.0);
    new Function('window', code)(window);
    const ctrl = window.AHU44NewController;

    // A hand-set condition outranks the weather file — that is the point of it.
    ctrl.setValue('oaTemperature', 50.0);
    expect(ctrl.getState().oaTemperature).toBe(50.0);
    ctrl.updateFromTMY3(200, 0.25);
    expect(ctrl.getState().oaTemperature).toBe(50.0);

    // Released, the file drives it again.
    ctrl.clearMode('oaTemperature');
    ctrl.updateFromTMY3(200, 0.25);
    expect(ctrl.getState().oaTemperature).toBe(90.0);
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

  it('oaTemperature/oaEnthalpy are flagged Manual once set, like any other point', () => {
    const ctrl = loadController();
    expect(ctrl.getModes().oaTemperature).toBeUndefined();
    ctrl.setValue('oaTemperature', 22);
    ctrl.setValue('oaEnthalpy', 18);
    expect(ctrl.getModes().oaTemperature).toBe('Manual');
    expect(ctrl.getModes().oaEnthalpy).toBe('Manual');
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
    // Sanity check: without any override, this combination DOES engage the
    // economizer, modulating the damper above its ventilation minimum.
    expect(ctrl.getState().economizerActive).toBe(true);
    expect(ctrl.getState().oaDamperPosition).toBe(32);

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
