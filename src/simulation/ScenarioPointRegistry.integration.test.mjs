/**
 * Integration tests — Scenario point overrides against the real PointRegistry.
 *
 * This file exists specifically to catch a class of bug found during a manual
 * code audit: scenarios.js, the old (now-removed) faultRules.js, and
 * FaultEngine.js had each independently invented their own BACnet address
 * naming convention (e.g. "AO_OAD_44@DEV4004") that did not match the real
 * addresses in POINT_CATALOG (e.g. "AO104@DEV4004"). Because PointRegistry
 * .setValue() silently no-ops on an unknown address, every scenario's
 * pointOverrides was a no-op in the running app despite passing unit tests
 * that exercised each file in isolation with its own made-up addresses.
 *
 * These tests load the REAL POINT_CATALOG and the REAL Scenarios array and
 * assert the two actually agree — closing the gap that let the bug ship.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import Scenarios from '../data/reference/scenarios.js';
import { POINT_CATALOG, POINT_BY_ADDRESS } from '../data/points/index.js';

function loadPointRegistry() {
  const code = readFileSync(
    resolve(__dirname, 'PointRegistry.js'),
    'utf-8'
  );
  const window = {};
  const console = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const fn = new Function('window', 'console', code);
  fn(window, console);
  return window.PointRegistry;
}

function loadFaultEngine() {
  const code = readFileSync(
    resolve(__dirname, 'FaultEngine.js'),
    'utf-8'
  );
  const windowObj = {};
  const fn = new Function('window', code);
  fn(windowObj);
  return windowObj.FaultEngine;
}

describe('Scenario point overrides — address integrity', () => {
  it('every scenario pointOverrides key exists in POINT_BY_ADDRESS', () => {
    const knownAddresses = new Set(Object.keys(POINT_BY_ADDRESS));
    const offenders = [];

    Scenarios.forEach(scenario => {
      Object.keys(scenario.pointOverrides || {}).forEach(address => {
        if (!knownAddresses.has(address)) {
          offenders.push(`Scenario ${scenario.id} ("${scenario.name}"): unknown address "${address}"`);
        }
      });
    });

    expect(offenders).toEqual([]);
  });

  it('every scenario pointOverrides value is type-compatible with its point (BI/BO get 0 or 1)', () => {
    const offenders = [];

    Scenarios.forEach(scenario => {
      Object.entries(scenario.pointOverrides || {}).forEach(([address, value]) => {
        const point = POINT_BY_ADDRESS[address];
        if (!point) return; // caught by the previous test

        if (point.type === 'BI' || point.type === 'BO') {
          if (value !== 0 && value !== 1) {
            offenders.push(
              `Scenario ${scenario.id} ("${scenario.name}"): ${address} is ${point.type} but override value is ${value} (expected 0 or 1)`
            );
          }
        } else if (point.type === 'AI' || point.type === 'AO') {
          if (typeof value !== 'number') {
            offenders.push(
              `Scenario ${scenario.id} ("${scenario.name}"): ${address} is ${point.type} but override value is non-numeric (${value})`
            );
          } else if (value < point.min || value > point.max) {
            offenders.push(
              `Scenario ${scenario.id} ("${scenario.name}"): ${address} override ${value} is outside catalog range [${point.min}, ${point.max}]`
            );
          }
        }
      });
    });

    expect(offenders).toEqual([]);
  });
});

describe('Scenario point overrides — actually land in PointRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = loadPointRegistry();
    registry.initialize(POINT_CATALOG);
  });

  it('applying every scenario\'s pointOverrides changes the corresponding live value', () => {
    const failures = [];

    Scenarios.forEach(scenario => {
      // Reset to catalog defaults between scenarios
      registry.initialize(POINT_CATALOG);

      const overrides = scenario.pointOverrides || {};
      const addresses = Object.keys(overrides);
      if (addresses.length === 0) return; // Scenario 1 has no overrides by design

      addresses.forEach(address => {
        registry.setValue(address, overrides[address], 'operator');
      });

      addresses.forEach(address => {
        const liveValue = registry.getValue(address);
        const expectedValue = overrides[address];
        if (liveValue !== expectedValue) {
          failures.push(
            `Scenario ${scenario.id} ("${scenario.name}"): set ${address} to ${expectedValue}, ` +
            `but PointRegistry reports ${liveValue} (override silently failed)`
          );
        }
      });
    });

    expect(failures).toEqual([]);
  });

  it('applying an override puts the point into Manual mode (so interpolation does not overwrite it)', () => {
    const scenario = Scenarios.find(s => Object.keys(s.pointOverrides || {}).length > 0);
    expect(scenario).toBeDefined();

    const address = Object.keys(scenario.pointOverrides)[0];
    registry.setValue(address, scenario.pointOverrides[address], 'operator');

    const metadata = registry.getMetadata(address);
    expect(metadata.mode).toBe('Manual');
  });
});

describe('FaultEngine rules — address integrity against real catalog', () => {
  it('every rule sourcePoint and every address referenced inside a condition exists in POINT_BY_ADDRESS', () => {
    const engine = loadFaultEngine();
    const knownAddresses = new Set(Object.keys(POINT_BY_ADDRESS));

    // Build a values map covering every real address so condition functions
    // can run without throwing, then inspect which addresses each rule
    // actually calls values.get() on by wrapping the Map.
    const offenders = [];

    engine.rules.forEach(rule => {
      if (!knownAddresses.has(rule.sourcePoint)) {
        offenders.push(`Rule ${rule.id}: sourcePoint "${rule.sourcePoint}" not in POINT_BY_ADDRESS`);
      }

      const requestedAddresses = [];
      const trackingMap = {
        get(addr) {
          requestedAddresses.push(addr);
          // Return a plausible value so condition logic doesn't short-circuit
          // before requesting every address it might reference
          return 50;
        }
      };

      try {
        rule.condition(trackingMap, { simHour: 12, phtStuckHours: 5, oaDamperLowHours: 5 });
      } catch (e) {
        // Some rules may throw with a mocked value of 50 for binary points —
        // that's fine, we only care about which addresses were requested
      }

      requestedAddresses.forEach(addr => {
        if (!knownAddresses.has(addr)) {
          offenders.push(`Rule ${rule.id}: condition references unknown address "${addr}"`);
        }
      });
    });

    expect(offenders).toEqual([]);
  });

  it('F-01 through F-06 all fire when fed real catalog addresses with fault-condition values', () => {
    const engine = loadFaultEngine();
    engine._reset();

    const faultValues = new Map([
      ['AO103@DEV4006', 30],  // F-01: AHU-4-6 PHT > 20
      ['AO102@DEV4006', 30],  // F-01: AHU-4-6 CHW > 20
      ['AI301@DEV4004', 45],  // F-02: SAT outside 52-58 band
      ['AO101@DEV4004', 40],  // F-03: fan running...
      ['BI601@DEV4004', 0],   // F-03: ...while schedule OFF; also feeds F-04 (must be 1 there — see note)
      ['AO104@DEV4004', 3],   // F-04: OA damper < 5
      ['BI801@DEV6000', 1],   // F-05: CT running
      ['AI701@DEV5000', 50],  // F-05: OAT < 55
      ['AI401@DEV4004', 1200], // F-06: CO2 > 1,100
    ]);

    const alarms = engine.evaluate(faultValues);
    const firedIds = alarms.map(a => a.condition);

    // F-04 needs BI601=1 (occupied) but F-03 needs BI601=0 (unoccupied) —
    // they're mutually exclusive by design, so verify them separately.
    expect(firedIds).toEqual(expect.arrayContaining(['F-01', 'F-02', 'F-03', 'F-05', 'F-06']));

    engine._reset();
    const f04Values = new Map([
      ['AO104@DEV4004', 3],
      ['BI601@DEV4004', 1]
    ]);
    const f04Alarms = engine.evaluate(f04Values);
    expect(f04Alarms.find(a => a.condition === 'F-04')).toBeDefined();
  });
});
