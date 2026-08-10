/**
 * Unit tests for ThermalModel.
 * ThermalModel.js attaches to `window`, so we set up globals before loading.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Mock browser globals needed by ThermalModel.js
globalThis.window = globalThis;

// Load ThermalModel.js which attaches to window.ThermalModel
const require = createRequire(import.meta.url);
require('./ThermalModel.js');

describe('ThermalModel', () => {
  let model;

  beforeEach(() => {
    model = window.ThermalModel;
  });

  describe('Constants', () => {
    it('exposes TAU = 10 minutes', () => {
      expect(model.TAU).toBe(10);
    });

    it('exposes MAX_RATE = 2 °F/min', () => {
      expect(model.MAX_RATE).toBe(2);
    });

    it('exposes ZONE_PAIRS for AHU-4-4 and AHU-4-6', () => {
      expect(model.ZONE_PAIRS).toHaveLength(2);
      expect(model.ZONE_PAIRS[0]).toEqual({
        ratAddress: 'AI201@DEV4004',
        satAddress: 'AI301@DEV4004',
      });
      expect(model.ZONE_PAIRS[1]).toEqual({
        ratAddress: 'AI201@DEV4006',
        satAddress: 'AI301@DEV4006',
      });
    });
  });

  describe('drift(current, target, elapsedMinutes)', () => {
    it('returns current when elapsedMinutes is 0', () => {
      expect(model.drift(70, 55, 0)).toBe(70);
    });

    it('returns current when elapsedMinutes is negative', () => {
      expect(model.drift(70, 55, -5)).toBe(70);
    });

    it('returns target when current equals target', () => {
      expect(model.drift(72, 72, 5)).toBe(72);
    });

    it('moves toward target (cooling)', () => {
      const result = model.drift(75, 55, 5);
      expect(result).toBeLessThan(75);
      expect(result).toBeGreaterThan(55);
    });

    it('moves toward target (heating)', () => {
      const result = model.drift(60, 75, 5);
      expect(result).toBeGreaterThan(60);
      expect(result).toBeLessThan(75);
    });

    it('never exceeds MAX_RATE cap (2°F/min)', () => {
      // Large delta with 1 minute elapsed: max step should be 2°F
      const result = model.drift(70, 170, 1);
      const step = Math.abs(result - 70);
      expect(step).toBeLessThanOrEqual(2.0 + 0.001);
    });

    it('cap applies correctly with large elapsed time and huge delta', () => {
      // 3 minutes elapsed, max step = 6°F
      const result = model.drift(70, 200, 3);
      const step = Math.abs(result - 70);
      expect(step).toBeLessThanOrEqual(6.0 + 0.001);
    });

    it('settles within 30 simulated minutes (within ~5% of delta)', () => {
      const current = 75;
      const target = 55;
      const delta = Math.abs(target - current);

      const result = model.drift(current, target, 30);
      const remaining = Math.abs(result - target);

      // After 30 min with tau=10, exp(-30/10) = exp(-3) ≈ 0.05
      // So remaining should be ~5% of delta
      expect(remaining).toBeLessThan(delta * 0.06);
    });

    it('exponential approach is correct for small time steps', () => {
      // With a small elapsed time and small delta, max rate won't apply
      const current = 72;
      const target = 70;
      const elapsed = 1;

      const delta = target - current; // -2
      const expectedStep = delta * (1 - Math.exp(-elapsed / 10));
      const expected = current + expectedStep;

      const result = model.drift(current, target, elapsed);
      expect(result).toBeCloseTo(expected, 10);
    });

    it('handles very small temperature differences', () => {
      // When current is very close to target (within 0.001), snaps to target
      const result = model.drift(72.0005, 72, 5);
      expect(result).toBe(72);
    });
  });

  describe('update(pointRegistry, elapsedMinutes)', () => {
    function createMockRegistry(points) {
      const pointsMap = new Map();
      points.forEach(p => pointsMap.set(p.address, p));

      return {
        points: pointsMap,
        getValue(address) {
          const p = pointsMap.get(address);
          return p ? p.currentValue : undefined;
        },
        getMetadata(address) {
          const p = pointsMap.get(address);
          if (!p) return undefined;
          const { currentValue, ...meta } = p;
          return meta;
        },
        setValue(address, value, source) {
          const p = pointsMap.get(address);
          if (p) {
            p.currentValue = value;
            p.lastSource = source;
          }
        }
      };
    }

    it('does nothing when pointRegistry is null', () => {
      expect(() => model.update(null, 1)).not.toThrow();
    });

    it('does nothing when elapsedMinutes is 0', () => {
      const registry = createMockRegistry([
        { address: 'AI201@DEV4004', currentValue: 72, mode: 'Manual' },
        { address: 'AI301@DEV4004', currentValue: 55, mode: 'Manual' },
      ]);
      model.update(registry, 0);
      expect(registry.getValue('AI201@DEV4004')).toBe(72);
    });

    it('does not update RAT when SAT is in Auto mode', () => {
      const registry = createMockRegistry([
        { address: 'AI201@DEV4004', currentValue: 72, mode: 'Auto' },
        { address: 'AI301@DEV4004', currentValue: 55, mode: 'Auto' },
      ]);
      model.update(registry, 5);
      expect(registry.getValue('AI201@DEV4004')).toBe(72);
    });

    it('updates RAT when SAT is in Manual mode', () => {
      const registry = createMockRegistry([
        { address: 'AI201@DEV4004', currentValue: 75, mode: 'Auto' },
        { address: 'AI301@DEV4004', currentValue: 55, mode: 'Manual' },
      ]);
      model.update(registry, 5);
      const newRAT = registry.getValue('AI201@DEV4004');
      expect(newRAT).toBeLessThan(75);
      expect(newRAT).toBeGreaterThan(55);
    });

    it('uses simulation source so RAT stays in Auto mode conceptually', () => {
      const registry = createMockRegistry([
        { address: 'AI201@DEV4004', currentValue: 75, mode: 'Auto' },
        { address: 'AI301@DEV4004', currentValue: 55, mode: 'Manual' },
      ]);
      model.update(registry, 5);
      const ratPoint = registry.points.get('AI201@DEV4004');
      expect(ratPoint.lastSource).toBe('simulation');
    });

    it('handles both AHU zones independently', () => {
      const registry = createMockRegistry([
        { address: 'AI201@DEV4004', currentValue: 75, mode: 'Auto' },
        { address: 'AI301@DEV4004', currentValue: 55, mode: 'Manual' },
        { address: 'AI201@DEV4006', currentValue: 68, mode: 'Auto' },
        { address: 'AI301@DEV4006', currentValue: 72, mode: 'Manual' },
      ]);
      model.update(registry, 5);

      // AHU-4-4: RAT should decrease toward 55
      expect(registry.getValue('AI201@DEV4004')).toBeLessThan(75);

      // AHU-4-6: RAT should increase toward 72
      expect(registry.getValue('AI201@DEV4006')).toBeGreaterThan(68);
    });

    it('handles mid-transition scenario change (Req 19.3)', () => {
      const registry = createMockRegistry([
        { address: 'AI201@DEV4004', currentValue: 75, mode: 'Auto' },
        { address: 'AI301@DEV4004', currentValue: 55, mode: 'Manual' },
      ]);

      // First tick: drift toward 55
      model.update(registry, 5);
      const intermediateRAT = registry.getValue('AI201@DEV4004');
      expect(intermediateRAT).toBeLessThan(75);
      expect(intermediateRAT).toBeGreaterThan(55);

      // Change target (new scenario) — SAT goes to 80
      registry.points.get('AI301@DEV4004').currentValue = 80;

      // Second tick: drift from intermediate value toward 80
      model.update(registry, 5);
      const newRAT = registry.getValue('AI201@DEV4004');
      expect(newRAT).toBeGreaterThan(intermediateRAT);
    });
  });
});
