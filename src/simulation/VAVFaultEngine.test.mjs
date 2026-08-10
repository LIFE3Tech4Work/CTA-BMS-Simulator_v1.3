/**
 * Unit tests for VAVFaultEngine.js
 * Attaches to `window`, so we set up globals before loading, same pattern
 * as AHU44NewFaultEngine.test.mjs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

globalThis.window = globalThis;

const require = createRequire(import.meta.url);
require('./VAVFaultEngine.js');

const ZONE_A = 'VAV-4-4-01';
const ZONE_B = 'VAV-4-4-02';

// Minimal valid controller state — mirrors VAVController's shape for the
// fields these rules actually read.
function baseState(overrides) {
  return Object.assign({
    reheatValvePosition: 0,
    dischargeAirTemp: 55,
    co2Sensor: 500,
    runSchedule: true,
    airflowCFM: 200,
  }, overrides || {});
}

describe('VAVFaultEngine', () => {
  let engine;

  beforeEach(() => {
    engine = window.VAVFaultEngine;
    engine._reset();
  });

  describe('Initial state', () => {
    it('has 3 fault rules defined', () => {
      expect(engine.rules).toHaveLength(3);
    });

    it('rules have IDs V-01, V-02, V-03', () => {
      const ids = engine.rules.map(r => r.id);
      expect(ids).toEqual(['V-01', 'V-02', 'V-03']);
    });

    it('getActiveAlarms() is empty before any evaluate call', () => {
      expect(engine.getActiveAlarms()).toHaveLength(0);
    });
  });

  describe('evaluate — handles missing/undefined state gracefully', () => {
    it('returns no alarms and does not throw when state is undefined', () => {
      expect(() => engine.evaluate(ZONE_A, undefined)).not.toThrow();
      expect(engine.evaluate(ZONE_A, undefined)).toHaveLength(0);
    });

    it('returns no alarms and does not throw when zoneId is missing', () => {
      expect(() => engine.evaluate(undefined, baseState())).not.toThrow();
      expect(engine.evaluate(undefined, baseState())).toHaveLength(0);
    });
  });

  describe('alarms carry subsystem = zoneId', () => {
    it('every generated alarm is tagged with the zone it came from', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ co2Sensor: 1200 }));
      expect(alarms.length).toBeGreaterThan(0);
      alarms.forEach(a => expect(a.subsystem).toBe(ZONE_A));
    });
  });

  describe('V-01: Excessive Reheat', () => {
    it('does not trigger when reheat valve is closed', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ reheatValvePosition: 0, dischargeAirTemp: 55 }));
      expect(alarms.find(a => a.condition === 'V-01')).toBeUndefined();
    });

    it('does not trigger when reheat is open but discharge air is not cold (mild weather, AHU not actively cooling)', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ reheatValvePosition: 80, dischargeAirTemp: 65 }));
      expect(alarms.find(a => a.condition === 'V-01')).toBeUndefined();
    });

    it('does not trigger when discharge air is cold but reheat is only trimming (<=30%)', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ reheatValvePosition: 30, dischargeAirTemp: 55 }));
      expect(alarms.find(a => a.condition === 'V-01')).toBeUndefined();
    });

    it('triggers when discharge air is cold (<=58°F) and reheat is meaningfully open (>30%)', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ reheatValvePosition: 80, dischargeAirTemp: 55 }));
      const alarm = alarms.find(a => a.condition === 'V-01');
      expect(alarm).toBeDefined();
      expect(alarm.priority).toBe('high');
      expect(alarm.value).toBe(80);
    });

    it('triggers exactly at the discharge-air boundary (58°F)', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ reheatValvePosition: 80, dischargeAirTemp: 58 }));
      expect(alarms.find(a => a.condition === 'V-01')).toBeDefined();
    });

    it('does not trigger just above the discharge-air boundary (58.1°F)', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ reheatValvePosition: 80, dischargeAirTemp: 58.1 }));
      expect(alarms.find(a => a.condition === 'V-01')).toBeUndefined();
    });

    it('matches the WBL guide example: cooled to 55°F (~60°F), reheat fully open', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ reheatValvePosition: 100, dischargeAirTemp: 55 }));
      expect(alarms.find(a => a.condition === 'V-01')).toBeDefined();
    });
  });

  describe('V-02: CO2 exceeds 1100ppm', () => {
    it('does not trigger at exactly 1100', () => {
      expect(engine.evaluate(ZONE_A, baseState({ co2Sensor: 1100 }))).toHaveLength(0);
    });

    it('triggers above 1100', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ co2Sensor: 1101 }));
      expect(alarms.find(a => a.condition === 'V-02')).toBeDefined();
      expect(alarms.find(a => a.condition === 'V-02').priority).toBe('urgent');
    });
  });

  describe('V-03: VAV running during unoccupied hours', () => {
    it('does not trigger when occupied, regardless of airflow', () => {
      expect(engine.evaluate(ZONE_A, baseState({ runSchedule: true, airflowCFM: 750 }))).toHaveLength(0);
    });

    it('does not trigger when unoccupied with zero airflow (the normal, non-fault case)', () => {
      expect(engine.evaluate(ZONE_A, baseState({ runSchedule: false, airflowCFM: 0 }))).toHaveLength(0);
    });

    it('triggers when unoccupied but airflow is nonzero (damper stuck/manually held open)', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ runSchedule: false, airflowCFM: 500 }));
      const alarm = alarms.find(a => a.condition === 'V-03');
      expect(alarm).toBeDefined();
      expect(alarm.priority).toBe('high');
      expect(alarm.value).toBe(500);
    });

    it('triggers on any nonzero airflow, however small', () => {
      const alarms = engine.evaluate(ZONE_A, baseState({ runSchedule: false, airflowCFM: 1 }));
      expect(alarms.find(a => a.condition === 'V-03')).toBeDefined();
    });

    it('clears once airflow returns to zero', () => {
      engine.evaluate(ZONE_A, baseState({ runSchedule: false, airflowCFM: 500 }));
      expect(engine.getActiveAlarms(ZONE_A).find(a => a.condition === 'V-03')).toBeDefined();

      engine.evaluate(ZONE_A, baseState({ runSchedule: false, airflowCFM: 0 }));
      expect(engine.getActiveAlarms(ZONE_A).find(a => a.condition === 'V-03')).toBeUndefined();
    });

    it('clears when occupancy resumes (runSchedule true), even with nonzero airflow', () => {
      engine.evaluate(ZONE_A, baseState({ runSchedule: false, airflowCFM: 500 }));
      expect(engine.getActiveAlarms(ZONE_A).find(a => a.condition === 'V-03')).toBeDefined();

      engine.evaluate(ZONE_A, baseState({ runSchedule: true, airflowCFM: 500 }));
      expect(engine.getActiveAlarms(ZONE_A).find(a => a.condition === 'V-03')).toBeUndefined();
    });
  });

  describe('Property 20: no duplicate active alarms for the same rule+zone', () => {
    it('evaluating twice with the same triggering condition only creates one alarm', () => {
      const state = baseState({ co2Sensor: 1200 });
      const first = engine.evaluate(ZONE_A, state);
      expect(first.filter(a => a.condition === 'V-02')).toHaveLength(1);

      const second = engine.evaluate(ZONE_A, state);
      expect(second.filter(a => a.condition === 'V-02')).toHaveLength(0); // no new alarm
      expect(engine.getActiveAlarms(ZONE_A).filter(a => a.condition === 'V-02')).toHaveLength(1);
    });
  });

  describe('Property 21: clearing preserves acknowledgment state', () => {
    it('preserves acknowledged=false when clearing', () => {
      engine.evaluate(ZONE_A, baseState({ co2Sensor: 1200 }));
      engine.evaluate(ZONE_A, baseState({ co2Sensor: 500 })); // clear
      const alarm = engine.getAllAlarms(ZONE_A).find(a => a.condition === 'V-02');
      expect(alarm.lifecycle).toBe('inactive');
      expect(alarm.acknowledged).toBe(false);
    });

    it('preserves acknowledged=true when clearing', () => {
      engine.evaluate(ZONE_A, baseState({ co2Sensor: 1200 }));
      engine.acknowledge(ZONE_A, 'V-02', 'cta_student');
      engine.evaluate(ZONE_A, baseState({ co2Sensor: 500 })); // clear
      const alarm = engine.getAllAlarms(ZONE_A).find(a => a.condition === 'V-02');
      expect(alarm.lifecycle).toBe('inactive');
      expect(alarm.acknowledged).toBe(true);
      expect(alarm.operator).toBe('cta_student');
    });
  });

  describe('Zone independence', () => {
    it('alarms in one zone do not appear in another', () => {
      engine.evaluate(ZONE_A, baseState({ co2Sensor: 1200 }));
      engine.evaluate(ZONE_B, baseState({ co2Sensor: 500 }));

      expect(engine.getActiveAlarms(ZONE_A)).toHaveLength(1);
      expect(engine.getActiveAlarms(ZONE_B)).toHaveLength(0);
    });

    it('getActiveAlarms() with no zoneId returns alarms across all zones', () => {
      engine.evaluate(ZONE_A, baseState({ co2Sensor: 1200 }));
      engine.evaluate(ZONE_B, baseState({ reheatValvePosition: 100, dischargeAirTemp: 55 }));

      const all = engine.getActiveAlarms();
      expect(all.length).toBe(2);
      expect(all.some(a => a.subsystem === ZONE_A)).toBe(true);
      expect(all.some(a => a.subsystem === ZONE_B)).toBe(true);
    });

    it('acknowledging in one zone does not acknowledge the same rule in another', () => {
      engine.evaluate(ZONE_A, baseState({ co2Sensor: 1200 }));
      engine.evaluate(ZONE_B, baseState({ co2Sensor: 1200 }));
      engine.acknowledge(ZONE_A, 'V-02', 'cta_student');

      expect(engine.getAllAlarms(ZONE_A).find(a => a.condition === 'V-02').acknowledged).toBe(true);
      expect(engine.getAllAlarms(ZONE_B).find(a => a.condition === 'V-02').acknowledged).toBe(false);
    });
  });

  describe('acknowledge', () => {
    it('marks alarm as acknowledged with operator name', () => {
      engine.evaluate(ZONE_A, baseState({ co2Sensor: 1200 }));
      engine.acknowledge(ZONE_A, 'V-02', 'cta_instructor');
      const active = engine.getActiveAlarms(ZONE_A);
      expect(active[0].acknowledged).toBe(true);
      expect(active[0].operator).toBe('cta_instructor');
    });

    it('does nothing for non-existent rule ID', () => {
      engine.acknowledge(ZONE_A, 'V-99', 'someone');
      expect(engine.getActiveAlarms(ZONE_A)).toHaveLength(0);
    });
  });

  describe('reset / _reset', () => {
    it('clears alarms across all zones', () => {
      engine.evaluate(ZONE_A, baseState({ co2Sensor: 1200 }));
      engine.evaluate(ZONE_B, baseState({ co2Sensor: 1200 }));
      engine._reset();
      expect(engine.getActiveAlarms()).toHaveLength(0);
    });
  });
});
