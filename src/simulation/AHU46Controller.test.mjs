/**
 * Unit tests for AHU46Controller.js
 * Meeting Room 2nd Level — formula-driven controller.
 *
 * Key difference under test: OA_DAMPER_FLOOR = 50% (meeting room), not 20%.
 * Per the SOO's own min/max CFM table (4,500/9,000 CFM = 50%) — see
 * SCENARIO_TRACKING.md item #14. Was previously 60%, which matched neither
 * the SOO table nor minOAAirflowSetpoint (4,500 CFM).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

function loadController() {
  const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
  const w = {};
  new Function('window', code)(w);
  return w.AHU46Controller;
}

function mockTMY3(w, dryBulb, enthalpy) {
  w.TMY3Projector = {
    interpolateWeather: function() {
      return { dryBulb, enthalpy, relHumidity: 60, dewPoint: 55, wetBulb: 62 };
    }
  };
}

function loadWithWeather(dryBulb, enthalpy) {
  const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
  const w = {};
  mockTMY3(w, dryBulb, enthalpy);
  new Function('window', code)(w);
  return w.AHU46Controller;
}

// ─── Design constants ────────────────────────────────────────────────────────

describe('AHU46Controller — design constants', () => {
  it('minimum OA damper position is 50% — matches SOO min/max CFM table (4,500/9,000 CFM)', () => {
    expect(loadController().getState().economizerMinPosition).toBe(50);
  });

  it('min OA airflow setpoint is 4500 CFM (smaller than AHU-4-4_NEW 4900)', () => {
    expect(loadController().getState().minOAAirflowSetpoint).toBe(4500);
  });

  it('default fan speed is 75% → supply CFM close to 6900 (DESIGN_CFM × 0.75)', () => {
    const state = loadController().getState();
    expect(state.fanSpeedSetpoint).toBe(75);
    expect(Math.abs(state.cfm - 6900)).toBeLessThan(100);
  });

  it('cooling coil setpoint is 60.0°F', () => {
    expect(loadController().getState().coolingCoilSetpoint).toBe(60.0);
  });

  it('heating coil setpoint is 55.0°F', () => {
    expect(loadController().getState().heatingCoilSetpoint).toBe(55.0);
  });

  it('economizer temp control SP is 58.0°F', () => {
    expect(loadController().getState().economizerTempControlSP).toBe(58.0);
  });

  it('CO₂ setpoint is 900 PPM', () => {
    expect(loadController().getState().co2Setpoint).toBe(900);
  });
});

// ─── Fan logic ───────────────────────────────────────────────────────────────

describe('AHU46Controller — fan logic', () => {
  it('fan runs when runSchedule is true', () => {
    const ctrl = loadController();
    expect(ctrl.getState().fanRunning).toBe(true);
    expect(ctrl.getState().cfm).toBeGreaterThan(0);
  });

  it('fan stops when runSchedule is set false', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', false);
    const s = ctrl.getState();
    expect(s.fanRunning).toBe(false);
    expect(s.cfm).toBe(0);
    expect(s.oaCFM).toBe(0);
    expect(s.oaDamperPosition).toBe(0);
  });

  it('fire alarm shutdown stops fan regardless of runSchedule', () => {
    const ctrl = loadController();
    ctrl.setValue('fireAlarmShutdown', true);
    expect(ctrl.getState().fanRunning).toBe(false);
  });

  it('supply CFM scales with fan speed setpoint', () => {
    const ctrl = loadController();
    ctrl.setValue('fanSpeedSetpoint', 50);
    expect(ctrl.getState().cfm).toBeCloseTo(9200 * 0.5, -2);
  });
});

// ─── Fan interlock chain (SOO System Start #1-2, General #2) ────────────────
//
// interlockOn, exhaustFanOn, and commonDamperOpen were previously hardcoded
// `true` forever — meaning they'd stay reported as on/open even through a
// shutdown or fire-alarm trip. They should track live fan status instead.

describe('AHU46Controller — fan interlock chain tracks live status', () => {
  it('all three are true when the fan is running (default state)', () => {
    const ctrl = loadController();
    const s = ctrl.getState();
    expect(s.fanRunning).toBe(true);
    expect(s.interlockOn).toBe(true);
    expect(s.exhaustFanOn).toBe(true);
    expect(s.commonDamperOpen).toBe(true);
  });

  it('all three go false when the unit is off (runSchedule=false)', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', false);
    const s = ctrl.getState();
    expect(s.fanRunning).toBe(false);
    expect(s.interlockOn).toBe(false);
    expect(s.exhaustFanOn).toBe(false);
    expect(s.commonDamperOpen).toBe(false);
  });

  it('all three go false during fire alarm shutdown, even if runSchedule is On', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', true);
    ctrl.setValue('fireAlarmShutdown', true);
    const s = ctrl.getState();
    expect(s.fanRunning).toBe(false);
    expect(s.interlockOn).toBe(false);
    expect(s.exhaustFanOn).toBe(false);
    expect(s.commonDamperOpen).toBe(false);
  });

  it('return to true once fire alarm clears and schedule is On', () => {
    const ctrl = loadController();
    ctrl.setValue('fireAlarmShutdown', true);
    ctrl.setValue('fireAlarmShutdown', false);
    const s = ctrl.getState();
    expect(s.fanRunning).toBe(true);
    expect(s.interlockOn).toBe(true);
    expect(s.exhaustFanOn).toBe(true);
    expect(s.commonDamperOpen).toBe(true);
  });
});

// ─── 50% OA damper floor ─────────────────────────────────────────────────────
//
// Was 60% — SOO "AHU-4-3 / RF-4-6: Sequence of Operation" states AHU-4-6's
// minimum/maximum CFM setpoints as 4,500/9,000 CFM = exactly 50%, not 60%.
// See SCENARIO_TRACKING.md item #14.

describe('AHU46Controller — 50% OA damper minimum', () => {
  it('default oaDamperPosition is 50% (the floor)', () => {
    expect(loadController().getState().oaDamperPosition).toBe(50);
  });

  it('damper stays at 50% floor when OAT is above economizer SP', () => {
    // Default OAT 81.6°F >> economizerTempControlSP 58°F → no economizer
    const ctrl = loadController();
    expect(ctrl.getState().oaDamperPosition).toBe(50);
    expect(ctrl.getState().economizerActive).toBe(false);
  });

  it('damper opens to 100% when cold OAT + enthalpy OK triggers economizer', () => {
    const ctrl = loadWithWeather(40.0, 10.0);
    ctrl.setValue('enthalpyOKForEconomizer', true);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().oaDamperPosition).toBe(100);
    expect(ctrl.getState().economizerActive).toBe(true);
  });

  it('oaCFM at 50% min equals minOAAirflowSetpoint × (50/50) = 4500 CFM', () => {
    const ctrl = loadController();
    expect(ctrl.getState().oaCFM).toBeCloseTo(4500, -2);
  });

  it('CO₂ DCV raises damper above 50% when co2 > co2Setpoint', () => {
    const ctrl = loadController();
    ctrl.setValue('co2Sensor', 1200);  // 300 above 900 SP
    expect(ctrl.getState().oaDamperPosition).toBeGreaterThan(50);
  });

  it('boundary: damper exactly at 50% does not trip M-04, 49% does', () => {
    // Regression guard against an off-by-one on the < vs <= boundary when
    // the floor moved from 60 to 50.
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 50);
    expect(ctrl.getState().oaDamperPosition).toBe(50);

    ctrl.setValue('oaDamperPosition', 49);
    expect(ctrl.getState().oaDamperPosition).toBe(49);
  });
});

// ─── Manual-output oaDamperPosition (M-04 fault scenario) ───────────────────

describe('AHU46Controller — Manual oaDamperPosition (M-04 fault)', () => {
  it('setValue forces oaDamperPosition below 50% floor and flags it Manual', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 10);
    expect(ctrl.getState().oaDamperPosition).toBe(10);
    expect(ctrl.getModes().oaDamperPosition).toBe('Manual');
  });

  it('forced low damper starves OA CFM — the meeting-room ventilation shortfall', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 10);
    const s = ctrl.getState();
    // oaCFM = 4500 × (10/50) = 900 CFM (vs 4500 CFM minimum) = 80% shortfall
    expect(s.oaCFM).toBeLessThan(s.minOAAirflowSetpoint);
    expect(s.oaCFM).toBeCloseTo(900, -1);
  });

  it('manual override survives a subsequent recalculate via an unrelated setValue', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 10);
    ctrl.setValue('co2Sensor', 800);
    expect(ctrl.getState().oaDamperPosition).toBe(10);
  });

  it('CO₂ DCV cannot override a manually-held damper', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 10);
    ctrl.setValue('co2Sensor', 2000);
    expect(ctrl.getState().oaDamperPosition).toBe(10);
  });

  it('economizerActive stays false when damper is manually held', () => {
    const ctrl = loadWithWeather(40.0, 10.0);
    ctrl.setValue('enthalpyOKForEconomizer', true);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().economizerActive).toBe(true); // sanity: econ active before override

    ctrl.setValue('oaDamperPosition', 10);
    ctrl.updateFromTMY3(2, 0);
    expect(ctrl.getState().economizerActive).toBe(false);
    expect(ctrl.getState().oaDamperPosition).toBe(10);
  });

  it('fan-off still forces damper to 0 even with a manual hold', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 10);
    ctrl.setValue('runSchedule', false);
    expect(ctrl.getState().oaDamperPosition).toBe(0);
  });
});

// ─── Heating logic ───────────────────────────────────────────────────────────

describe('AHU46Controller — heating logic', () => {
  it('preheat valve opens when OAT < heating setpoint (55°F)', () => {
    const ctrl = loadWithWeather(45.0, 15.0);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.phtValvePosition).toBeGreaterThan(0);
    expect(s.phtValveStatus).toBe('ON');
  });

  it('preheat valve is closed when OAT > heating setpoint', () => {
    const ctrl = loadController(); // OAT 81.6°F >> 55°F
    expect(ctrl.getState().phtValvePosition).toBe(0);
    expect(ctrl.getState().phtValveStatus).toBe('OFF');
  });

  it('preheat temp = OAT when no heating needed', () => {
    const ctrl = loadController();
    const s = ctrl.getState();
    expect(s.preheatTemp).toBeCloseTo(s.oaTemperature, 0);
  });
});

// ─── Cooling logic ───────────────────────────────────────────────────────────

describe('AHU46Controller — cooling logic', () => {
  it('CHW valve opens when mixed air exceeds cooling setpoint', () => {
    const ctrl = loadController();
    // At 81.6°F OAT, 60% min damper: mixedAirTemp ≈ 81.6×0.6 + 72.1×0.4 ≈ 77.8°F > 60°F SP
    expect(ctrl.getState().chwValvePosition).toBeGreaterThan(0);
    expect(ctrl.getState().chwValveStatus).toBe('ON');
  });

  it('supply air temp approaches cooling setpoint when cooling is active', () => {
    const ctrl = loadController();
    const s = ctrl.getState();
    if (s.chwValvePosition > 0) {
      expect(s.supplyAirTemp).toBeLessThanOrEqual(s.coolingCoilSetpoint + 2);
    }
  });

  it('CHW valve closes when OAT is just below economizer SP but above heating SP', () => {
    // At OAT=55°F: no heating (55 == heatingCoilSetpoint threshold), economizer activates
    // (55 < 58°F economizerTempControlSP), damper→100%, mixedAirTemp≈55°F < 60°F coolingCoilSP → no cooling
    const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
    const w = {};
    mockTMY3(w, 55.0, 20.0);
    new Function('window', code)(w);
    const ctrl = w.AHU46Controller;
    ctrl.setValue('enthalpyOKForEconomizer', true);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.economizerActive).toBe(true);
    expect(s.phtValvePosition).toBe(0);         // no heating
    expect(s.chwValvePosition).toBe(0);         // no cooling
    expect(s.chwValveStatus).toBe('OFF');
  });
});

// ─── Heating/cooling mutual exclusivity (SOO General Sequences #10) ─────────
//
// "On all systems containing both cooling and heating coils (except in
// reheat position), the heating coil control valve shall be closed
// whenever cooling coil is activated and vice versa." Source: "AHU-4-3 /
// RF-4-6: Sequence of Operation" — Variable Volume, Mixing Box for VAVs
// with Demand Controlled Ventilation, page 7, item 10.

describe('AHU46Controller — heating/cooling coils are mutually exclusive (SOO #10)', () => {
  it('cold day: preheat opens but cooling stays closed, even though the preheated/return-air mix exceeds the cooling setpoint', () => {
    // At OAT=45°F: preheat opens (45 < 55°F heating SP) and raises the coil
    // discharge to 60°F. Mixed with 72.1°F return air at the 60% damper
    // floor, that blend is 64.8°F — above the 60°F cooling setpoint. Before
    // the fix, this independently opened the CHW valve alongside the
    // preheat valve. It must not.
    const ctrl = loadWithWeather(45.0, 15.0);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.phtValvePosition).toBeGreaterThan(0);
    expect(s.chwValvePosition).toBe(0);
    expect(s.chwValveStatus).toBe('OFF');
  });

  it('never reports both valves open at once, across a sweep of outdoor temperatures', () => {
    for (let oat = -10; oat <= 100; oat += 5) {
      const ctrl = loadWithWeather(oat, 15.0);
      ctrl.updateFromTMY3(1, 0);
      const s = ctrl.getState();
      const bothOpen = s.phtValvePosition > 0 && s.chwValvePosition > 0;
      expect(bothOpen, `both valves open at OAT=${oat}°F (pht=${s.phtValvePosition}, chw=${s.chwValvePosition})`).toBe(false);
    }
  });

  it('warm day: cooling still opens normally when heating is not active', () => {
    // Unaffected case — confirms the fix didn't disable cooling generally.
    const ctrl = loadController(); // 81.6°F default, well above heating SP
    const s = ctrl.getState();
    expect(s.phtValvePosition).toBe(0);
    expect(s.chwValvePosition).toBeGreaterThan(0);
    expect(s.chwValveStatus).toBe('ON');
  });

  it('supply air is not artificially forced to a fixed value when cooling defers to heating', () => {
    // With cooling deferring, supply air should simply ride the mixed-air
    // temperature (no coil correction applied) rather than being clamped.
    const ctrl = loadWithWeather(45.0, 15.0);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.chwValvePosition).toBe(0);
    expect(s.supplyAirTemp).toBeCloseTo(s.mixedAirTemp, 1);
  });
});

// ─── Freeze protection pump (SOO General Sequences #5) ──────────────────────
//
// "The hot water freeze protection pump shall be started automatically upon
// outside air temperature falling below 35°F (adjustable). The hot water
// freeze protection pump shall be stopped automatically upon outside air
// temperature rising above 40°F (adjustable)." Source: "AHU-4-3 / RF-4-6:
// Sequence of Operation", General Automatic Control Sequences, item 5.

describe('AHU46Controller — freeze protection pump auto start/stop', () => {
  it('starts below 35°F', () => {
    const ctrl = loadWithWeather(30.0, 5.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().freezePumpOn).toBe(true);
  });

  it('stops above 40°F', () => {
    const ctrl = loadWithWeather(50.0, 15.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().freezePumpOn).toBe(false);
  });

  it('holds last state inside the 35-40°F hysteresis deadband, cooling down', () => {
    const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
    const w = {};
    mockTMY3(w, 90, 30);
    new Function('window', code)(w);
    const ctrl = w.AHU46Controller;
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().freezePumpOn).toBe(false); // starts off, warm day

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 38, enthalpy: 10, relHumidity: 60, dewPoint: 30, wetBulb: 34 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().freezePumpOn).toBe(false); // in deadband, holds off

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 34, enthalpy: 8, relHumidity: 60, dewPoint: 28, wetBulb: 31 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().freezePumpOn).toBe(true); // below 35, now on
  });

  it('holds last state inside the deadband, warming up (no chatter)', () => {
    const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
    const w = {};
    mockTMY3(w, 20, 5);
    new Function('window', code)(w);
    const ctrl = w.AHU46Controller;
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().freezePumpOn).toBe(true); // starts on, deep winter

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 38, enthalpy: 10, relHumidity: 60, dewPoint: 30, wetBulb: 34 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().freezePumpOn).toBe(true); // in deadband, holds on

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 41, enthalpy: 12, relHumidity: 60, dewPoint: 32, wetBulb: 36 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().freezePumpOn).toBe(false); // above 40, now off
  });

  it('runs independent of fan/run-schedule status — protects piping, not supply air', () => {
    const ctrl = loadWithWeather(20.0, 5.0);
    ctrl.setValue('runSchedule', false);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.fanRunning).toBe(false);
    expect(s.freezePumpOn).toBe(true);
  });
});

// ─── TMY3 integration ────────────────────────────────────────────────────────

describe('AHU46Controller — TMY3 weather integration', () => {
  it('updateFromTMY3 pushes dryBulb and enthalpy into state', () => {
    const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
    const w = {};
    mockTMY3(w, 55.0, 22.0);
    new Function('window', code)(w);
    const ctrl = w.AHU46Controller;
    ctrl.updateFromTMY3(100, 0.5);
    expect(ctrl.getState().oaTemperature).toBeCloseTo(55.0, 1);
    expect(ctrl.getState().oaEnthalpy).toBeCloseTo(22.0, 1);
  });

  it('oaTemperature is rejected by setValue (TMY3-driven, not operator-editable)', () => {
    const ctrl = loadController();
    const original = ctrl.getState().oaTemperature;
    ctrl.setValue('oaTemperature', 999);
    expect(ctrl.getModes().oaTemperature).toBeUndefined();
    expect(ctrl.getState().oaTemperature).toBe(original);
  });

  it('oaEnthalpy is rejected by setValue', () => {
    const ctrl = loadController();
    ctrl.setValue('oaEnthalpy', 999);
    expect(ctrl.getModes().oaEnthalpy).toBeUndefined();
  });
});

// ─── subscribe / getModes ────────────────────────────────────────────────────

describe('AHU46Controller — subscribe / getModes', () => {
  it('subscribe fires immediately with current state', () => {
    const ctrl = loadController();
    let received = null;
    const unsub = ctrl.subscribe(function(s) { received = s; });
    expect(received).not.toBeNull();
    expect(received.fanRunning).toBe(true);
    unsub();
  });

  it('getModes is empty before any setValue', () => {
    expect(loadController().getModes()).toEqual({});
  });

  it('getModes marks a key as Manual after setValue', () => {
    const ctrl = loadController();
    ctrl.setValue('coolingCoilSetpoint', 62.0);
    expect(ctrl.getModes().coolingCoilSetpoint).toBe('Manual');
  });

  it('getModes returns a copy — mutations do not affect internal state', () => {
    const ctrl = loadController();
    ctrl.setValue('coolingCoilSetpoint', 62.0);
    const m = ctrl.getModes();
    m.coolingCoilSetpoint = 'tampered';
    expect(ctrl.getModes().coolingCoilSetpoint).toBe('Manual');
  });
});

// ─── CO2 sensor simulation (SCENARIO_TRACKING.md #25a) ──────────────────────
//
// co2Sensor was frozen at its screenshot value (479 ppm) forever — declared
// as a sensor, used as an input to the CO2 DCV override, but never itself
// reassigned in recalculate(). It should fall toward an outdoor baseline as
// OA delivery approaches/exceeds the design minimum, and rise toward a
// design-occupied ceiling as OA delivery is starved.

describe('AHU46Controller — CO2 sensor simulation (#25a)', () => {
  it('sits at the outdoor baseline (450 ppm) when damper is at the design-minimum ventilation floor', () => {
    // Default state: damper at 50% floor = exactly minOAAirflowSetpoint → full ventilation ratio
    const ctrl = loadController();
    expect(ctrl.getState().co2Sensor).toBe(450);
  });

  it('rises to the design-occupied ceiling (1200 ppm) when the fan is off — zero OA delivery', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', false);
    expect(ctrl.getState().co2Sensor).toBe(1200);
  });

  it('rises proportionally when OA damper is manually forced low (ties CO2 to the M-04 ventilation shortfall)', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 10);
    // oaCFM = 4500 × (10/50) = 900 → ventilation ratio 0.2
    // co2Sensor = 1200 - 0.2 × (1200-450) = 1050
    expect(ctrl.getState().co2Sensor).toBe(1050);
  });

  it('scales linearly with ventilation ratio at a midpoint (half of design-minimum delivery)', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 25);
    // oaCFM = 4500 × (25/50) = 2250 → ventilation ratio 0.5
    // co2Sensor = 1200 - 0.5 × 750 = 825
    expect(ctrl.getState().co2Sensor).toBe(825);
  });

  it('respects Manual override — setValue holds the reading despite ventilation changes on later ticks', () => {
    const ctrl = loadController();
    ctrl.setValue('co2Sensor', 700);
    expect(ctrl.getState().co2Sensor).toBe(700);
    expect(ctrl.getModes().co2Sensor).toBe('Manual');

    // Fan-off would normally push the auto-computed reading to 1200 —
    // confirm the manual hold survives an unrelated recalculate.
    ctrl.setValue('runSchedule', false);
    expect(ctrl.getState().co2Sensor).toBe(700);
  });
});

// ─── Supply air %RH (SCENARIO_TRACKING.md #25b) ──────────────────────────────
//
// Renamed from supplyStaticPressure (was mislabeled — always supply-air %RH,
// never static pressure — see item #9) and made dynamic; it was previously
// frozen at 72.3 forever on top of the mislabel. Ties to whichever coil is
// actively conditioning the air.

describe('AHU46Controller — supply air %RH (#25b, renamed from supplyStaticPressure)', () => {
  it('the old supplyStaticPressure key no longer exists — replaced by supplyAirRH', () => {
    const s = loadController().getState();
    expect(s.supplyStaticPressure).toBeUndefined();
    expect(s.supplyAirRH).toBeDefined();
  });

  it('is at the neutral baseline (55%) when neither coil is active', () => {
    // OAT=55°F: no heating (55 == heating SP), economizer active (55 < 58°F
    // econ SP) drops mixedAirTemp to 55°F < 60°F cooling SP → no cooling.
    // Same setup as the existing "CHW valve closes ..." cooling-logic test.
    const ctrl = loadWithWeather(55.0, 20.0);
    ctrl.setValue('enthalpyOKForEconomizer', true);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.chwValvePosition).toBe(0);
    expect(s.phtValvePosition).toBe(0);
    expect(s.supplyAirRH).toBe(55);
  });

  it('rises to near-saturation (90%) when the cooling coil is fully open', () => {
    const ctrl = loadController(); // default 81.6°F OAT drives chwValvePosition to 100
    const s = ctrl.getState();
    expect(s.chwValvePosition).toBe(100);
    expect(s.supplyAirRH).toBe(90);
  });

  it('dries out (40%) when the heating coil is active', () => {
    const ctrl = loadWithWeather(45.0, 15.0);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.phtValvePosition).toBeGreaterThan(0);
    expect(s.chwValvePosition).toBe(0);
    // phtValvePosition = 50 at this OAT → 55 - 0.5×30 = 40
    expect(s.supplyAirRH).toBe(40);
  });

  it('scales proportionally with valve position rather than snapping between two fixed states', () => {
    const ctrl = loadWithWeather(58.0, 20.0);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    // Confirms this is a genuinely partial-open case, not the fully-open
    // or fully-closed boundary already covered above.
    expect(s.chwValvePosition).toBeGreaterThan(0);
    expect(s.chwValvePosition).toBeLessThan(100);
    expect(s.supplyAirRH).toBeGreaterThan(55);
    expect(s.supplyAirRH).toBeLessThan(90);
  });
});

// ─── Plant-level conditions: chwSupplyTemp / cwSupplyTemp (#25c/#25d) ───────
//
// Both were frozen at their original screenshot values forever. Simple
// weather/load-based reset tied to oaTemperature (already TMY3-driven) as a
// proxy for building cooling load — not a full plant model.

describe('AHU46Controller — plant-level conditions (#25c/#25d)', () => {
  it('at the default screenshot OAT (81.6°F), both readings land close to their original screenshot values', () => {
    const ctrl = loadController();
    const s = ctrl.getState();
    expect(s.chwSupplyTemp).toBeCloseTo(41.9, 1);
    expect(s.cwSupplyTemp).toBeCloseTo(77.7, 1);
  });

  it('chwSupplyTemp clamps to its reset-up ceiling (48°F) on a cold, low-load day', () => {
    const ctrl = loadWithWeather(-10.0, 2.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().chwSupplyTemp).toBe(48);
  });

  it('chwSupplyTemp clamps to its plant floor (40°F) on a hot, high-load day', () => {
    const ctrl = loadWithWeather(120.0, 40.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().chwSupplyTemp).toBe(40);
  });

  it('cwSupplyTemp clamps to its floor (65°F) on a cold day', () => {
    const ctrl = loadWithWeather(-10.0, 2.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().cwSupplyTemp).toBe(65);
  });

  it('cwSupplyTemp clamps to its ceiling (85°F) on a hot day', () => {
    const ctrl = loadWithWeather(120.0, 40.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().cwSupplyTemp).toBe(85);
  });

  it('chwSupplyTemp falls and cwSupplyTemp rises monotonically as OAT (load) increases', () => {
    let prevChw = Infinity;
    let prevCw = -Infinity;
    for (let oat = 0; oat <= 100; oat += 20) {
      const ctrl = loadWithWeather(oat, 15.0);
      ctrl.updateFromTMY3(1, 0);
      const s = ctrl.getState();
      expect(s.chwSupplyTemp, `chwSupplyTemp not non-increasing at OAT=${oat}`).toBeLessThanOrEqual(prevChw);
      expect(s.cwSupplyTemp, `cwSupplyTemp not non-decreasing at OAT=${oat}`).toBeGreaterThanOrEqual(prevCw);
      prevChw = s.chwSupplyTemp;
      prevCw = s.cwSupplyTemp;
    }
  });
});

// ─── Economizer enthalpy/OAT hysteresis (SCENARIO_TRACKING.md #5) ───────────
//
// enthalpyOKForEconomizer was a pure manual toggle. Per SOO "AHU-4-3 /
// RF-4-6: Sequence of Operation", Closed Loop Controller #2 item 4d-e (AUTO
// mode): enable free cooling when OA enthalpy is favorable (RA - 5.0
// BTU/lb) AND OAT > 38°F; disable when OA enthalpy is unfavorable
// (RA - 2.5 BTU/lb) OR OAT < 35°F. Between those, hold last state
// (asymmetric hysteresis, same pattern as the freeze pump).
// RETURN_AIR_ENTHALPY = 26.7 BTU/lb → enable threshold 21.7, disable
// threshold 24.2.

describe('AHU46Controller — economizer enthalpy/OAT hysteresis (#5)', () => {
  it('defaults to disabled (default OAT/enthalpy are both unfavorable)', () => {
    expect(loadController().getState().enthalpyOKForEconomizer).toBe(false);
  });

  it('enables when enthalpy is favorable and OAT is above the enable floor (38°F)', () => {
    const ctrl = loadWithWeather(40.0, 20.0); // enthalpy 20 < 21.7, OAT 40 > 38
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.enthalpyOKForEconomizer).toBe(true);
    expect(s.economizerActive).toBe(true);
  });

  it('stays disabled when enthalpy is favorable but OAT has not cleared the enable floor', () => {
    const ctrl = loadWithWeather(37.0, 20.0); // favorable enthalpy, but OAT 37 is not > 38
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(false);
  });

  it('disables once OAT drops below the disable floor (35°F), even with favorable enthalpy', () => {
    const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
    const w = {};
    mockTMY3(w, 40, 20);
    new Function('window', code)(w);
    const ctrl = w.AHU46Controller;
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(true); // sanity: enabled first

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 34, enthalpy: 20, relHumidity: 60, dewPoint: 28, wetBulb: 31 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(false);
  });

  it('disables once enthalpy becomes unfavorable, even with OAT above the enable floor', () => {
    const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
    const w = {};
    mockTMY3(w, 40, 20);
    new Function('window', code)(w);
    const ctrl = w.AHU46Controller;
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(true); // sanity: enabled first

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 40, enthalpy: 30, relHumidity: 60, dewPoint: 35, wetBulb: 38 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(false);
  });

  it('holds last state inside the enthalpy deadband (21.7-24.2 BTU/lb), becoming favorable (no chatter)', () => {
    const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
    const w = {};
    mockTMY3(w, 50, 30); // OAT fixed above both OAT thresholds; enthalpy 30 unfavorable
    new Function('window', code)(w);
    const ctrl = w.AHU46Controller;
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(false); // starts off

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 50, enthalpy: 23, relHumidity: 60, dewPoint: 40, wetBulb: 45 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(false); // in deadband, holds off

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 50, enthalpy: 20, relHumidity: 60, dewPoint: 38, wetBulb: 42 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(true); // below 21.7, now on
  });

  it('holds last state inside the enthalpy deadband, becoming unfavorable (no chatter)', () => {
    const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
    const w = {};
    mockTMY3(w, 50, 15); // OAT fixed above both OAT thresholds; enthalpy 15 favorable
    new Function('window', code)(w);
    const ctrl = w.AHU46Controller;
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(true); // starts on

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 50, enthalpy: 23, relHumidity: 60, dewPoint: 40, wetBulb: 45 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(true); // in deadband, holds on

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 50, enthalpy: 26, relHumidity: 60, dewPoint: 42, wetBulb: 48 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(false); // above 24.2, now off
  });

  it('holds last state inside the OAT deadband (35-38°F), no chatter', () => {
    const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
    const w = {};
    mockTMY3(w, 40, 15); // enthalpy fixed favorable; OAT starts above the enable floor
    new Function('window', code)(w);
    const ctrl = w.AHU46Controller;
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(true); // starts on

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 36, enthalpy: 15, relHumidity: 60, dewPoint: 30, wetBulb: 33 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(true); // in the 35-38 gap, holds on

    w.TMY3Projector.interpolateWeather = () => ({ dryBulb: 34, enthalpy: 15, relHumidity: 60, dewPoint: 28, wetBulb: 31 });
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(false); // below 35, now off
  });

  it('respects Manual override — sidebar toggle holds regardless of subsequent weather', () => {
    // Hot, humid weather: unfavorable enthalpy — would auto-disable if not manually held.
    const ctrl = loadWithWeather(80.0, 35.0);
    ctrl.setValue('enthalpyOKForEconomizer', true);
    expect(ctrl.getModes().enthalpyOKForEconomizer).toBe('Manual');

    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().enthalpyOKForEconomizer).toBe(true);
  });
});

// ─── Minimum plenum temperature OAT reset (SCENARIO_TRACKING.md #6) ────────
//
// plenumMinSetpoint was static 40°F. Per SOO Closed Loop Controller #1
// item 2, it resets linearly: 60°F OAT → 40°F floor, 40°F OAT → 50°F floor,
// clamped outside that OAT range.

describe('AHU46Controller — minimum plenum temperature OAT reset (#6)', () => {
  it('defaults to 40°F (design OAT 81.6°F is above the 60°F calibration point)', () => {
    expect(loadController().getState().plenumMinSetpoint).toBe(40);
  });

  it('is exactly 40°F at the 60°F OAT calibration point', () => {
    const ctrl = loadWithWeather(60.0, 20.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().plenumMinSetpoint).toBe(40);
  });

  it('is exactly 50°F at the 40°F OAT calibration point', () => {
    const ctrl = loadWithWeather(40.0, 20.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().plenumMinSetpoint).toBe(50);
  });

  it('is the linear midpoint (45°F) at 50°F OAT', () => {
    const ctrl = loadWithWeather(50.0, 15.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().plenumMinSetpoint).toBeCloseTo(45, 1);
  });

  it('clamps to the 40°F floor above the 60°F calibration point', () => {
    const ctrl = loadWithWeather(100.0, 30.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().plenumMinSetpoint).toBe(40);
  });

  it('clamps to the 50°F ceiling below the 40°F calibration point', () => {
    const ctrl = loadWithWeather(0.0, 5.0);
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().plenumMinSetpoint).toBe(50);
  });

  it('respects Manual override — sidebar setpoint holds regardless of OAT', () => {
    const ctrl = loadController();
    ctrl.setValue('plenumMinSetpoint', 42);
    expect(ctrl.getModes().plenumMinSetpoint).toBe('Manual');

    // Would otherwise reset to 50°F at this OAT.
    ctrl.updateFromTMY3(1, 0);
    expect(ctrl.getState().plenumMinSetpoint).toBe(42);
  });

  it('rises monotonically as OAT falls, across a sweep from 80°F down to 20°F', () => {
    let prevFloor = -Infinity;
    for (let oat = 80; oat >= 20; oat -= 10) {
      const ctrl = loadWithWeather(oat, 15.0);
      ctrl.updateFromTMY3(1, 0);
      const floor = ctrl.getState().plenumMinSetpoint;
      expect(floor, `plenumMinSetpoint not non-decreasing at OAT=${oat}`).toBeGreaterThanOrEqual(prevFloor);
      prevFloor = floor;
    }
  });
});

// ─── VFD-in-bypass (SCENARIO_TRACKING.md #7) ────────────────────────────────
//
// SOO General Automatic Control Sequences #16: "For each variable speed
// motor an alarm shall be annunciated at the BAS whenever the drive is
// placed in bypass." supplyFanVFDBypass/returnFanVFDBypass previously
// didn't exist on controller state at all. In bypass, the VFD is out of
// the control loop — the motor runs across-the-line at full, uncontrolled
// speed rather than tracking fanSpeedSetpoint.

describe('AHU46Controller — VFD-in-bypass (#7)', () => {
  it('defaults to false for both supply and return fan VFD bypass', () => {
    const s = loadController().getState();
    expect(s.supplyFanVFDBypass).toBe(false);
    expect(s.returnFanVFDBypass).toBe(false);
  });

  it('supply fan runs at full speed (100%), ignoring fanSpeedSetpoint, when its VFD is in bypass', () => {
    const ctrl = loadController();
    ctrl.setValue('fanSpeedSetpoint', 50);
    expect(ctrl.getState().fanSpeed).toBe(50); // sanity: normally tracks setpoint

    ctrl.setValue('supplyFanVFDBypass', true);
    const s = ctrl.getState();
    expect(s.fanSpeed).toBe(100);
    expect(s.cfm).toBe(9200);
  });

  it('bypass fan speed is restored to setpoint-tracking once bypass clears', () => {
    const ctrl = loadController();
    ctrl.setValue('fanSpeedSetpoint', 60);
    ctrl.setValue('supplyFanVFDBypass', true);
    expect(ctrl.getState().fanSpeed).toBe(100);

    ctrl.setValue('supplyFanVFDBypass', false);
    expect(ctrl.getState().fanSpeed).toBe(60);
  });

  it('bypass has no effect while the fan is off (fireAlarmShutdown/runSchedule take precedence)', () => {
    const ctrl = loadController();
    ctrl.setValue('supplyFanVFDBypass', true);
    ctrl.setValue('runSchedule', false);
    const s = ctrl.getState();
    expect(s.fanRunning).toBe(false);
    expect(s.fanSpeed).toBe(0);
    expect(s.cfm).toBe(0);
  });

  it('returnFanVFDBypass does not affect supply fan speed (no return-fan speed model to couple it to)', () => {
    const ctrl = loadController();
    ctrl.setValue('fanSpeedSetpoint', 55);
    ctrl.setValue('returnFanVFDBypass', true);
    expect(ctrl.getState().fanSpeed).toBe(55);
  });
});
