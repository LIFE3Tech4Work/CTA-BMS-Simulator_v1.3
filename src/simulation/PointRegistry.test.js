/**
 * Unit tests for PointRegistry.js
 * Tests core functionality: initialize, subscribe, setValue, COV filtering,
 * interpolation, query, and metadata access.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// PointRegistry is an IIFE that attaches to window — for testing we need to load it
// in a way that works with Node/Vitest. We'll eval the file with a mock window.
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

// Sample point catalog for testing
function createTestCatalog() {
  return [
    {
      address: 'AI301@DEV4004',
      name: 'AHU-4-4 Supply Air Temp',
      type: 'AI',
      units: '°F',
      min: 40,
      max: 120,
      covIncrement: 0.5,
      sensorOffset: 0,
      subsystem: 'AHU-4-4',
      module: { data: [55.2, 55.4, 55.1, 55.8, 56.0, 55.5] }
    },
    {
      address: 'AO102@DEV4004',
      name: 'AHU-4-4 CHW Coil Valve',
      type: 'AO',
      units: '%',
      min: 0,
      max: 100,
      covIncrement: 1,
      sensorOffset: 0,
      subsystem: 'AHU-4-4',
      module: { data: [45, 46, 48, 50, 52, 55] }
    },
    {
      address: 'BI601@DEV4004',
      name: 'AHU-4-4 Run Schedule',
      type: 'BI',
      units: '',
      min: 0,
      max: 1,
      covIncrement: 0,
      sensorOffset: 0,
      subsystem: 'AHU-4-4',
      module: { data: [1, 1, 0, 0, 1, 1] }
    },
    {
      address: 'AI201@DEV4006',
      name: 'AHU-4-6 Return Air Temp',
      type: 'AI',
      units: '°F',
      min: 40,
      max: 120,
      covIncrement: 0.5,
      sensorOffset: 0,
      subsystem: 'AHU-4-6',
      module: { data: [72.0, 72.5, 73.0, 72.8, 72.3, 72.0] }
    },
    {
      // Variant — should be skipped during initialization
      address: 'AI401@DEV4004',
      name: 'AHU-4-4 Return Air CO2 (Corrected)',
      type: 'AI',
      units: 'ppm',
      min: 0,
      max: 2000,
      covIncrement: 25,
      sensorOffset: 0,
      subsystem: 'AHU-4-4',
      isVariant: true,
      variantOf: 'AHU04_04RACO2',
      module: { data: [400, 450, 500] }
    }
  ];
}

describe('PointRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = loadPointRegistry();
    registry.initialize(createTestCatalog());
  });

  describe('initialize', () => {
    it('should load non-variant points into the registry', () => {
      const all = registry.getAll();
      expect(all).toHaveLength(4); // 4 non-variant points
    });

    it('should skip variant points', () => {
      expect(registry.getValue('AI401@DEV4004')).toBeUndefined();
    });

    it('should set initial value to first data point', () => {
      expect(registry.getValue('AI301@DEV4004')).toBe(55.2);
      expect(registry.getValue('AO102@DEV4004')).toBe(45);
      expect(registry.getValue('BI601@DEV4004')).toBe(1);
    });

    it('should set default mode to Auto', () => {
      const meta = registry.getMetadata('AI301@DEV4004');
      expect(meta.mode).toBe('Auto');
    });

    it('should set default alarmState', () => {
      const meta = registry.getMetadata('AI301@DEV4004');
      expect(meta.alarmState).toEqual({ lifecycle: 'inactive', acknowledged: true });
    });

    it('should handle null/undefined catalog gracefully', () => {
      registry.initialize(null);
      expect(registry.getAll()).toHaveLength(0);
    });

    it('should handle empty catalog', () => {
      registry.initialize([]);
      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe('getValue', () => {
    it('should return the current value for a known address', () => {
      expect(registry.getValue('AI301@DEV4004')).toBe(55.2);
    });

    it('should return undefined for an unknown address', () => {
      expect(registry.getValue('UNKNOWN@DEV9999')).toBeUndefined();
    });
  });

  describe('setValue', () => {
    it('should update the point value', () => {
      registry.setValue('AI301@DEV4004', 60.0, 'simulation');
      expect(registry.getValue('AI301@DEV4004')).toBe(60.0);
    });

    it('should set mode to Manual when source is operator (Output point)', () => {
      registry.setValue('AO102@DEV4004', 70.0, 'operator');
      const meta = registry.getMetadata('AO102@DEV4004');
      expect(meta.mode).toBe('Manual');
    });

    it('should not crash on unknown address', () => {
      expect(() => registry.setValue('UNKNOWN', 10, 'simulation')).not.toThrow();
    });

    it('should allow operator writes to an Input once it is Out of Service', () => {
      registry.setOutOfService('AI301@DEV4004', true);
      registry.setValue('AI301@DEV4004', 99.0, 'operator');
      expect(registry.getValue('AI301@DEV4004')).toBe(99.0);
    });
  });

  describe('setOutOfService', () => {
    it('should set outOfService to true', () => {
      registry.setOutOfService('AI301@DEV4004', true);
      expect(registry.getMetadata('AI301@DEV4004').outOfService).toBe(true);
    });

    it('should set outOfService back to false', () => {
      registry.setOutOfService('AI301@DEV4004', true);
      registry.setOutOfService('AI301@DEV4004', false);
      expect(registry.getMetadata('AI301@DEV4004').outOfService).toBe(false);
    });

    it('should not crash on unknown address', () => {
      expect(() => registry.setOutOfService('UNKNOWN', true)).not.toThrow();
    });

    it('should notify subscribers when Out of Service changes', () => {
      const callback = vi.fn();
      registry.subscribe('AI301@DEV4004', callback);
      registry.setOutOfService('AI301@DEV4004', true);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('should call subscriber when value changes exceed COV', () => {
      const callback = vi.fn();
      registry.subscribe('AI301@DEV4004', callback);

      // COV for this point is 0.5 — set a value that differs by >= 0.5
      registry.setValue('AI301@DEV4004', 55.8, 'simulation');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should NOT call subscriber when change is below COV threshold', () => {
      const callback = vi.fn();
      registry.subscribe('AI301@DEV4004', callback);

      // Initial value is 55.2, COV is 0.5
      // First setValue triggers notification (first notification always fires)
      registry.setValue('AI301@DEV4004', 55.2, 'simulation');
      // No change from initial — but previousValues hasn't been set yet
      // Actually let's set it to a value that triggers notification first
      registry.setValue('AI301@DEV4004', 55.8, 'simulation'); // triggers (0.6 >= 0.5)
      callback.mockClear();

      // Now set to 55.9 — only 0.1 change from last notified (55.8)
      registry.setValue('AI301@DEV4004', 55.9, 'simulation');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should stop calling subscriber after unsubscribe', () => {
      const callback = vi.fn();
      registry.subscribe('AI301@DEV4004', callback);
      registry.setValue('AI301@DEV4004', 56.0, 'simulation');
      expect(callback).toHaveBeenCalledTimes(1);

      callback.mockClear();
      registry.unsubscribe('AI301@DEV4004', callback);
      registry.setValue('AI301@DEV4004', 57.0, 'simulation');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers for the same point', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      registry.subscribe('AI301@DEV4004', cb1);
      registry.subscribe('AI301@DEV4004', cb2);

      registry.setValue('AI301@DEV4004', 56.0, 'simulation');
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('should always notify binary points on value change', () => {
      const callback = vi.fn();
      registry.subscribe('BI601@DEV4004', callback);

      // Binary point, COV = 0, initial = 1
      registry.setValue('BI601@DEV4004', 0, 'simulation');
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMetadata', () => {
    it('should return metadata without currentValue or data', () => {
      const meta = registry.getMetadata('AI301@DEV4004');
      expect(meta.address).toBe('AI301@DEV4004');
      expect(meta.name).toBe('AHU-4-4 Supply Air Temp');
      expect(meta.type).toBe('AI');
      expect(meta.units).toBe('°F');
      expect(meta.min).toBe(40);
      expect(meta.max).toBe(120);
      expect(meta.covIncrement).toBe(0.5);
      expect(meta).not.toHaveProperty('currentValue');
      expect(meta).not.toHaveProperty('data');
    });

    it('should return undefined for unknown address', () => {
      expect(registry.getMetadata('UNKNOWN')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all points as array', () => {
      const all = registry.getAll();
      expect(all).toHaveLength(4);
      expect(all[0]).toHaveProperty('address');
      expect(all[0]).toHaveProperty('currentValue');
    });
  });

  describe('query', () => {
    it('should filter by subsystem', () => {
      const result = registry.query({ subsystem: 'AHU-4-4' });
      expect(result).toHaveLength(3);
      result.forEach(p => expect(p.subsystem).toBe('AHU-4-4'));
    });

    it('should filter by type', () => {
      const result = registry.query({ type: 'AI' });
      expect(result).toHaveLength(2);
      result.forEach(p => expect(p.type).toBe('AI'));
    });

    it('should filter by multiple criteria', () => {
      const result = registry.query({ subsystem: 'AHU-4-4', type: 'AI' });
      expect(result).toHaveLength(1);
      expect(result[0].address).toBe('AI301@DEV4004');
    });

    it('should return all points for empty filter', () => {
      expect(registry.query({})).toHaveLength(4);
      expect(registry.query(null)).toHaveLength(4);
    });

    it('should return empty array for no matches', () => {
      expect(registry.query({ subsystem: 'NonExistent' })).toHaveLength(0);
    });
  });

  describe('interpolate', () => {
    it('should set value to first data point at row 1 with fraction 0', () => {
      registry.interpolate(1, 0);
      expect(registry.getValue('AI301@DEV4004')).toBe(55.2);
    });

    it('should interpolate between adjacent rows', () => {
      // data = [55.2, 55.4, 55.1, 55.8, 56.0, 55.5]
      // row 2 with fraction 0.5: data[1] + 0.5 * (data[2] - data[1])
      // = 55.4 + 0.5 * (55.1 - 55.4) = 55.4 + 0.5 * (-0.3) = 55.25
      registry.interpolate(2, 0.5);
      expect(registry.getValue('AI301@DEV4004')).toBeCloseTo(55.25, 5);
    });

    it('should use exact row value when fraction is 0', () => {
      // row 3, fraction 0: data[2] = 55.1
      registry.interpolate(3, 0);
      expect(registry.getValue('AI301@DEV4004')).toBe(55.1);
    });

    it('should clamp to last value at end of data', () => {
      // data has 6 values, row 6 is the last
      registry.interpolate(6, 0);
      expect(registry.getValue('AI301@DEV4004')).toBe(55.5);
    });

    it('should round binary points to 0 or 1', () => {
      // BI data = [1, 1, 0, 0, 1, 1]
      // row 2 fraction 0.5: data[1] + 0.5 * (data[2] - data[1]) = 1 + 0.5 * (-1) = 0.5
      // >= 0.5 → rounds to 1
      registry.interpolate(2, 0.5);
      expect(registry.getValue('BI601@DEV4004')).toBe(1);

      // row 2 fraction 0.6: 1 + 0.6 * (0 - 1) = 1 - 0.6 = 0.4 → rounds to 0
      registry.interpolate(2, 0.6);
      expect(registry.getValue('BI601@DEV4004')).toBe(0);
    });

    it('should not update points in Manual mode', () => {
      registry.setValue('AO102@DEV4004', 99.0, 'operator');
      registry.interpolate(3, 0);
      // Should remain at 99.0, not data[2] = 48
      expect(registry.getValue('AO102@DEV4004')).toBe(99.0);
    });

    it('should not update points that are Out of Service', () => {
      registry.setOutOfService('AI301@DEV4004', true);
      registry.setValue('AI301@DEV4004', 99.0, 'operator');
      registry.interpolate(3, 0);
      // Should remain at 99.0, not data[2] = 55.1
      expect(registry.getValue('AI301@DEV4004')).toBe(99.0);
    });

    it('should notify subscribers when interpolation crosses COV', () => {
      const callback = vi.fn();
      registry.subscribe('AO102@DEV4004', callback);

      // AO data = [45, 46, 48, 50, 52, 55], COV = 1
      // Initial value is 45. row 2, fraction 0: data[1] = 46 (delta = 1 >= COV)
      registry.interpolate(2, 0);
      expect(callback).toHaveBeenCalled();
    });
  });
});
