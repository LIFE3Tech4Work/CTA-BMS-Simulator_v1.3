/**
 * Unit tests for VAVController.js
 * VAVController.js attaches to `window`, so we set up globals before loading.
 *
 * Covers:
 *  - Two zones exist (VAV-4-4-01 Pre-Function, VAV-4-4-02 Ballroom), independent state
 *  - Sequence of operation: cooling call, deadband, heating-reheat call
 *  - CO2 DCV override raises (never lowers) the damper floor
 *  - Unoccupied behavior zeroes damper/airflow/reheat
 *  - dischargeAirTemp is AHU-driven, not operator-editable (mirrors
 *    AHU44NewController's WEATHER_DRIVEN_KEYS pattern for oaTemperature)
 *  - leavingAirTemp reflects reheat rise above dischargeAirTemp
 *  - Manual-mode tracking (getModes)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadController() {
  const code = readFileSync(
    resolve(__dirname, 'VAVController.js'),
    'utf-8'
  );
  const window = {};
  const fn = new Function('window', code);
  fn(window);
  return window.VAVController;
}

const ZONE_A = 'VAV-4-4-01';
const ZONE_B = 'VAV-4-4-02';

describe('VAVController — zone setup', () => {
  it('exposes exactly two zones', () => {
    const ctrl = loadController();
    expect(ctrl.getZoneIds()).toEqual([ZONE_A, ZONE_B]);
  });

  it('VAV-4-4-01 is labeled Pre-Function, served by AHU-4-4_NEW', () => {
    const ctrl = loadController();
    const info = ctrl.getZoneInfo(ZONE_A);
    expect(info.label).toBe('Pre-Function');
    expect(info.servedBy).toBe('AHU-4-4_NEW');
  });

  it('VAV-4-4-02 is labeled Ballroom, served by AHU-4-4_NEW', () => {
    const ctrl = loadController();
    const info = ctrl.getZoneInfo(ZONE_B);
    expect(info.label).toBe('Ballroom');
    expect(info.servedBy).toBe('AHU-4-4_NEW');
  });

  it('getZoneInfo returns undefined for an unknown zone', () => {
    const ctrl = loadController();
    expect(ctrl.getZoneInfo('VAV-9-9-99')).toBeUndefined();
  });

  it('getState returns undefined for an unknown zone', () => {
    const ctrl = loadController();
    expect(ctrl.getState('VAV-9-9-99')).toBeUndefined();
  });

  it('zones start with independent default state', () => {
    const ctrl = loadController();
    const a = ctrl.getState(ZONE_A);
    const b = ctrl.getState(ZONE_B);
    expect(a.spaceTemp).toBe(72.0);
    expect(b.spaceTemp).toBe(72.0);
    expect(a).not.toBe(b); // distinct objects
  });
});

describe('VAVController — sequence of operation', () => {
  it('deadband: space temp between heating and cooling setpoints holds damper at minimum', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 72); // between 70 heating / 74 cooling defaults
    const s = ctrl.getState(ZONE_A);
    expect(s.damperMode).toBe('Deadband-Minimum');
    expect(s.damperPosition).toBe(20); // 200/1000 = 20%
    expect(s.reheatValvePosition).toBe(0);
    expect(s.reheatValveStatus).toBe('OFF');
  });

  it('cooling call: space temp above cooling setpoint modulates damper above minimum', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 78); // 4°F above 74 setpoint — saturates coolFraction at 1
    const s = ctrl.getState(ZONE_A);
    expect(s.damperMode).toBe('Cooling');
    expect(s.damperPosition).toBe(100);
    expect(s.airflowCFM).toBe(1000); // max
    expect(s.reheatValvePosition).toBe(0);
  });

  it('cooling call partway: 76°F (2°F over) modulates partially open', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 76);
    const s = ctrl.getState(ZONE_A);
    expect(s.damperMode).toBe('Cooling');
    expect(s.damperPosition).toBeGreaterThan(20);
    expect(s.damperPosition).toBeLessThan(100);
  });

  it('heating call: space temp below heating setpoint holds damper at minimum and opens reheat', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 66); // 4°F below 70 heating setpoint
    const s = ctrl.getState(ZONE_A);
    expect(s.damperMode).toBe('Heating-Reheat');
    expect(s.damperPosition).toBe(20); // stays at minimum
    expect(s.reheatValvePosition).toBe(100); // 4 * 25 = 100, saturated
    expect(s.reheatValveStatus).toBe('ON');
  });

  it('heating call partway: 69°F (1°F under) opens reheat partially', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 69);
    const s = ctrl.getState(ZONE_A);
    expect(s.reheatValvePosition).toBe(25); // 1 * 25
    expect(s.reheatValveStatus).toBe('ON');
  });
});

describe('VAVController — CO2 demand-controlled ventilation override', () => {
  it('CO2 below setpoint does not affect the damper floor', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 72); // deadband → 20% floor
    ctrl.setValue(ZONE_A, 'co2Sensor', 700); // below 1000 setpoint
    expect(ctrl.getState(ZONE_A).damperPosition).toBe(20);
  });

  it('CO2 above setpoint raises the damper floor above minimum', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 72); // deadband → would be 20%
    ctrl.setValue(ZONE_A, 'co2Sensor', 1200); // 200 ppm over 1000 setpoint → floor = 20 + 20 = 40
    expect(ctrl.getState(ZONE_A).damperPosition).toBe(40);
  });

  it('CO2 override never lowers a damper position already higher from a cooling call', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 78); // cooling call → 100%
    ctrl.setValue(ZONE_A, 'co2Sensor', 1200); // would only ask for 40% — should not lower from 100
    expect(ctrl.getState(ZONE_A).damperPosition).toBe(100);
  });
});

describe('VAVController — unoccupied behavior', () => {
  it('unoccupied zeroes damper, airflow, and reheat regardless of space temp', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 66); // would normally trigger heating-reheat
    ctrl.setValue(ZONE_A, 'runSchedule', false);
    const s = ctrl.getState(ZONE_A);
    expect(s.damperMode).toBe('Unoccupied');
    expect(s.damperPosition).toBe(0);
    expect(s.airflowCFM).toBe(0);
    expect(s.reheatValvePosition).toBe(0);
    expect(s.reheatValveStatus).toBe('OFF');
  });
});

describe('VAVController — discharge/leaving air temperature (reheat physics)', () => {
  it('leavingAirTemp equals dischargeAirTemp when reheat is off', () => {
    const ctrl = loadController();
    ctrl.updateDischargeAirTemp(ZONE_A, 55.0);
    ctrl.setValue(ZONE_A, 'spaceTemp', 72); // deadband, no reheat
    expect(ctrl.getState(ZONE_A).leavingAirTemp).toBe(55.0);
  });

  it('leavingAirTemp rises above dischargeAirTemp proportional to reheat valve position', () => {
    const ctrl = loadController();
    ctrl.updateDischargeAirTemp(ZONE_A, 55.0);
    ctrl.setValue(ZONE_A, 'spaceTemp', 66); // heating-reheat, 100% valve
    // 55 + (100/100) * 25 = 80
    expect(ctrl.getState(ZONE_A).leavingAirTemp).toBe(80.0);
  });

  it('setValue rejects dischargeAirTemp — it is AHU-driven, not operator-editable', () => {
    const ctrl = loadController();
    ctrl.updateDischargeAirTemp(ZONE_A, 55.0);
    ctrl.setValue(ZONE_A, 'dischargeAirTemp', 999);
    expect(ctrl.getState(ZONE_A).dischargeAirTemp).toBe(55.0);
  });

  it('setValue on dischargeAirTemp logs a warning rather than throwing', () => {
    const ctrl = loadController();
    expect(() => ctrl.setValue(ZONE_A, 'dischargeAirTemp', 999)).not.toThrow();
  });

  it('updateDischargeAirTemp is a no-op for an unknown zone', () => {
    const ctrl = loadController();
    expect(() => ctrl.updateDischargeAirTemp('VAV-9-9-99', 55.0)).not.toThrow();
  });
});

describe('VAVController — zone independence', () => {
  it('setValue on one zone does not affect the other', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 78);
    expect(ctrl.getState(ZONE_A).damperMode).toBe('Cooling');
    expect(ctrl.getState(ZONE_B).damperMode).toBe('Deadband-Minimum');
  });

  it('updateDischargeAirTemp on one zone does not affect the other', () => {
    const ctrl = loadController();
    ctrl.updateDischargeAirTemp(ZONE_A, 50.0);
    expect(ctrl.getState(ZONE_A).dischargeAirTemp).toBe(50.0);
    expect(ctrl.getState(ZONE_B).dischargeAirTemp).toBe(55.0); // unchanged default
  });
});

describe('VAVController — manual-mode tracking', () => {
  it('getModes() is empty before any setValue call', () => {
    const ctrl = loadController();
    expect(ctrl.getModes(ZONE_A)).toEqual({});
  });

  it('flags a key Manual after setValue is called on it', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'co2Sensor', 650);
    expect(ctrl.getModes(ZONE_A).co2Sensor).toBe('Manual');
  });

  it('does not flag dischargeAirTemp Manual, since setValue rejects it outright', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'dischargeAirTemp', 999);
    expect(ctrl.getModes(ZONE_A).dischargeAirTemp).toBeUndefined();
  });

  it('getModes is independent per zone', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'co2Sensor', 650);
    expect(ctrl.getModes(ZONE_A).co2Sensor).toBe('Manual');
    expect(ctrl.getModes(ZONE_B).co2Sensor).toBeUndefined();
  });
});

describe('VAVController — damperPosition/reheatValvePosition are true Manual-able outputs', () => {
  it('under normal occupied operation, damperPosition is sequence-driven (not Manual)', () => {
    const ctrl = loadController();
    expect(ctrl.getModes(ZONE_A).damperPosition).toBeUndefined();
    expect(ctrl.getState(ZONE_A).damperPosition).toBe(20); // deadband floor, default spaceTemp=72
  });

  it('setValue forces damperPosition and flags it Manual', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'damperPosition', 0);
    const state = ctrl.getState(ZONE_A);
    expect(state.damperPosition).toBe(0);
    expect(ctrl.getModes(ZONE_A).damperPosition).toBe('Manual');
  });

  it('a forced damperPosition SURVIVES a subsequent recalculate triggered by an unrelated input', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'damperPosition', 0);
    ctrl.setValue(ZONE_A, 'spaceTemp', 78); // would normally drive a 100% cooling call
    expect(ctrl.getState(ZONE_A).damperPosition).toBe(0); // still held, not recomputed
  });

  it('CO2 DCV does not override a manually-held damperPosition', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'damperPosition', 5);
    ctrl.setValue(ZONE_A, 'co2Sensor', 2000); // would normally raise the floor via DCV
    expect(ctrl.getState(ZONE_A).damperPosition).toBe(5);
  });

  it('reheatValvePosition can independently be forced Manual', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'reheatValvePosition', 60);
    const state = ctrl.getState(ZONE_A);
    expect(state.reheatValvePosition).toBe(60);
    expect(state.reheatValveStatus).toBe('ON'); // status reflects the forced value
    expect(ctrl.getModes(ZONE_A).reheatValvePosition).toBe('Manual');
  });

  it('forcing reheatValvePosition to 0 reports status OFF', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'reheatValvePosition', 0);
    expect(ctrl.getState(ZONE_A).reheatValveStatus).toBe('OFF');
  });

  it('the literal "VAV running during unoccupied hours" scenario: damper manually held open while runSchedule is false', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'damperPosition', 50);
    ctrl.setValue(ZONE_A, 'runSchedule', false);
    const state = ctrl.getState(ZONE_A);
    expect(state.damperMode).toBe('Unoccupied');
    expect(state.damperPosition).toBe(50); // held open despite the schedule
    expect(state.airflowCFM).toBeGreaterThan(0); // genuinely moving air, not just a stale number
  });

  it('the non-manual unoccupied case is unchanged (cross-check against the existing "unoccupied behavior" tests below)', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'runSchedule', false);
    const s = ctrl.getState(ZONE_A);
    expect(s.damperPosition).toBe(0);
    expect(s.airflowCFM).toBe(0);
  });

  it('airflowCFM scales proportionally with a manually-forced damper position while unoccupied', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'damperPosition', 50); // half open, max 1000 CFM
    ctrl.setValue(ZONE_A, 'runSchedule', false);
    expect(ctrl.getState(ZONE_A).airflowCFM).toBe(500); // 50% of maxAirflowSetpoint
  });

  it('reheat manually held open also survives the unoccupied transition', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'reheatValvePosition', 40);
    ctrl.setValue(ZONE_A, 'runSchedule', false);
    const state = ctrl.getState(ZONE_A);
    expect(state.reheatValvePosition).toBe(40);
    expect(state.reheatValveStatus).toBe('ON');
  });

  it('manual overrides are independent per zone', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'damperPosition', 75);
    ctrl.setValue(ZONE_A, 'runSchedule', false);
    expect(ctrl.getState(ZONE_A).damperPosition).toBe(75);
    expect(ctrl.getState(ZONE_B).damperPosition).toBe(20); // unaffected, still default occupied deadband
  });

  it('reset() clears Manual flags and restores normal sequence-driven behavior', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'damperPosition', 0);
    ctrl.reset();
    expect(ctrl.getModes(ZONE_A).damperPosition).toBeUndefined();
    expect(ctrl.getState(ZONE_A).damperPosition).toBe(20); // back to sequence-driven default
  });
});

describe('VAVController — reset', () => {
  it('reset() restores all zones to default state and clears modes', () => {
    const ctrl = loadController();
    ctrl.setValue(ZONE_A, 'spaceTemp', 78);
    ctrl.reset();
    expect(ctrl.getState(ZONE_A).spaceTemp).toBe(72.0);
    expect(ctrl.getModes(ZONE_A)).toEqual({});
  });
});

describe('VAVController — subscribe', () => {
  it('calls the callback immediately on subscribe with current state', () => {
    const ctrl = loadController();
    let received = null;
    ctrl.subscribe(ZONE_A, function(s) { received = s; });
    expect(received).not.toBeNull();
    expect(received.spaceTemp).toBe(72.0);
  });

  it('calls the callback again after a recalculate-triggering change', () => {
    const ctrl = loadController();
    let callCount = 0;
    ctrl.subscribe(ZONE_A, function() { callCount++; });
    ctrl.setValue(ZONE_A, 'spaceTemp', 78);
    expect(callCount).toBe(2); // initial + after setValue
  });

  it('unsubscribe stops further notifications', () => {
    const ctrl = loadController();
    let callCount = 0;
    const unsub = ctrl.subscribe(ZONE_A, function() { callCount++; });
    unsub();
    ctrl.setValue(ZONE_A, 'spaceTemp', 78);
    expect(callCount).toBe(1); // only the initial call
  });

  it('subscribe on an unknown zone returns a no-op unsubscribe without throwing', () => {
    const ctrl = loadController();
    expect(() => {
      const unsub = ctrl.subscribe('VAV-9-9-99', function() {});
      unsub();
    }).not.toThrow();
  });
});
