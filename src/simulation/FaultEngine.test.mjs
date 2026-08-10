/**
 * Unit tests for FaultEngine.
 * FaultEngine.js attaches to `window`, so we set up globals before loading.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Mock browser globals needed by FaultEngine.js
globalThis.window = globalThis;

// Load FaultEngine.js which attaches to window.FaultEngine
const require = createRequire(import.meta.url);
require('./FaultEngine.js');

describe('FaultEngine', () => {
  let engine;

  beforeEach(() => {
    engine = window.FaultEngine;
    engine._reset();
  });

  describe('Initial state', () => {
    it('has 6 fault rules defined', () => {
      expect(engine.rules).toHaveLength(6);
    });

    it('rules have correct IDs F-01 through F-06', () => {
      const ids = engine.rules.map(r => r.id);
      expect(ids).toEqual(['F-01', 'F-02', 'F-03', 'F-04', 'F-05', 'F-06']);
    });

    it('starts with no active alarms', () => {
      expect(engine.getActiveAlarms()).toHaveLength(0);
    });

    it('each rule has required fields', () => {
      engine.rules.forEach(rule => {
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('description');
        expect(rule).toHaveProperty('priority');
        expect(rule).toHaveProperty('sourcePoint');
        expect(rule).toHaveProperty('condition');
        expect(typeof rule.condition).toBe('function');
      });
    });
  });

  describe('evaluate — alarm generation (Property 20)', () => {
    it('generates alarm when F-01 condition is met (PHT>20 AND CHW>20 on AHU-4-6)', () => {
      const values = new Map([
        ['AO103@DEV4006', 25],
        ['AO102@DEV4006', 30]
      ]);

      const newAlarms = engine.evaluate(values);

      expect(newAlarms).toHaveLength(1);
      expect(newAlarms[0].condition).toBe('F-01');
      expect(newAlarms[0].priority).toBe('urgent');
      expect(newAlarms[0].lifecycle).toBe('active');
      expect(newAlarms[0].acknowledged).toBe(false);
      expect(newAlarms[0].source).toBe('AO103@DEV4006');
      expect(newAlarms[0].description).toBe('Simultaneous heating and cooling');
    });

    it('generates alarm with correct shape', () => {
      const values = new Map([
        ['AI401@DEV4004', 1200]
      ]);

      const newAlarms = engine.evaluate(values);
      const alarm = newAlarms.find(a => a.condition === 'F-06');

      expect(alarm).toBeDefined();
      expect(alarm.id).toMatch(/^F-06_/);
      expect(alarm.timestamp).toBeInstanceOf(Date);
      expect(alarm.source).toBe('AI401@DEV4004');
      expect(alarm.condition).toBe('F-06');
      expect(alarm.priority).toBe('urgent');
      expect(alarm.description).toBe('CO2 exceeds ventilation threshold (>1,100 ppm, ASHRAE 62.1 upper guideline)');
      expect(alarm.value).toBe(1200);
      expect(alarm.lifecycle).toBe('active');
      expect(alarm.acknowledged).toBe(false);
      expect(alarm.operator).toBe('');
      expect(alarm.action).toBe('');
    });

    it('does NOT generate duplicate alarm for same rule (Property 20)', () => {
      const values = new Map([
        ['AO103@DEV4006', 25],
        ['AO102@DEV4006', 30]
      ]);

      const first = engine.evaluate(values);
      expect(first).toHaveLength(1);

      const second = engine.evaluate(values);
      // No new alarms generated — the F-01 alarm already exists
      expect(second.filter(a => a.condition === 'F-01')).toHaveLength(0);
    });

    it('generates alarms for multiple rules simultaneously', () => {
      const values = new Map([
        ['AO103@DEV4006', 25],
        ['AO102@DEV4006', 30],
        ['AI401@DEV4004', 1200]
      ]);

      const newAlarms = engine.evaluate(values);
      const conditions = newAlarms.map(a => a.condition);

      expect(conditions).toContain('F-01');
      expect(conditions).toContain('F-06');
    });
  });

  describe('evaluate — alarm clearing (Property 21)', () => {
    it('transitions alarm to inactive when condition clears', () => {
      // First, trigger the alarm
      const triggerValues = new Map([
        ['AI401@DEV4004', 1200]
      ]);
      engine.evaluate(triggerValues);

      // Verify it's active
      expect(engine.getActiveAlarms()).toHaveLength(1);

      // Now clear the condition
      const clearValues = new Map([
        ['AI401@DEV4004', 700]
      ]);
      engine.evaluate(clearValues);

      // No more active alarms
      expect(engine.getActiveAlarms()).toHaveLength(0);

      // But the alarm still exists in the map as inactive
      const all = engine.getAllAlarms();
      const alarm = all.find(a => a.condition === 'F-06');
      expect(alarm).toBeDefined();
      expect(alarm.lifecycle).toBe('inactive');
    });

    it('preserves acknowledged=false when clearing (Property 21)', () => {
      const triggerValues = new Map([
        ['AI401@DEV4004', 1200]
      ]);
      engine.evaluate(triggerValues);

      // Clear without acknowledging
      const clearValues = new Map([
        ['AI401@DEV4004', 700]
      ]);
      engine.evaluate(clearValues);

      const all = engine.getAllAlarms();
      const alarm = all.find(a => a.condition === 'F-06');
      expect(alarm.acknowledged).toBe(false);
    });

    it('preserves acknowledged=true when clearing (Property 21)', () => {
      const triggerValues = new Map([
        ['AI401@DEV4004', 1200]
      ]);
      engine.evaluate(triggerValues);

      // Acknowledge the alarm
      engine.acknowledge('F-06', 'cta_student');

      // Clear the condition
      const clearValues = new Map([
        ['AI401@DEV4004', 700]
      ]);
      engine.evaluate(clearValues);

      const all = engine.getAllAlarms();
      const alarm = all.find(a => a.condition === 'F-06');
      expect(alarm.lifecycle).toBe('inactive');
      expect(alarm.acknowledged).toBe(true);
      expect(alarm.operator).toBe('cta_student');
    });
  });

  describe('getActiveAlarms', () => {
    it('returns only alarms with lifecycle=active', () => {
      // Trigger F-01 and F-06
      const values = new Map([
        ['AO103@DEV4006', 25],
        ['AO102@DEV4006', 30],
        ['AI401@DEV4004', 1200]
      ]);
      engine.evaluate(values);

      expect(engine.getActiveAlarms()).toHaveLength(2);

      // Clear F-06
      const clearValues = new Map([
        ['AO103@DEV4006', 25],
        ['AO102@DEV4006', 30],
        ['AI401@DEV4004', 700]
      ]);
      engine.evaluate(clearValues);

      const active = engine.getActiveAlarms();
      expect(active).toHaveLength(1);
      expect(active[0].condition).toBe('F-01');
    });
  });

  describe('acknowledge', () => {
    it('marks alarm as acknowledged with operator name', () => {
      const values = new Map([
        ['AI401@DEV4004', 1200]
      ]);
      engine.evaluate(values);

      engine.acknowledge('F-06', 'cta_instructor');

      const active = engine.getActiveAlarms();
      expect(active[0].acknowledged).toBe(true);
      expect(active[0].operator).toBe('cta_instructor');
    });

    it('does nothing for non-existent rule ID', () => {
      engine.acknowledge('F-99', 'someone');
      // No error thrown
      expect(engine.getActiveAlarms()).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('clears all alarms', () => {
      const values = new Map([
        ['AO103@DEV4006', 25],
        ['AO102@DEV4006', 30],
        ['AI401@DEV4004', 1200]
      ]);
      engine.evaluate(values);
      expect(engine.getActiveAlarms().length).toBeGreaterThan(0);

      engine.reset();
      expect(engine.getActiveAlarms()).toHaveLength(0);
      expect(engine.getAllAlarms()).toHaveLength(0);
    });
  });

  describe('Fault rule conditions', () => {
    it('F-01: triggers only when BOTH AHU-4-6 PHT>20 AND CHW>20', () => {
      // Only PHT high — should not trigger
      expect(engine.evaluate(new Map([['AO103@DEV4006', 25], ['AO102@DEV4006', 10]]))).toHaveLength(0);
      engine._reset();

      // Only CHW high — should not trigger
      expect(engine.evaluate(new Map([['AO103@DEV4006', 10], ['AO102@DEV4006', 25]]))).toHaveLength(0);
      engine._reset();

      // Both at exactly 20 — should not trigger (>20 required)
      expect(engine.evaluate(new Map([['AO103@DEV4006', 20], ['AO102@DEV4006', 20]]))).toHaveLength(0);
      engine._reset();

      // Both above 20 — should trigger
      const alarms = engine.evaluate(new Map([['AO103@DEV4006', 21], ['AO102@DEV4006', 21]]));
      expect(alarms.find(a => a.condition === 'F-01')).toBeDefined();
    });

    it('F-02: triggers when AHU-4-4 SAT is outside the 52-58°F design band', () => {
      // Within design band
      expect(engine.evaluate(new Map([['AI301@DEV4004', 55]]))).toHaveLength(0);
      engine._reset();

      // At the boundary — should not trigger
      expect(engine.evaluate(new Map([['AI301@DEV4004', 52]]))).toHaveLength(0);
      engine._reset();
      expect(engine.evaluate(new Map([['AI301@DEV4004', 58]]))).toHaveLength(0);
      engine._reset();

      // Below band — should trigger
      const lowAlarms = engine.evaluate(new Map([['AI301@DEV4004', 49]]));
      expect(lowAlarms.find(a => a.condition === 'F-02')).toBeDefined();
      engine._reset();

      // Above band — should trigger
      const highAlarms = engine.evaluate(new Map([['AI301@DEV4004', 62]]));
      expect(highAlarms.find(a => a.condition === 'F-02')).toBeDefined();
    });

    it('F-03: triggers when fan speed > 0 and Run Schedule is OFF', () => {
      // Fan off, schedule off — no trigger
      expect(engine.evaluate(new Map([['AO101@DEV4004', 0], ['BI601@DEV4004', 0]]))).toHaveLength(0);
      engine._reset();

      // Fan on, schedule on — no trigger
      expect(engine.evaluate(new Map([['AO101@DEV4004', 40], ['BI601@DEV4004', 1]]))).toHaveLength(0);
      engine._reset();

      // Fan on, schedule off — should trigger
      const alarms = engine.evaluate(new Map([['AO101@DEV4004', 40], ['BI601@DEV4004', 0]]));
      expect(alarms.find(a => a.condition === 'F-03')).toBeDefined();
    });

    it('F-04: triggers when AHU-4-4 OA damper<5 and Run Schedule ON', () => {
      // OAD high — no trigger
      expect(engine.evaluate(new Map([['AO104@DEV4004', 50], ['BI601@DEV4004', 1]]))).toHaveLength(0);
      engine._reset();

      // OAD low but schedule off — no trigger
      expect(engine.evaluate(new Map([['AO104@DEV4004', 3], ['BI601@DEV4004', 0]]))).toHaveLength(0);
      engine._reset();

      // OAD<5 and schedule ON — should trigger
      const alarms = engine.evaluate(new Map([['AO104@DEV4004', 3], ['BI601@DEV4004', 1]]));
      expect(alarms.find(a => a.condition === 'F-04')).toBeDefined();
    });

    it('F-05: triggers when CT-02 is ON, OAT<55, and OA damper<80', () => {
      // All conditions met
      const alarms = engine.evaluate(new Map([
        ['BI801@DEV6000', 1],
        ['AI701@DEV5000', 50],
        ['AO104@DEV4004', 40]
      ]));
      expect(alarms.find(a => a.condition === 'F-05')).toBeDefined();
      engine._reset();

      // OAT too high — no trigger
      expect(engine.evaluate(new Map([
        ['BI801@DEV6000', 1],
        ['AI701@DEV5000', 60],
        ['AO104@DEV4004', 40]
      ])).filter(a => a.condition === 'F-05')).toHaveLength(0);
      engine._reset();

      // CT off — no trigger
      expect(engine.evaluate(new Map([
        ['BI801@DEV6000', 0],
        ['AI701@DEV5000', 50],
        ['AO104@DEV4004', 40]
      ])).filter(a => a.condition === 'F-05')).toHaveLength(0);
      engine._reset();

      // OA damper already wide open — economizer is doing its job, no trigger
      expect(engine.evaluate(new Map([
        ['BI801@DEV6000', 1],
        ['AI701@DEV5000', 50],
        ['AO104@DEV4004', 90]
      ])).filter(a => a.condition === 'F-05')).toHaveLength(0);
    });

    it('F-06: triggers when AHU-4-4 CO2>1100', () => {
      // Exactly 1100 — should not trigger
      expect(engine.evaluate(new Map([['AI401@DEV4004', 1100]]))).toHaveLength(0);
      engine._reset();

      // Above 1100 — should trigger
      const alarms = engine.evaluate(new Map([['AI401@DEV4004', 1101]]));
      expect(alarms.find(a => a.condition === 'F-06')).toBeDefined();
    });
  });
});
