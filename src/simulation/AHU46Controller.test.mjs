/**
 * Unit tests for AHU46Controller.js
 * Meeting Room 2nd Level — formula-driven controller.
 *
 * Key difference under test: OA_DAMPER_FLOOR = 50% (meeting room), not 20%.
 * Per the SOO's own min/max CFM table (4,500/9,000 CFM = 50%) — see
 * SCENARIO_TRACKING.md item #14. Was previously 60%, which matched neither
 * the SOO table nor minOAAirflowSetpoint (4,500 CFM).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

function loadController() {
  const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
  const w = {};
  new Function('window', code)(w);
  return w.AHU46Controller;
}

function mockTMY3(w, dryBulb, enthalpy, relHumidity) {
  if (relHumidity === undefined) relHumidity = 60;
  w.TMY3Projector = {
    interpolateWeather: function() {
      return { dryBulb, enthalpy, relHumidity, dewPoint: 55, wetBulb: 62 };
    }
  };
}

function loadWithWeather(dryBulb, enthalpy, relHumidity) {
  const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
  const w = {};
  mockTMY3(w, dryBulb, enthalpy, relHumidity);
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

  it('clearing a fire alarm re-triggers the staged start sequence, not an instant return to running (SOO System Start #1-2)', () => {
    // Was: instant fanRunning=true right after the alarm cleared. Per the
    // staged fan-start sequence added for SCENARIO_TRACKING.md item #8, a
    // fire-alarm clear is just another rising edge on the run command —
    // it re-triggers the full staged sequence rather than snapping back to
    // running. See the "staged fan-start sequence (#8)" describe block
    // below for the sequence's own detailed tests.
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('fireAlarmShutdown', true);
      ctrl.setValue('fireAlarmShutdown', false);
      const s = ctrl.getState();
      expect(s.systemStarting).toBe(true);
      expect(s.fanRunning).toBe(false);
      expect(s.interlockOn).toBe(false);
      expect(s.exhaustFanOn).toBe(false);
      expect(s.commonDamperOpen).toBe(false);

      vi.advanceTimersByTime((ctrl.getState().startingTimeSetpoint + 1) * 1000);
      ctrl.recalculate();
      const s2 = ctrl.getState();
      expect(s2.systemStarting).toBe(false);
      expect(s2.fanRunning).toBe(true);
      expect(s2.interlockOn).toBe(true);
      expect(s2.exhaustFanOn).toBe(true);
      expect(s2.commonDamperOpen).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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

// ─── Staged fan-start sequence (SCENARIO_TRACKING.md #8 / #25e) ────────────
//
// SOO System Start #1-2: a start command doesn't snap straight to running.
// Default startingTimeSetpoint (480s) breaks down as 90s damper-travel/SF
// delay, 2min SF ramp (→ t=210s), 30s RF delay (→ t=240s), then RF holds ON
// through a 2min VAV-poll hold (→ t=480s) before the economizer/CO₂ DCV
// regain authority. Real wall-clock seconds — tests use vi.useFakeTimers()
// to advance through the sequence without actually waiting.

describe('AHU46Controller — staged fan-start sequence (#8)', () => {
  it('boots up already running by default — no staging on initial load', () => {
    const s = loadController().getState();
    expect(s.systemStarting).toBe(false);
    expect(s.startingTimeLeft).toBe(0);
    expect(s.fanRunning).toBe(true);
  });

  it('a runSchedule off→on edge triggers staging instead of an instant restart', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      expect(ctrl.getState().systemStarting).toBe(false); // off is still instant, no staging to turn off

      ctrl.setValue('runSchedule', true);
      const s = ctrl.getState();
      expect(s.systemStarting).toBe(true);
      expect(s.fanRunning).toBe(false);
      expect(s.startingTimeLeft).toBe(480);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stage 1 (0-90s): OA damper travels toward the floor while SF/RF stay off', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      ctrl.setValue('runSchedule', true);

      vi.advanceTimersByTime(45 * 1000); // halfway through the 90s delay
      ctrl.recalculate();
      const s = ctrl.getState();
      expect(s.fanRunning).toBe(false);
      expect(s.supplyFanStatus).toBe('OFF');
      expect(s.returnFanStatus).toBe('OFF');
      expect(s.oaDamperPosition).toBe(25); // 50% floor × 45/90
      expect(s.startingTimeLeft).toBe(435);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stage 2 (90-210s): SF ramps from the min-position lock speed to setpoint; RF still off', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      ctrl.setValue('runSchedule', true);

      vi.advanceTimersByTime(150 * 1000); // halfway through the 120s ramp (90+60)
      ctrl.recalculate();
      const s = ctrl.getState();
      expect(s.fanRunning).toBe(true);
      expect(s.supplyFanStatus).toBe('ON');
      expect(s.returnFanStatus).toBe('OFF');
      expect(s.fanSpeed).toBe(40); // 5 + 0.5×(75-5) — minPositionFanSpeedLock to setpoint
      expect(s.cfm).toBe(3680);
      expect(s.oaDamperPosition).toBe(50); // held at floor throughout the ramp
    } finally {
      vi.useRealTimers();
    }
  });

  it('stage 3+ (240-480s): RF comes on, SF holds at setpoint, damper still held at floor', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      ctrl.setValue('runSchedule', true);

      vi.advanceTimersByTime(300 * 1000);
      ctrl.recalculate();
      const s = ctrl.getState();
      expect(s.fanRunning).toBe(true);
      expect(s.returnFanStatus).toBe('ON');
      expect(s.fanSpeed).toBe(75);
      expect(s.cfm).toBe(6900);
      expect(s.oaDamperPosition).toBe(50);
      expect(s.startingTimeLeft).toBe(180);
    } finally {
      vi.useRealTimers();
    }
  });

  it('economizer/CO₂ DCV have no authority during staging, even when conditions would otherwise trigger them', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('co2Sensor', 2000); // would normally force the damper well above the floor
      ctrl.setValue('enthalpyOKForEconomizer', true); // would normally trigger the economizer
      ctrl.setValue('runSchedule', false);
      ctrl.setValue('runSchedule', true);

      vi.advanceTimersByTime(300 * 1000); // deep into the sequence, SF/RF both on
      ctrl.recalculate();
      const s = ctrl.getState();
      expect(s.economizerActive).toBe(false);
      expect(s.oaDamperPosition).toBe(50); // pinned at the floor, not pushed up by CO₂ DCV
    } finally {
      vi.useRealTimers();
    }
  });

  it('completes at startingTimeSetpoint and hands off cleanly to normal running logic', () => {
    // Note on fanSpeed here (SCENARIO_TRACKING.md item #9): the duct
    // static pressure loop reads chwValvePosition from the PREVIOUS tick
    // as its load proxy. The fan being off for stage 1 (and for the
    // runSchedule=false blip before that) zeroed chwValvePosition on the
    // tick just before this one, so the very first tick of normal running
    // still sees that stale zero and lands on a lower speed — it only
    // reaches the coil's actual (100%, since nothing else changed)
    // demand one tick later. This is expected lag, same as any real
    // control loop only ever acting on its last measurement — not a bug.
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      ctrl.setValue('runSchedule', true);

      vi.advanceTimersByTime(481 * 1000);
      ctrl.recalculate();
      const s = ctrl.getState();
      expect(s.systemStarting).toBe(false);
      expect(s.startingTimeLeft).toBe(0);
      expect(s.fanRunning).toBe(true);
      expect(s.interlockOn).toBe(true);

      ctrl.recalculate(); // one more tick to let the pressure loop catch up
      expect(ctrl.getState().fanSpeed).toBe(75);
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts immediately on a fire-alarm trip mid-sequence, and a later restart begins fresh (not resumed)', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      ctrl.setValue('runSchedule', true);
      vi.advanceTimersByTime(150 * 1000); // mid SF-ramp — fan already spinning
      ctrl.recalculate();
      expect(ctrl.getState().fanRunning).toBe(true);

      ctrl.setValue('fireAlarmShutdown', true);
      var aborted = ctrl.getState();
      expect(aborted.fanRunning).toBe(false);
      expect(aborted.systemStarting).toBe(false);
      expect(aborted.startingTimeLeft).toBe(0);

      ctrl.setValue('fireAlarmShutdown', false); // restart — should NOT resume at the old 150s mark
      var restarted = ctrl.getState();
      expect(restarted.systemStarting).toBe(true);
      expect(restarted.fanRunning).toBe(false);
      expect(restarted.oaDamperPosition).toBe(0); // fresh stage 1, not the 50% it held before the trip
    } finally {
      vi.useRealTimers();
    }
  });

  it('scales all stage boundaries proportionally when startingTimeSetpoint is adjusted', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('startingTimeSetpoint', 48); // 10× faster — SF delay now 9s, not 90s
      ctrl.setValue('runSchedule', false);
      ctrl.setValue('runSchedule', true);

      vi.advanceTimersByTime(8500); // 8.5s — still inside the shortened delay
      ctrl.recalculate();
      expect(ctrl.getState().fanRunning).toBe(false);

      vi.advanceTimersByTime(1000); // 9.5s — past the shortened 9s delay
      ctrl.recalculate();
      expect(ctrl.getState().fanRunning).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('M-04 does not spuriously fire during staging — the damper never reports below the floor once the fan is on', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      ctrl.setValue('runSchedule', true);
      vi.advanceTimersByTime(150 * 1000);
      ctrl.recalculate();
      const s = ctrl.getState();
      expect(s.fanRunning).toBe(true);
      expect(s.oaDamperPosition).toBeGreaterThanOrEqual(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it('co2Sensor reflects a genuinely-off unit through stage 1, then recovers once stage 2 restores ventilation', () => {
    // Investigated during live-app testing: an off→on cycle shows co2Sensor
    // already at the design-occupied ceiling before the restart (correct —
    // #25a's model has fanRunning=false imply zero ventilation), and stage
    // 1's fan-off delay simply carries that already-elevated reading —
    // it's not a new artifact of staging. It self-corrects once stage 2
    // brings the fan back on.
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      expect(ctrl.getState().co2Sensor).toBe(1200);

      ctrl.setValue('runSchedule', true); // rising edge — staging begins
      const s = ctrl.getState();
      expect(s.systemStarting).toBe(true);
      expect(s.fanRunning).toBe(false);
      expect(s.co2Sensor).toBe(1200); // still off in stage 1, correctly still elevated

      vi.advanceTimersByTime(150 * 1000); // into stage 2 — fan now on
      ctrl.recalculate();
      const s2 = ctrl.getState();
      expect(s2.fanRunning).toBe(true);
      expect(s2.co2Sensor).toBeLessThan(1200); // recovering now that ventilation has resumed
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── Duct static pressure control (SCENARIO_TRACKING.md #9) ────────────────
//
// SOO Closed Loop Controller #5: SF VFD speed is modulated to hold duct
// static pressure at an adjustable setpoint (default 1.0 in w.c.), rising
// as zone cooling demand (proxied here by chwValvePosition, since there's
// no zone-level VAV model) opens dampers and drops pressure. The loop reads
// chwValvePosition from the PREVIOUS tick — same lag as any real control
// loop only ever acting on its last measurement — so tests that change load
// conditions call updateFromTMY3/recalculate() twice: once to let
// chwValvePosition settle, once more for the pressure loop to react to it.

describe('AHU46Controller — duct static pressure control (#9)', () => {
  it('defaults to the setpoint (1.0 in w.c.) at 75% fan speed — matches the original screenshot default', () => {
    const s = loadController().getState();
    expect(s.fanSpeed).toBe(75);
    expect(s.ductStaticPressure).toBeCloseTo(1.0, 1);
    expect(s.cfm).toBeCloseTo(6900, -2);
  });

  it('fan speed rises with cooling demand and falls as demand eases', () => {
    const hot = loadWithWeather(90.0, 30.0); // well above cooling SP -> chwValvePosition saturates at 100
    hot.updateFromTMY3(1, 0);
    hot.updateFromTMY3(1, 0); // let the pressure loop react to the settled chwValvePosition
    expect(hot.getState().chwValvePosition).toBe(100);
    const hotSpeed = hot.getState().fanSpeed;

    const cool = loadWithWeather(55.0, 20.0); // same setup as the existing "CHW valve closes" test
    cool.setValue('enthalpyOKForEconomizer', true);
    cool.updateFromTMY3(1, 0);
    cool.updateFromTMY3(1, 0);
    expect(cool.getState().chwValvePosition).toBe(0);
    const coolSpeed = cool.getState().fanSpeed;

    expect(hotSpeed).toBeGreaterThan(coolSpeed);
  });

  it('ductStaticPressure converges toward a new setpoint when it is adjusted', () => {
    const ctrl = loadController();
    ctrl.setValue('ductStaticPressureSetpoint', 0.5);
    ctrl.recalculate(); // let the loop react to the new setpoint
    const s = ctrl.getState();
    expect(s.ductStaticPressure).toBeCloseTo(0.5, 1);
    expect(s.fanSpeed).toBeLessThan(75); // lower setpoint -> lower speed at the same demand
  });

  it('Manual override on fanSpeedSetpoint bypasses the pressure loop entirely', () => {
    const ctrl = loadController();
    ctrl.setValue('fanSpeedSetpoint', 60);
    const s = ctrl.getState();
    expect(s.fanSpeed).toBe(60);
    expect(ctrl.getModes().fanSpeedSetpoint).toBe('Manual');
    // Sensor still reflects reality — the loop isn't tracking, so this
    // won't generally equal ductStaticPressureSetpoint (1.0).
    expect(s.ductStaticPressure).not.toBeCloseTo(1.0, 1);
  });

  it('VFD bypass forces 100% speed regardless of the pressure loop, and the pressure reading follows', () => {
    const ctrl = loadController();
    ctrl.setValue('supplyFanVFDBypass', true);
    const s = ctrl.getState();
    expect(s.fanSpeed).toBe(100);
    expect(s.ductStaticPressure).toBeGreaterThan(1.0); // full speed overshoots the setpoint
  });

  it('ductStaticPressure is 0 when the fan is off', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', false);
    expect(ctrl.getState().ductStaticPressure).toBe(0);
  });

  it('clamps the solved speed to the minPositionFanSpeedLock floor at a very low setpoint', () => {
    const ctrl = loadController();
    ctrl.setValue('ductStaticPressureSetpoint', 0.001); // unrealistically low — unclamped solve would be ~2.4%
    ctrl.recalculate();
    expect(ctrl.getState().fanSpeed).toBe(ctrl.getState().minPositionFanSpeedLock);
  });

  it('clamps the solved speed to 100% at a very high setpoint under full demand', () => {
    const ctrl = loadController(); // default chwValvePosition is already 100
    ctrl.setValue('ductStaticPressureSetpoint', 3.0);
    ctrl.recalculate();
    expect(ctrl.getState().fanSpeed).toBe(100);
  });
});

// ─── Return fan flow tracking (SCENARIO_TRACKING.md #10) ───────────────────
//
// SOO Closed Loop Controller #6: RF VFD speed tracks a flow setpoint
// "dynamically calculated at 90% (adjustable) of the supply fan's flow."

describe('AHU46Controller — return fan flow tracking (#10)', () => {
  it('defaults to 90% of supply CFM once running', () => {
    const s = loadController().getState();
    expect(s.returnFanStatus).toBe('ON');
    expect(s.returnFanCFM).toBe(Math.round(s.cfm * 0.9));
  });

  it('is 0 when the fan is off', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', false);
    expect(ctrl.getState().returnFanCFM).toBe(0);
  });

  it('scales with supply CFM when fanSpeedSetpoint is manually changed', () => {
    const ctrl = loadController();
    ctrl.setValue('fanSpeedSetpoint', 50);
    const s = ctrl.getState();
    expect(s.cfm).toBeCloseTo(4600, -1);
    expect(s.returnFanCFM).toBe(Math.round(s.cfm * 0.9));
  });

  it('respects an adjusted returnFanFlowTrackingSetpoint', () => {
    const ctrl = loadController();
    ctrl.setValue('returnFanFlowTrackingSetpoint', 80);
    const s = ctrl.getState();
    expect(s.returnFanCFM).toBe(Math.round(s.cfm * 0.8));
  });

  it('returnFanVFDBypass forces full design CFM, ignoring the tracking setpoint', () => {
    const ctrl = loadController();
    ctrl.setValue('returnFanVFDBypass', true);
    expect(ctrl.getState().returnFanCFM).toBe(9200);
  });

  it('stays 0 through stage 1-3 of a staged start and only tracks flow once RF actually comes on', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      ctrl.setValue('runSchedule', true);

      vi.advanceTimersByTime(150 * 1000); // SF ramping, RF still off
      ctrl.recalculate();
      let s = ctrl.getState();
      expect(s.returnFanStatus).toBe('OFF');
      expect(s.returnFanCFM).toBe(0);

      vi.advanceTimersByTime(150 * 1000); // t=300s — past the RF delay
      ctrl.recalculate();
      s = ctrl.getState();
      expect(s.returnFanStatus).toBe('ON');
      expect(s.returnFanCFM).toBe(Math.round(s.cfm * 0.9));
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── Return air / spill dampers (SCENARIO_TRACKING.md #11) ─────────────────
//
// SOO Closed Loop Controller #8 item 11a-b: "The mixed air dampers consist
// of three modulating dampers that shall be together controlled..." Only
// the OA damper was modeled. Per 11b, the return air damper (N.C.) is
// complementary to the OA damper, and the spill damper (N.O.) tracks it
// directly ("shall gradually open upon a demand for additional fresh air
// as the return damper closes accordingly").

describe('AHU46Controller — return air / spill dampers (#11)', () => {
  it('default: complementary to the OA damper floor (50/50)', () => {
    const s = loadController().getState();
    expect(s.oaDamperPosition).toBe(50);
    expect(s.returnAirDamperPosition).toBe(50);
    expect(s.spillDamperPosition).toBe(50);
  });

  it('both close fully when the fan is off — not the naive complementary value', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', false);
    const s = ctrl.getState();
    expect(s.oaDamperPosition).toBe(0);
    expect(s.returnAirDamperPosition).toBe(0);
    expect(s.spillDamperPosition).toBe(0); // NOT 100 (the naive 100 - 0 complementary result)
  });

  it('economizer fully open: return air damper fully closed, spill fully open', () => {
    const ctrl = loadWithWeather(40.0, 10.0);
    ctrl.setValue('enthalpyOKForEconomizer', true);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.oaDamperPosition).toBe(100);
    expect(s.returnAirDamperPosition).toBe(0);
    expect(s.spillDamperPosition).toBe(100);
  });

  it('tracks a manually-forced OA damper position', () => {
    const ctrl = loadController();
    ctrl.setValue('oaDamperPosition', 30);
    const s = ctrl.getState();
    expect(s.returnAirDamperPosition).toBe(70);
    expect(s.spillDamperPosition).toBe(30);
  });

  it('OA + return air damper always sum to 100 while the fan is running, across a sweep', () => {
    for (let oat = -10; oat <= 100; oat += 10) {
      const ctrl = loadWithWeather(oat, 15.0);
      ctrl.updateFromTMY3(1, 0);
      const s = ctrl.getState();
      expect(s.oaDamperPosition + s.returnAirDamperPosition, `at OAT=${oat}`).toBe(100);
      expect(s.spillDamperPosition, `at OAT=${oat}`).toBe(s.oaDamperPosition);
    }
  });

  it('both close during stage 1 of a staged start (fan not yet on)', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      ctrl.setValue('runSchedule', true);
      vi.advanceTimersByTime(45 * 1000); // mid stage 1 — fan still off
      ctrl.recalculate();
      const s = ctrl.getState();
      expect(s.fanRunning).toBe(false);
      expect(s.returnAirDamperPosition).toBe(0);
      expect(s.spillDamperPosition).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── Return air conditions (SCENARIO_TRACKING.md #12) ───────────────────────
//
// returnAirTemp was a hardcoded constant despite being a live sensor point
// (THS-4). Now modeled as supplyAirTemp + a fixed space-heat-gain rise,
// read from the PREVIOUS tick (same lag pattern as item #9 — this tick's
// supplyAirTemp depends on mixedAirTemp, which depends on returnAirTemp).
// returnAirRH — REVISED from its original batch: initially modeled as a
// flat 50%, per the SOO's citation that it's "maintained at 50%." That
// citation actually describes the RESULT of item #13's automatic reset
// loop continuously correcting it back toward 50%, not a trivially
// constant value — see the "return air %RH + automatic cooling setpoint
// reset (#13)" describe block below for the full revised model and why.
// returnFanCFM (item #10) already doubles as the AFMS-2 return-flow
// reading the SOO describes, so no separate field was added for that.

describe('AHU46Controller — return air conditions (#12)', () => {
  it('returnAirTemp defaults to ~72.2°F — matches the original screenshot (72.1°F) almost exactly', () => {
    const s = loadController().getState();
    expect(s.returnAirTemp).toBeCloseTo(72.1, 0);
    expect(s.supplyAirTemp).toBe(60); // cooling coil saturated at setpoint by default
  });

  it('returnAirTemp responds to a milder heating-call day, settling below the default', () => {
    const ctrl = loadWithWeather(50.0, 15.0);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.returnAirTemp).toBeCloseTo(68.5, 1);
    expect(s.returnAirTemp).toBeLessThan(72.2);
  });

  it('clamps to the 85°F ceiling on a deep-cold day (preheat-saturation feedback pushes it up, not down)', () => {
    // Counterintuitive but correct: once the preheat valve saturates at
    // 100%, the preheat coil discharge temp is a fixed 75°F regardless of
    // how cold OAT actually is (existing heating-logic behavior, not new
    // here), so the returnAirTemp feedback loop settles high rather than
    // low on extreme-cold days. RETURN_AIR_TEMP_MIN exists as a defensive
    // bound but isn't reachable through this model's own formulas.
    const ctrl = loadWithWeather(-20.0, 1.0);
    ctrl.updateFromTMY3(1, 0);
    const s = ctrl.getState();
    expect(s.phtValvePosition).toBe(100);
    expect(s.returnAirTemp).toBe(85);
  });

  it('feeds into mixedAirTemp the same way the old constant did (one-tick-lagged, not circular)', () => {
    const ctrl = loadController();
    const s = ctrl.getState();
    // At the floor (50/50 OA/RA split): mixedAirTemp = preheatTemp*0.5 + returnAirTemp*0.5
    expect(s.mixedAirTemp).toBeCloseTo((s.preheatTemp * 0.5 + s.returnAirTemp * 0.5), 1);
  });
});

// ─── Return air %RH + automatic cooling setpoint reset (SCENARIO_TRACKING.md #13) ──
//
// returnAirRH REVISED from item #12's original batch (was a flat 50%) —
// per SOO Closed Loop Controller #4, that 50% is the RESULT of this
// item's automatic reset loop continuously correcting it, not a
// trivially-constant value. Now a disturbance-driven reading: outdoor
// humidity (scaled by ventilation fraction) pulls it away from 50%, the
// cooling coil's own dehumidification pulls it back down.
//
// coolingSetpointMode ('Manual'/'Automatic', SOO Closed Loop Controller
// #3) defaults to 'Manual' — the model previously only had this mode —
// so every prior batch's calibration that assumes coolingCoilSetpoint=60
// (the duct pressure loop's #9 75%-speed target, returnAirTemp's #12
// 72.2°F default) is unaffected unless an operator actively switches
// modes. In 'Automatic', coolingCoilSetpoint resets linearly between the
// SOO's cited 50°F (humid)/60°F (dry) bounds based on returnAirRH.

describe('AHU46Controller — return air %RH + automatic cooling setpoint reset (#13)', () => {
  it('coolingSetpointMode defaults to Manual — zero ripple to prior calibrations', () => {
    const s = loadController().getState();
    expect(s.coolingSetpointMode).toBe('Manual');
    expect(s.coolingCoilSetpoint).toBe(60);
    expect(s.fanSpeed).toBe(75);              // item #9's calibration
    expect(s.returnAirTemp).toBeCloseTo(72.1, 0); // item #12's calibration
  });

  it('returnAirRH rises with outdoor humidity and falls with dryness, scaled by ventilation', () => {
    const humid = loadWithWeather(85.0, 30.0, 90);
    humid.updateFromTMY3(1, 0);
    const dry = loadWithWeather(85.0, 30.0, 15);
    dry.updateFromTMY3(1, 0);
    expect(humid.getState().returnAirRH).toBeGreaterThan(dry.getState().returnAirRH);
  });

  it('returnAirRH is unaffected by coolingSetpointMode — it is a sensor reading, not a setpoint', () => {
    const manual = loadWithWeather(85.0, 30.0, 90);
    manual.updateFromTMY3(1, 0);

    const auto = loadWithWeather(85.0, 30.0, 90);
    auto.setValue('coolingSetpointMode', 'Automatic');
    auto.updateFromTMY3(1, 0);
    auto.updateFromTMY3(1, 0);

    expect(manual.getState().returnAirRH).toBe(auto.getState().returnAirRH);
  });

  it('Manual mode: coolingCoilSetpoint stays exactly at the operator value regardless of RH swings', () => {
    const humid = loadWithWeather(85.0, 30.0, 90);
    humid.updateFromTMY3(1, 0);
    expect(humid.getState().coolingCoilSetpoint).toBe(60);

    const dry = loadWithWeather(85.0, 30.0, 15);
    dry.updateFromTMY3(1, 0);
    expect(dry.getState().coolingCoilSetpoint).toBe(60);
  });

  it('Automatic mode: resets colder on a humid day, warmer on a dry day', () => {
    const humid = loadWithWeather(85.0, 30.0, 90);
    humid.setValue('coolingSetpointMode', 'Automatic');
    humid.updateFromTMY3(1, 0);
    humid.updateFromTMY3(1, 0);

    const dry = loadWithWeather(85.0, 30.0, 15);
    dry.setValue('coolingSetpointMode', 'Automatic');
    dry.updateFromTMY3(1, 0);
    dry.updateFromTMY3(1, 0);

    expect(humid.getState().coolingCoilSetpoint).toBeLessThan(dry.getState().coolingCoilSetpoint);
    expect(humid.getState().coolingCoilSetpoint).toBeGreaterThanOrEqual(50);
    expect(dry.getState().coolingCoilSetpoint).toBeLessThanOrEqual(60);
  });

  it('returnAirRH clamps to the 30-70% bounds at the extremes (full ventilation, no dehumidification)', () => {
    const wet = loadWithWeather(45.0, 10.0, 100);
    wet.setValue('enthalpyOKForEconomizer', true); // -> economizer active, damper 100%
    wet.updateFromTMY3(1, 0);
    const s1 = wet.getState();
    expect(s1.oaDamperPosition).toBe(100);
    expect(s1.chwValvePosition).toBe(0); // heating active, cooling deferred (SOO #10 mutual exclusivity)
    expect(s1.returnAirRH).toBe(70);

    const dryAir = loadWithWeather(45.0, 10.0, 0);
    dryAir.setValue('enthalpyOKForEconomizer', true);
    dryAir.updateFromTMY3(1, 0);
    expect(dryAir.getState().returnAirRH).toBe(30);
  });

  it('Automatic mode reset is stable across ticks — no oscillation', () => {
    const ctrl = loadWithWeather(85.0, 30.0, 70);
    ctrl.setValue('coolingSetpointMode', 'Automatic');
    const values = [];
    for (let i = 0; i < 6; i++) {
      ctrl.updateFromTMY3(1, 0);
      values.push(ctrl.getState().coolingCoilSetpoint);
    }
    expect(values[4]).toBe(values[5]); // settled by the last two ticks
  });
});

// ─── Safety/interlock layer: freezestat (SOO Safeties item 4) ──────────────
//
// "A freezestat with its element serpentined across the inlet side of the
// cooling coil will shut down the supply fan by hardwired time delayed
// interlock... open the heating coil control valve 100% and activate a
// critical alarm at the BMS... a hardwired time delayed relay... provide
// 3 minutes (adjustable) delay prior to supply fan shutdown... a manual
// reset shall be required." SCENARIO_TRACKING.md item #22.

describe('AHU46Controller — freezestat shutdown sequence', () => {
  it('trips instantaneously but does not shut down until the delay elapses', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      const S = ctrl.getState.__proto__; // no-op, kept for symmetry with other blocks
      ctrl.setValue('freezestatDelaySetpoint', 5);
      ctrl.recalculate();
      // Force a cold coil-inlet reading directly (mixedAirTemp is normally
      // computed by cooling logic each tick, but we're testing the trip
      // detector in isolation, same technique used by loadWithWeather()
      // elsewhere in this file for injecting a specific condition).
      const w = {};
      const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
      new Function('window', code)(w);
      w.AHU46Controller.setValue('freezestatDelaySetpoint', 5);
      w.AHU46State.mixedAirTemp = 20;
      w.AHU46Controller.recalculate();
      let s = w.AHU46Controller.getState();
      expect(s.freezestatTripped).toBe(true);
      expect(s.freezestatShutdown).toBe(false);

      vi.advanceTimersByTime(6000);
      w.AHU46State.mixedAirTemp = 20; // still cold — re-inject since cooling logic recomputed it
      w.AHU46Controller.recalculate();
      s = w.AHU46Controller.getState();
      expect(s.freezestatShutdown).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('forces fan off, heating valve 100% open, and cooling valve closed once latched', () => {
    vi.useFakeTimers();
    try {
      const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
      const w = {};
      new Function('window', code)(w);
      w.AHU46Controller.setValue('freezestatDelaySetpoint', 5);
      w.AHU46State.mixedAirTemp = 20;
      w.AHU46Controller.recalculate();
      vi.advanceTimersByTime(6000);
      w.AHU46State.mixedAirTemp = 20;
      w.AHU46Controller.recalculate();
      const s = w.AHU46Controller.getState();
      expect(s.freezestatShutdown).toBe(true);
      expect(s.fanRunning).toBe(false);
      expect(s.phtValvePosition).toBe(100);
      expect(s.phtValveStatus).toBe('ON');
      expect(s.chwValvePosition).toBe(0);
      expect(s.hardSafetyShutdown).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('nuisance-delay timer resets if the trip clears before it elapses (no shutdown)', () => {
    vi.useFakeTimers();
    try {
      const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
      const w = {};
      new Function('window', code)(w);
      w.AHU46Controller.setValue('freezestatDelaySetpoint', 5);
      w.AHU46State.mixedAirTemp = 20;
      w.AHU46Controller.recalculate();
      vi.advanceTimersByTime(3000); // partway through the delay
      w.AHU46State.mixedAirTemp = 60; // condition clears
      w.AHU46Controller.recalculate();
      vi.advanceTimersByTime(3000); // would have elapsed the ORIGINAL delay if not reset
      w.AHU46State.mixedAirTemp = 60;
      w.AHU46Controller.recalculate();
      expect(w.AHU46Controller.getState().freezestatShutdown).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reset is refused while OAT is still below the trip temperature', () => {
    vi.useFakeTimers();
    try {
      const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
      const w = {};
      new Function('window', code)(w);
      w.AHU46State.oaTemperature = 10;
      w.AHU46Controller.setValue('freezestatDelaySetpoint', 5);
      w.AHU46State.mixedAirTemp = 20;
      w.AHU46Controller.recalculate();
      vi.advanceTimersByTime(6000);
      w.AHU46State.mixedAirTemp = 20;
      w.AHU46Controller.recalculate();
      expect(w.AHU46Controller.getState().freezestatShutdown).toBe(true);

      w.AHU46Controller.setValue('resetPressed', true);
      expect(w.AHU46Controller.getState().freezestatShutdown).toBe(true); // still latched — OAT still cold
    } finally {
      vi.useRealTimers();
    }
  });

  it('reset succeeds once OAT has warmed above the trip temperature', () => {
    vi.useFakeTimers();
    try {
      const code = readFileSync(resolve(__dirname, 'AHU46Controller.js'), 'utf-8');
      const w = {};
      new Function('window', code)(w);
      w.AHU46State.oaTemperature = 10;
      w.AHU46Controller.setValue('freezestatDelaySetpoint', 5);
      w.AHU46State.mixedAirTemp = 20;
      w.AHU46Controller.recalculate();
      vi.advanceTimersByTime(6000);
      w.AHU46State.mixedAirTemp = 20;
      w.AHU46Controller.recalculate();

      w.AHU46State.oaTemperature = 50;
      w.AHU46Controller.setValue('resetPressed', true);
      const s = w.AHU46Controller.getState();
      expect(s.freezestatShutdown).toBe(false);
      expect(s.resetPressed).toBe(false); // momentary — self-clears
    } finally {
      vi.useRealTimers();
    }
  });

  it('is not evaluated while the fan is already off (no airflow across the element)', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', false);
    ctrl.recalculate();
    expect(ctrl.getState().fanRunning).toBe(false);
    expect(ctrl.getState().freezestatTripped).toBe(false);
  });
});

// ─── Safety/interlock layer: DPS pressure switches (SOO Safeties items 1-6) ─

describe('AHU46Controller — DPS pressure-switch safeties', () => {
  it('DPS-1 (filter dirty) is non-critical — no shutdown', () => {
    const ctrl = loadController();
    ctrl.setValue('filterDirty', true);
    const s = ctrl.getState();
    expect(s.fanRunning).toBe(true);
    expect(s.hardSafetyShutdown).toBe(false);
  });

  it.each(['dps2Tripped', 'dps3Tripped', 'dps4Tripped', 'dps5Tripped'])(
    '%s shuts down the unit (manual reset type)',
    (key) => {
      const ctrl = loadController();
      ctrl.setValue(key, true);
      const s = ctrl.getState();
      expect(s.hardSafetyShutdown).toBe(true);
      expect(s.fanRunning).toBe(false);
    }
  );

  it('reset clears all four DPS trips at once', () => {
    const ctrl = loadController();
    ctrl.setValue('dps2Tripped', true);
    ctrl.setValue('dps4Tripped', true);
    ctrl.setValue('resetPressed', true);
    const s = ctrl.getState();
    expect(s.dps2Tripped).toBe(false);
    expect(s.dps3Tripped).toBe(false);
    expect(s.dps4Tripped).toBe(false);
    expect(s.dps5Tripped).toBe(false);
  });
});

// ─── Safety/interlock layer: VFD fault + software lockout (items #23, #24) ──

describe('AHU46Controller — VFD fault and software lockout', () => {
  it('supplyFanVFDFault shuts down the unit', () => {
    const ctrl = loadController();
    ctrl.setValue('supplyFanVFDFault', true);
    expect(ctrl.getState().hardSafetyShutdown).toBe(true);
    expect(ctrl.getState().fanRunning).toBe(false);
  });

  it('returnFanVFDFault shuts down the unit', () => {
    const ctrl = loadController();
    ctrl.setValue('returnFanVFDFault', true);
    expect(ctrl.getState().hardSafetyShutdown).toBe(true);
  });

  it('softwareLockout holds the unit off regardless of runSchedule', () => {
    const ctrl = loadController();
    ctrl.setValue('runSchedule', true);
    ctrl.setValue('softwareLockout', true);
    expect(ctrl.getState().fanRunning).toBe(false);
    expect(ctrl.getState().hardSafetyShutdown).toBe(true);
  });

  it('clearing softwareLockout allows the staged start sequence to begin', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('softwareLockout', true);
      ctrl.setValue('softwareLockout', false);
      const s = ctrl.getState();
      expect(s.systemStarting).toBe(true);
      vi.advanceTimersByTime((ctrl.getState().startingTimeSetpoint + 1) * 1000);
      ctrl.recalculate();
      expect(ctrl.getState().fanRunning).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── VFD damper-request signals (Points List items 34/37) ───────────────────

describe('AHU46Controller — VFD damper-request signals', () => {
  it('are active throughout a staged start', () => {
    vi.useFakeTimers();
    try {
      const ctrl = loadController();
      ctrl.setValue('runSchedule', false);
      ctrl.recalculate();
      ctrl.setValue('runSchedule', true);
      let s = ctrl.getState();
      expect(s.systemStarting).toBe(true);
      expect(s.supplyFanVFDDamperRequest).toBe(true);
      expect(s.returnFanVFDDamperRequest).toBe(true);

      vi.advanceTimersByTime((ctrl.getState().startingTimeSetpoint + 1) * 1000);
      ctrl.recalculate();
      s = ctrl.getState();
      expect(s.systemStarting).toBe(false);
      expect(s.supplyFanVFDDamperRequest).toBe(false);
      expect(s.returnFanVFDDamperRequest).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('are false in steady-state running (default)', () => {
    const ctrl = loadController();
    const s = ctrl.getState();
    expect(s.supplyFanVFDDamperRequest).toBe(false);
    expect(s.returnFanVFDDamperRequest).toBe(false);
  });
});
