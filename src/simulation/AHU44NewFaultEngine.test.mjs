/**
 * Unit tests for AHU44NewFaultEngine.js
 * Attaches to `window`, so we set up globals before loading, same pattern
 * as FaultEngine.test.mjs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

globalThis.window = globalThis;

const require = createRequire(import.meta.url);
require('./AHU44NewFaultEngine.js');

// Minimal valid controller state — mirrors AHU44NewController's shape for
// the fields these rules actually read.
function baseState(overrides) {
  return Object.assign({
    supplyAirTemp: 55,
    co2Sensor: 500,
    economizerActive: false,
    chwValvePosition: 0,
    fanRunning: true,
    oaDamperPosition: 20,
  }, overrides || {});
}

describe('AHU44NewFaultEngine', () => {
  let engine;

  beforeEach(() => {
    engine = window.AHU44NewFaultEngine;
    engine._reset();
  });

  describe('Initial state', () => {
    it('has 3 fault rules defined', () => {
      expect(engine.rules).toHaveLength(4);
    });

    it('rules have IDs N-01, N-02, N-03, N-04', () => {
      const ids = engine.rules.map(r => r.id);
      expect(ids).toEqual(['N-01', 'N-02', 'N-03', 'N-04']);
    });

    it('starts with no active alarms', () => {
      expect(engine.getActiveAlarms()).toHaveLength(0);
    });

    it('each rule has required fields including relatedStateKeys', () => {
      engine.rules.forEach(rule => {
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('description');
        expect(rule).toHaveProperty('priority');
        expect(rule).toHaveProperty('sourceField');
        expect(rule).toHaveProperty('relatedStateKeys');
        expect(Array.isArray(rule.relatedStateKeys)).toBe(true);
        expect(typeof rule.condition).toBe('function');
      });
    });
  });

  describe('evaluate — handles missing/undefined state gracefully', () => {
    it('returns no alarms and does not throw when state is undefined', () => {
      expect(() => engine.evaluate(undefined)).not.toThrow();
      expect(engine.evaluate(undefined)).toHaveLength(0);
    });
  });

  describe('alarms carry subsystem: AHU-4-4_NEW', () => {
    it('every generated alarm is tagged with subsystem AHU-4-4_NEW', () => {
      const alarms = engine.evaluate(baseState({ co2Sensor: 1200 }));
      expect(alarms.length).toBeGreaterThan(0);
      alarms.forEach(a => expect(a.subsystem).toBe('AHU-4-4_NEW'));
    });
  });

  describe('N-01: supply air temp outside 52–58°F band', () => {
    it('does not trigger within the band', () => {
      expect(engine.evaluate(baseState({ supplyAirTemp: 55 }))).toHaveLength(0);
    });

    it('does not trigger exactly at the boundaries', () => {
      expect(engine.evaluate(baseState({ supplyAirTemp: 52 }))).toHaveLength(0);
      engine._reset();
      expect(engine.evaluate(baseState({ supplyAirTemp: 58 }))).toHaveLength(0);
    });

    it('triggers below the band', () => {
      const alarms = engine.evaluate(baseState({ supplyAirTemp: 49 }));
      expect(alarms.find(a => a.condition === 'N-01')).toBeDefined();
    });

    it('triggers above the band', () => {
      const alarms = engine.evaluate(baseState({ supplyAirTemp: 63 }));
      expect(alarms.find(a => a.condition === 'N-01')).toBeDefined();
    });
  });

  describe('N-02: CO2 exceeds 1100ppm', () => {
    it('does not trigger at exactly 1100', () => {
      expect(engine.evaluate(baseState({ co2Sensor: 1100 }))).toHaveLength(0);
    });

    it('triggers above 1100', () => {
      const alarms = engine.evaluate(baseState({ co2Sensor: 1101 }));
      expect(alarms.find(a => a.condition === 'N-02')).toBeDefined();
    });
  });

  describe('N-03: economizer active while mechanical cooling still engaged', () => {
    it('does not trigger when economizer is off', () => {
      expect(engine.evaluate(baseState({ economizerActive: false, chwValvePosition: 40 }))).toHaveLength(0);
    });

    it('does not trigger when CHW valve is closed', () => {
      expect(engine.evaluate(baseState({ economizerActive: true, chwValvePosition: 0 }))).toHaveLength(0);
    });

    it('triggers when economizer is active AND CHW valve is open', () => {
      const alarms = engine.evaluate(baseState({ economizerActive: true, chwValvePosition: 25 }));
      expect(alarms.find(a => a.condition === 'N-03')).toBeDefined();
    });
  });

  describe('N-04: OA damper below ASHRAE 62.1 minimum (20%) while running — ventilation shortfall', () => {
    it('does not trigger at exactly the 20% floor', () => {
      expect(engine.evaluate(baseState({ fanRunning: true, oaDamperPosition: 20 }))).toHaveLength(0);
    });

    it('does not trigger above the floor', () => {
      expect(engine.evaluate(baseState({ fanRunning: true, oaDamperPosition: 45 }))).toHaveLength(0);
    });

    it('triggers when the damper reads below the floor while the fan is running', () => {
      const alarms = engine.evaluate(baseState({ fanRunning: true, oaDamperPosition: 19 }));
      const alarm = alarms.find(a => a.condition === 'N-04');
      expect(alarm).toBeDefined();
      expect(alarm.priority).toBe('high');
      expect(alarm.value).toBe(19);
    });

    it('matches the real AHU-4-4 screenshot pattern: damper manually stuck near-closed (e.g. 1%) despite a configured 4,900 CFM minimum', () => {
      const alarms = engine.evaluate(baseState({ fanRunning: true, oaDamperPosition: 1 }));
      expect(alarms.find(a => a.condition === 'N-04')).toBeDefined();
    });

    it('does not trigger when the fan is not running (damper is legitimately at 0%, not a fault)', () => {
      expect(engine.evaluate(baseState({ fanRunning: false, oaDamperPosition: 0 }))).toHaveLength(0);
    });

    it('clears when the damper returns to or above the floor', () => {
      engine.evaluate(baseState({ fanRunning: true, oaDamperPosition: 5 }));
      expect(engine.getActiveAlarms().find(a => a.condition === 'N-04')).toBeDefined();

      engine.evaluate(baseState({ fanRunning: true, oaDamperPosition: 20 }));
      expect(engine.getActiveAlarms().find(a => a.condition === 'N-04')).toBeUndefined();
    });
  });

  describe('alarm generation/clearing (Property 20/21 parity with FaultEngine)', () => {
    it('does not generate a duplicate alarm for the same rule', () => {
      const state = baseState({ co2Sensor: 1200 });
      const first = engine.evaluate(state);
      expect(first.filter(a => a.condition === 'N-02')).toHaveLength(1);

      const second = engine.evaluate(state);
      expect(second.filter(a => a.condition === 'N-02')).toHaveLength(0);
    });

    it('transitions alarm to inactive when condition clears, preserving acknowledgment', () => {
      engine.evaluate(baseState({ co2Sensor: 1200 }));
      expect(engine.getActiveAlarms()).toHaveLength(1);

      engine.acknowledge('N-02', 'cta_student');
      engine.evaluate(baseState({ co2Sensor: 500 }));

      expect(engine.getActiveAlarms()).toHaveLength(0);
      const all = engine.getAllAlarms();
      const alarm = all.find(a => a.condition === 'N-02');
      expect(alarm.lifecycle).toBe('inactive');
      expect(alarm.acknowledged).toBe(true);
      expect(alarm.operator).toBe('cta_student');
    });
  });

  describe('acknowledge', () => {
    it('does nothing for a non-existent rule ID', () => {
      expect(() => engine.acknowledge('N-99', 'someone')).not.toThrow();
    });
  });

  describe('reset', () => {
    it('clears all alarms', () => {
      engine.evaluate(baseState({ co2Sensor: 1200, supplyAirTemp: 70 }));
      expect(engine.getActiveAlarms().length).toBeGreaterThan(0);

      engine.reset();
      expect(engine.getActiveAlarms()).toHaveLength(0);
      expect(engine.getAllAlarms()).toHaveLength(0);
    });
  });
});
