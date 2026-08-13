/**
 * Unit tests for AHU46FaultEngine.js
 * Attaches to `window`, so we set up globals before loading, same pattern
 * as AHU44NewFaultEngine.test.mjs.
 *
 * Focus: M-04's OA damper threshold, corrected from 60% to 50% to match the
 * SOO's own min/max CFM table (4,500/9,000 CFM = 50%). See
 * SCENARIO_TRACKING.md item #14.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

globalThis.window = globalThis;

const require = createRequire(import.meta.url);
require('./AHU46FaultEngine.js');

// Minimal valid controller state — mirrors AHU46Controller's shape for the
// fields these rules actually read. evaluate() self-heals per call (deletes
// alarms whose condition no longer holds), so no reset is needed between
// tests as long as each state object is complete.
function baseState(overrides) {
  return Object.assign({
    supplyAirTemp: 55,
    coolingCoilSetpoint: 60,
    chwValvePosition: 0,
    phtValvePosition: 0,
    co2Sensor: 500,
    economizerActive: false,
    fanRunning: true,
    oaDamperPosition: 50,
    oaCFM: 4500,
    minOAAirflowSetpoint: 4500,
    supplyFanVFDBypass: false,
    returnFanVFDBypass: false,
    filterDirty: false,
    dps2Tripped: false,
    dps3Tripped: false,
    dps4Tripped: false,
    dps5Tripped: false,
    freezestatTripped: false,
    freezestatShutdown: false,
    supplyFanVFDFault: false,
    returnFanVFDFault: false,
    softwareLockout: false,
  }, overrides || {});
}

describe('AHU46FaultEngine', () => {
  it('has 13 fault rules with IDs M-01..M-13', () => {
    const ids = window.AHU46FaultEngine.rules.map(r => r.id);
    expect(ids).toEqual([
      'M-01', 'M-02', 'M-03', 'M-04', 'M-05', 'M-06', 'M-07',
      'M-08', 'M-09', 'M-10', 'M-11', 'M-12', 'M-13',
    ]);
  });

  describe('M-03: economizer active while mechanical cooling still engaged (#15)', () => {
    it('does not fire under default setpoints, even with the economizer active — by design, mixed air stays below the cooling setpoint', () => {
      // economizerTempControlSP (58°F default) keeps the economizer's own
      // enable window entirely below coolingCoilSetpoint (60°F default),
      // so mixedAirTemp (== OAT with the damper at 100%, no heat call)
      // can never exceed it here.
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ economizerActive: true, chwValvePosition: 0 }));
      expect(alarms.find(a => a.condition === 'M-03')).toBeUndefined();
    });

    it('fires when the economizer is active and mechanical cooling is still engaged', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ economizerActive: true, chwValvePosition: 45 }));
      const m03 = alarms.find(a => a.condition === 'M-03');
      expect(m03).toBeDefined();
      expect(m03.value).toBe(45);
    });

    it('does not fire when the economizer is active but cooling is fully closed', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ economizerActive: true, chwValvePosition: 0 }));
      expect(alarms.find(a => a.condition === 'M-03')).toBeUndefined();
    });

    it('does not fire when cooling is active but the economizer is not (normal mechanical cooling)', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ economizerActive: false, chwValvePosition: 80 }));
      expect(alarms.find(a => a.condition === 'M-03')).toBeUndefined();
    });

    it('clears once the CHW valve closes back down', () => {
      window.AHU46FaultEngine.evaluate(baseState({ economizerActive: true, chwValvePosition: 45 }));
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ economizerActive: true, chwValvePosition: 0 }));
      expect(alarms.find(a => a.condition === 'M-03')).toBeUndefined();
    });
  });

  describe('M-04: OA damper below the 50% ASHRAE 62.1 minimum (was 60%)', () => {
    it('does not fire exactly at the 50% floor — boundary case', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ oaDamperPosition: 50 }));
      expect(alarms.find(a => a.condition === 'M-04')).toBeUndefined();
    });

    it('fires just below the floor (49%)', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ oaDamperPosition: 49 }));
      expect(alarms.find(a => a.condition === 'M-04')).toBeDefined();
    });

    it('does NOT fire at 55% — this is the old 60% threshold\'s territory, must stay clear under the new 50% floor', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ oaDamperPosition: 55 }));
      expect(alarms.find(a => a.condition === 'M-04')).toBeUndefined();
    });

    it('fires for a severely stuck damper (10%) while fan is running', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ oaDamperPosition: 10, oaCFM: 900 }));
      const m04 = alarms.find(a => a.condition === 'M-04');
      expect(m04).toBeDefined();
      expect(m04.value).toBe(10);
    });

    it('does not fire when the fan is off, even at 0% damper (unit is intentionally shut down)', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ oaDamperPosition: 0, oaCFM: 0, fanRunning: false }));
      expect(alarms.find(a => a.condition === 'M-04')).toBeUndefined();
    });

    it('clears once the damper recovers back above the floor', () => {
      window.AHU46FaultEngine.evaluate(baseState({ oaDamperPosition: 10 }));
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ oaDamperPosition: 50 }));
      expect(alarms.find(a => a.condition === 'M-04')).toBeUndefined();
    });
  });

  describe('M-05/M-06: VFD-in-bypass (SOO General Automatic Control Sequences #16)', () => {
    it('does not fire when neither VFD is in bypass', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState());
      expect(alarms.find(a => a.condition === 'M-05')).toBeUndefined();
      expect(alarms.find(a => a.condition === 'M-06')).toBeUndefined();
    });

    it('M-05 fires when the supply fan VFD is in bypass', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ supplyFanVFDBypass: true }));
      const m05 = alarms.find(a => a.condition === 'M-05');
      expect(m05).toBeDefined();
      expect(m05.value).toBe(true);
      expect(alarms.find(a => a.condition === 'M-06')).toBeUndefined();
    });

    it('M-06 fires when the return fan VFD is in bypass', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ returnFanVFDBypass: true }));
      expect(alarms.find(a => a.condition === 'M-06')).toBeDefined();
      expect(alarms.find(a => a.condition === 'M-05')).toBeUndefined();
    });

    it('both fire independently and simultaneously when both VFDs are in bypass', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ supplyFanVFDBypass: true, returnFanVFDBypass: true }));
      expect(alarms.find(a => a.condition === 'M-05')).toBeDefined();
      expect(alarms.find(a => a.condition === 'M-06')).toBeDefined();
    });

    it('fires regardless of fan-running status — a bypassed drive is alarm-worthy even if the unit is otherwise off', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ supplyFanVFDBypass: true, fanRunning: false }));
      expect(alarms.find(a => a.condition === 'M-05')).toBeDefined();
    });

    it('clears once bypass is switched off', () => {
      window.AHU46FaultEngine.evaluate(baseState({ supplyFanVFDBypass: true }));
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ supplyFanVFDBypass: false }));
      expect(alarms.find(a => a.condition === 'M-05')).toBeUndefined();
    });
  });

  describe('M-07: any point forced to Manual (Lev Chesnov, BMS training session 07-31-26) (#16)', () => {
    it('does not fire with no modes argument at all — backward compatible with callers that only pass state', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState());
      expect(alarms.find(a => a.condition === 'M-07')).toBeUndefined();
    });

    it('does not fire with an empty modes map', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState(), {});
      expect(alarms.find(a => a.condition === 'M-07')).toBeUndefined();
    });

    it('fires when exactly one point is in Manual, independent of its value', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState(), { fanSpeedSetpoint: 'Manual' });
      const m07 = alarms.find(a => a.condition === 'M-07');
      expect(m07).toBeDefined();
      expect(m07.value).toEqual(['fanSpeedSetpoint']);
    });

    it('lists every manually-overridden key when several are set at once', () => {
      // Clear first — the alarm's value is frozen at first-fire (same
      // pattern as every other rule here), so a composition set by an
      // earlier test in this describe block would otherwise stick.
      window.AHU46FaultEngine.evaluate(baseState(), {});
      const alarms = window.AHU46FaultEngine.evaluate(baseState(), {
        oaDamperPosition: 'Manual',
        coolingCoilSetpoint: 'Manual',
      });
      const m07 = alarms.find(a => a.condition === 'M-07');
      expect(m07.value.sort()).toEqual(['coolingCoilSetpoint', 'oaDamperPosition']);
    });

    it('is independent of every other rule — fires alongside M-04 without interfering with it', () => {
      const alarms = window.AHU46FaultEngine.evaluate(
        baseState({ oaDamperPosition: 10 }),
        { oaDamperPosition: 'Manual' }
      );
      expect(alarms.find(a => a.condition === 'M-04')).toBeDefined();
      expect(alarms.find(a => a.condition === 'M-07')).toBeDefined();
    });

    it('clears once every point is returned to auto', () => {
      window.AHU46FaultEngine.evaluate(baseState(), { fanSpeedSetpoint: 'Manual' });
      const alarms = window.AHU46FaultEngine.evaluate(baseState(), {});
      expect(alarms.find(a => a.condition === 'M-07')).toBeUndefined();
    });
  });

  describe('M-08: dirty filter (DPS-1) — non-critical', () => {
    it('fires when filterDirty is true', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ filterDirty: true }));
      const m08 = alarms.find(a => a.condition === 'M-08');
      expect(m08).toBeDefined();
      expect(m08.priority).toBe('low');
    });

    it('does not fire under default state', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState());
      expect(alarms.find(a => a.condition === 'M-08')).toBeUndefined();
    });
  });

  describe('M-09: DPS-2..5 high suction/static pressure trips', () => {
    it('does not fire under default state', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState());
      expect(alarms.find(a => a.condition === 'M-09')).toBeUndefined();
    });

    it('fires when any single DPS trips, listing which one', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ dps3Tripped: true }));
      const m09 = alarms.find(a => a.condition === 'M-09');
      expect(m09).toBeDefined();
      expect(m09.value).toEqual(['DPS-3 (Supply Static)']);
    });

    it('lists all tripped switches when multiple fire together', () => {
      window.AHU46FaultEngine.evaluate(baseState()); // clear any stale cached value from a prior test
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ dps2Tripped: true, dps5Tripped: true }));
      const m09 = alarms.find(a => a.condition === 'M-09');
      expect(m09.value).toEqual(['DPS-2 (Supply Suction)', 'DPS-5 (Return Static)']);
    });

    it('clears once every DPS trip is cleared', () => {
      window.AHU46FaultEngine.evaluate(baseState({ dps4Tripped: true }));
      const alarms = window.AHU46FaultEngine.evaluate(baseState());
      expect(alarms.find(a => a.condition === 'M-09')).toBeUndefined();
    });
  });

  describe('M-10 / M-11: freezestat warning vs shutdown', () => {
    it('M-10 fires on an instantaneous trip before shutdown latches', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ freezestatTripped: true, freezestatShutdown: false }));
      expect(alarms.find(a => a.condition === 'M-10')).toBeDefined();
      expect(alarms.find(a => a.condition === 'M-11')).toBeUndefined();
    });

    it('M-11 fires once shutdown has latched, and M-10 no longer fires', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ freezestatTripped: false, freezestatShutdown: true }));
      const m11 = alarms.find(a => a.condition === 'M-11');
      expect(m11).toBeDefined();
      expect(m11.priority).toBe('urgent');
      expect(alarms.find(a => a.condition === 'M-10')).toBeUndefined();
    });

    it('neither fires under default state', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState());
      expect(alarms.find(a => a.condition === 'M-10')).toBeUndefined();
      expect(alarms.find(a => a.condition === 'M-11')).toBeUndefined();
    });
  });

  describe('M-12: Supply/Return Fan VFD fault', () => {
    it('fires and names the faulted drive', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ supplyFanVFDFault: true }));
      const m12 = alarms.find(a => a.condition === 'M-12');
      expect(m12).toBeDefined();
      expect(m12.value).toEqual(['Supply Fan VFD']);
    });

    it('lists both drives when both fault together', () => {
      window.AHU46FaultEngine.evaluate(baseState()); // clear any stale cached value from a prior test
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ supplyFanVFDFault: true, returnFanVFDFault: true }));
      expect(alarms.find(a => a.condition === 'M-12').value).toEqual(['Supply Fan VFD', 'Return Fan VFD']);
    });
  });

  describe('M-13: software lockout', () => {
    it('fires when active', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ softwareLockout: true }));
      expect(alarms.find(a => a.condition === 'M-13')).toBeDefined();
    });

    it('clears once lockout is released', () => {
      window.AHU46FaultEngine.evaluate(baseState({ softwareLockout: true }));
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ softwareLockout: false }));
      expect(alarms.find(a => a.condition === 'M-13')).toBeUndefined();
    });
  });

  // ─── API parity with AHU44NewFaultEngine (needed for AlarmSummary.jsx) ────
  //
  // Previously this engine only exposed rules/evaluate/getActiveAlarms —
  // missing getAllAlarms/acknowledge/acknowledgeAll/reset that
  // AlarmSummary.jsx expects from every engine it aggregates. Found and
  // fixed while wiring AHU-4-6 into the global Alarm Summary
  // (SCENARIO_TRACKING.md item #19 follow-up).

  describe('AHU46FaultEngine — API parity (getAllAlarms, acknowledge, reset)', () => {
    it('every alarm carries subsystem AHU-4-6', () => {
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ filterDirty: true }));
      alarms.forEach(a => expect(a.subsystem).toBe('AHU-4-6'));
    });

    it('every alarm starts unacknowledged', () => {
      window.AHU46FaultEngine.evaluate(baseState()); // clear any stale state
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ filterDirty: true }));
      const m08 = alarms.find(a => a.condition === 'M-08');
      expect(m08.acknowledged).toBe(false);
      expect(m08.operator).toBe('');
    });

    it('getAllAlarms matches getActiveAlarms (this engine has no inactive-alarm history)', () => {
      window.AHU46FaultEngine.evaluate(baseState({ filterDirty: true, dps2Tripped: true }));
      const all = window.AHU46FaultEngine.getAllAlarms().map(a => a.condition).sort();
      const active = window.AHU46FaultEngine.getActiveAlarms().map(a => a.condition).sort();
      expect(all).toEqual(active);
    });

    it('acknowledge() marks a specific alarm acknowledged with the operator name', () => {
      window.AHU46FaultEngine.evaluate(baseState({ filterDirty: true }));
      window.AHU46FaultEngine.acknowledge('M-08', 'jsmith');
      const m08 = window.AHU46FaultEngine.getAllAlarms().find(a => a.condition === 'M-08');
      expect(m08.acknowledged).toBe(true);
      expect(m08.operator).toBe('jsmith');
    });

    it('acknowledge() on a non-existent alarm ID does nothing and does not throw', () => {
      expect(() => window.AHU46FaultEngine.acknowledge('M-99', 'jsmith')).not.toThrow();
    });

    it('acknowledgeAll() marks every currently active alarm acknowledged', () => {
      window.AHU46FaultEngine.evaluate(baseState({ filterDirty: true, softwareLockout: true }));
      window.AHU46FaultEngine.acknowledgeAll('bulk-op');
      const all = window.AHU46FaultEngine.getAllAlarms();
      expect(all.length).toBeGreaterThan(0);
      all.forEach(a => {
        expect(a.acknowledged).toBe(true);
        expect(a.operator).toBe('bulk-op');
      });
    });

    it('reset() clears every alarm', () => {
      window.AHU46FaultEngine.evaluate(baseState({ filterDirty: true }));
      expect(window.AHU46FaultEngine.getAllAlarms().length).toBeGreaterThan(0);
      window.AHU46FaultEngine.reset();
      expect(window.AHU46FaultEngine.getAllAlarms()).toEqual([]);
      expect(window.AHU46FaultEngine.getActiveAlarms()).toEqual([]);
    });

    it('a fresh evaluate() after reset() correctly regenerates alarms', () => {
      window.AHU46FaultEngine.evaluate(baseState({ filterDirty: true }));
      window.AHU46FaultEngine.reset();
      const alarms = window.AHU46FaultEngine.evaluate(baseState({ filterDirty: true }));
      expect(alarms.find(a => a.condition === 'M-08')).toBeDefined();
    });
  });
});
