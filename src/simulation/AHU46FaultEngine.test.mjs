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
  }, overrides || {});
}

describe('AHU46FaultEngine', () => {
  it('has 4 fault rules with IDs M-01..M-04', () => {
    const ids = window.AHU46FaultEngine.rules.map(r => r.id);
    expect(ids).toEqual(['M-01', 'M-02', 'M-03', 'M-04']);
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
});
