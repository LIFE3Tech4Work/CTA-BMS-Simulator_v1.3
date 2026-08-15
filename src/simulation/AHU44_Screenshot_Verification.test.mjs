/**
 * AHU44_Screenshot_Verification.test.mjs
 *
 * Verification scenarios built directly from Lev's lecture screenshot
 * (Hotel_AHU4_4Edit.png — "Exercise #2", Station AHU-4-4, Service:
 * Pre-Function/Ballroom Level 2). Not part of the original suite —
 * written to confirm the live app actually reproduces this specific
 * real-world screen, point by point, and that its documented fault
 * (215 CFM actual OA vs. 4,900 CFM configured minimum) is reachable
 * and correctly detected.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadController() {
  const code = readFileSync(resolve(__dirname, 'AHU44NewController.js'), 'utf-8');
  const window = {};
  new Function('window', code)(window);
  return window.AHU44NewController;
}

function loadFaultEngine() {
  const code = readFileSync(resolve(__dirname, 'AHU44NewFaultEngine.js'), 'utf-8');
  const window = {};
  new Function('window', code)(window);
  return window.AHU44NewFaultEngine;
}

describe('Scenario 1 — cold load matches the screenshot baseline, unmodified', () => {
  const ctrl = loadController();
  const s = ctrl.getState();

  it('temperature/humidity/setpoint fields match the screenshot readout', () => {
    expect(s.oaTemperature).toBe(83.4);
    expect(s.oaEnthalpy).toBe(32.0);
    expect(s.coolingCoilSetpoint).toBe(60.0);
    expect(s.heatingCoilSetpoint).toBe(55.0);
    expect(s.plenumMinSetpoint).toBe(40.0);
    expect(s.economizerTempControlSP).toBe(58.0);
    expect(s.returnAirTemp).toBe(72.0);
    expect(s.supplyAirTemp).toBe(60.0);
    // NOTE: the 72.9°F seeded in the source literal is a pre-recalculate
    // seed value only. getState() reflects the live recalculated value —
    // since OAT (83.4°F) is above the 55°F heating setpoint, the preheat
    // coil is closed and preheatTemp passes OAT straight through, per the
    // controller's own documented sequence ("preheat temp = OAT when no
    // heating needed"). 72.9°F on the real screenshot reflects whatever
    // return-air/mixed-air state existed at that specific historical
    // moment — not reproducible from the static seed alone.
    expect(s.preheatTemp).toBe(s.oaTemperature);
    expect(s.chwSupplyTemp).toBe(41.8);
    expect(s.cwSupplyTemp).toBe(75.2);
  });

  it('airflow/CO2/setpoint fields match the screenshot readout', () => {
    expect(s.cfm).toBe(8550);              // supply CFM label on the graphic
    expect(s.minOAAirflowSetpoint).toBe(4900);
    expect(s.co2Sensor).toBe(538);
    expect(s.co2Setpoint).toBe(900);
    expect(s.economizerMinPosition).toBe(20);
    expect(s.minPositionFanSpeedLock).toBe(5);
  });

  it('mode flags match the screenshot readout', () => {
    expect(s.lowOATLockout).toBe(false);
    expect(s.enthalpyOKForEconomizer).toBe(false);
    expect(s.fanTrackMode).toBe('CFM');
    expect(s.runSchedule).toBe(true);
  });
});

describe('FINDING — the unmodified default state already trips N-01, before any student interaction', () => {
  it('supplyAirTemp defaults to exactly 60.0°F, matching the screenshot\'s discharge reading and coolingCoilSetpoint — but N-01\'s design band caps at 58°F', () => {
    const ctrl = loadController();
    const s = ctrl.getState();
    expect(s.coolingCoilSetpoint).toBe(60.0);
    expect(s.supplyAirTemp).toBe(60.0);
  });

  it('so the fault engine flags N-01 on cold load, with zero user interaction — the tab\'s own calibrated "healthy" screenshot state is self-inconsistent with its own fault rule', () => {
    const ctrl = loadController();
    const engine = loadFaultEngine();
    const alarms = engine.evaluate(ctrl.getState());
    const n01 = alarms.find(a => a.condition === 'N-01');
    // This SHOULD arguably be undefined for a screen calibrated to represent
    // a real, presumably-intended operating point. It isn't. Either N-01's
    // band (52-58°F) needs to widen to 52-60°F to match the real design
    // setpoint, or the default coolingCoilSetpoint doesn't actually reflect
    // the "no active fault" baseline the screenshot implies. Documenting the
    // current (buggy) behavior here so it isn't silently reintroduced if
    // "fixed" without a test covering it.
    expect(n01).toBeDefined();
  });
});

describe('Scenario 2 — economizer OFF at 83.4°F is CORRECT sequence behavior, not a fault', () => {
  it('economizer correctly stays inactive because OAT (83.4°F) is above the 58°F changeover SP', () => {
    const ctrl = loadController();
    const s = ctrl.getState();
    expect(s.economizerActive).toBe(false);
    expect(s.oaTemperature).toBeGreaterThan(s.economizerTempControlSP);
  });

  it('no fault rule fires for this — N-03 only triggers when economizer IS active AND CHW is also open', () => {
    const ctrl = loadController();
    const engine = loadFaultEngine();
    const alarms = engine.evaluate(ctrl.getState());
    const n03 = alarms.find(a => a.condition === 'N-03');
    expect(n03).toBeUndefined();
  });
});

describe('Scenario 3 — CO2 at 538 ppm is healthy, confirm no false-positive alarm', () => {
  it('N-02 (CO2 > 1,100 ppm) does not fire at the screenshot reading of 538 ppm', () => {
    const ctrl = loadController();
    const engine = loadFaultEngine();
    const alarms = engine.evaluate(ctrl.getState());
    const n02 = alarms.find(a => a.condition === 'N-02');
    expect(n02).toBeUndefined();
  });
});

describe('Scenario 4 — reproducing the screenshot\'s actual fault: OA damper stuck low', () => {
  it('the unmodified default does NOT show the fault (damper sits at the 20% floor, oaCFM = configured minimum)', () => {
    const ctrl = loadController();
    const s = ctrl.getState();
    expect(s.oaDamperPosition).toBe(20);
    expect(s.oaCFM).toBe(4900);
  });

  it('forcing oaDamperPosition to ~1% (as annotated "Manually Overridden" in the screenshot) starves oaCFM into the screenshot\'s ~215 CFM range', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 1);
    const s = ctrl.getState();
    expect(ctrl.getModes().oaDamperPosition).toBe('Manual');
    expect(s.oaCFM).toBeGreaterThan(200);
    expect(s.oaCFM).toBeLessThan(300); // 4900 * (1/20) = 245 — same order of magnitude as the screenshot's 215
  });

  it('N-04 fires once the damper is manually forced below the 20% floor while the fan runs', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 1);
    const engine = loadFaultEngine();
    const alarms = engine.evaluate(ctrl.getState());
    const n04 = alarms.find(a => a.condition === 'N-04');
    expect(n04).toBeDefined();
  });

  it('the fault clears once the damper is released back toward the floor', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 1);
    ctrl.setValue('oaDamperPosition', 20);
    const engine = loadFaultEngine();
    const alarmsAfterFix = engine.evaluate(ctrl.getState());
    const n04 = alarmsAfterFix.find(a => a.condition === 'N-04');
    expect(n04).toBeUndefined();
  });
});

describe('Scenario 5 — Run Schedule "manually overridden" is visible as a mode flag, but is NOT an alarm condition today', () => {
  it('setValue on runSchedule flags it Manual (matches the red "Manually Overridden" callout)', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', true); // operator re-affirms/holds it, same as screenshot
    expect(ctrl.getModes().runSchedule).toBe('Manual');
  });

  it('no N-01..N-04 rule watches runSchedule override state directly — re-affirming it Manual raises no additional NEW alarm on top of the pre-existing N-01 baseline finding above', () => {
    // NOTE: engine.evaluate() returns only newly-triggered alarms per call
    // (its own docstring: "Array of newly generated alarms"), not the full
    // active set — that's what getActiveAlarms() is for. So this checks
    // getActiveAlarms() before/after, not two raw evaluate() calls.
    const ctrl = loadController();
    const engine = loadFaultEngine();
    engine.evaluate(ctrl.getState()); // seeds N-01 as active (baseline finding)
    const before = engine.getActiveAlarms().map(a => a.condition).sort();
    ctrl.setValue('runSchedule', true);
    engine.evaluate(ctrl.getState());
    const after = engine.getActiveAlarms().map(a => a.condition).sort();
    expect(after).toEqual(before); // no incremental alarm caused by the schedule override itself
  });
});

describe('Scenario 6 — points visible on the screenshot with no corresponding modeled field (documented, not a bug)', () => {
  it('flags fields the current data model does not track, so nobody goes looking for them', () => {
    const ctrl = loadController();
    const s = ctrl.getState();
    // 12,438 CFM (top exhaust/INT duct reading), 1.66 / 2.00 in.wc (duct static
    // pressure gauges), 28 BTU + 56.9% RH (return air enthalpy/RH readout),
    // 1,103 GPM (CHW flow) are all visible on the screenshot graphic but are
    // decorative/unmodeled — no state field exists for them. This test exists
    // only as a living checklist, not an assertion.
    expect(s.exhaustDamperPct).toBeDefined(); // nearest modeled proxy for the exhaust side
    expect(s.chwSupplyTemp).toBeDefined();    // modeled; GPM flow itself is not
  });
});
