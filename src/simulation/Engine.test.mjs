/**
 * Unit tests for SimulationEngine.
 * Engine.js attaches to `window`, so we set up globals before loading.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

// Mock browser globals needed by Engine.js
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// Load Engine.js which attaches to window.SimulationEngine
const require = createRequire(import.meta.url);
require('./Engine.js');

describe('SimulationEngine', () => {
  let engine;

  beforeEach(() => {
    engine = window.SimulationEngine;
    engine._reset();
  });

  afterEach(() => {
    engine.pause();
  });

  describe('Initial state', () => {
    it('starts on the seasonally-current row with pause speed and 0 fraction', () => {
      expect(engine.currentRow).toBe(engine.seasonalStartRow());
      expect(engine.speed).toBe('pause');
      expect(engine.interpolationFraction).toBe(0);
      expect(engine.running).toBe(false);
      expect(engine.atEnd).toBe(false);
    });

    it('exposes correct constants', () => {
      expect(engine.TOTAL_ROWS).toBe(8760);
      expect(engine.MS_PER_HOUR).toBe(3600000);
      expect(engine.BASE_DATE.getTime()).toBe(new Date('2025-07-01T00:00:00-04:00').getTime());
    });
  });

  describe('jumpToDate', () => {
    it('returns false for dates before Jul 1 2025', () => {
      const result = engine.jumpToDate(new Date('2025-06-30T23:59:59-04:00'));
      expect(result).toBe(false);
      expect(engine.currentRow).toBe(engine.seasonalStartRow());
    });

    it('returns false for dates after Jun 30 2026 23:00', () => {
      const result = engine.jumpToDate(new Date('2026-07-01T00:00:00-04:00'));
      expect(result).toBe(false);
      expect(engine.currentRow).toBe(engine.seasonalStartRow());
    });

    it('returns false for invalid dates', () => {
      expect(engine.jumpToDate(new Date('invalid'))).toBe(false);
      expect(engine.jumpToDate(null)).toBe(false);
      expect(engine.jumpToDate('2025-07-01')).toBe(false);
    });

    it('jumps to row 1 for Jul 1 2025 00:00', () => {
      const result = engine.jumpToDate(new Date('2025-07-01T00:00:00-04:00'));
      expect(result).toBe(true);
      expect(engine.currentRow).toBe(1);
      expect(engine.interpolationFraction).toBe(0);
    });

    it('jumps to row 2 for Jul 1 2025 01:00', () => {
      const result = engine.jumpToDate(new Date('2025-07-01T01:00:00-04:00'));
      expect(result).toBe(true);
      expect(engine.currentRow).toBe(2);
      expect(engine.interpolationFraction).toBe(0);
    });

    it('jumps to correct row with fractional time', () => {
      const result = engine.jumpToDate(new Date('2025-07-01T01:30:00-04:00'));
      expect(result).toBe(true);
      expect(engine.currentRow).toBe(2);
      expect(engine.interpolationFraction).toBeCloseTo(0.5, 5);
    });

    it('jumps to row 8760 for the exact end date', () => {
      const result = engine.jumpToDate(new Date('2026-06-30T23:00:00-04:00'));
      expect(result).toBe(true);
      expect(engine.currentRow).toBe(8760);
      expect(engine.interpolationFraction).toBe(0);
    });

    it('jumps to correct row for a mid-range date', () => {
      // Jul 5, 12:00 → (4 days * 24 + 12) = 108 hours from base → row 109
      const result = engine.jumpToDate(new Date('2025-07-05T12:00:00-04:00'));
      expect(result).toBe(true);
      expect(engine.currentRow).toBe(109);
      expect(engine.interpolationFraction).toBe(0);
    });

    it('notifies listeners when jumping', () => {
      const listener = vi.fn();
      engine.onTick(listener);
      engine.jumpToDate(new Date('2025-07-03T00:00:00-04:00'));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        rowIndex: 49,
        interpolationFraction: 0
      }));
    });
  });

  describe('getCurrentTimestamp', () => {
    it('returns base date for row 1 fraction 0', () => {
      // Jump explicitly rather than relying on the opening row: the clock now
      // opens on the seasonally-current row, which is only row 1 because this
      // suite loads Engine.js without TMY3Projector.
      engine.jumpToDate(engine.BASE_DATE);
      const ts = engine.getCurrentTimestamp();
      expect(ts.getTime()).toBe(engine.BASE_DATE.getTime());
    });

    it('returns correct timestamp after jump', () => {
      engine.jumpToDate(new Date('2025-07-10T06:00:00-04:00'));
      const ts = engine.getCurrentTimestamp();
      expect(ts.getTime()).toBe(new Date('2025-07-10T06:00:00-04:00').getTime());
    });
  });

  describe('setSpeed', () => {
    it('changes speed without resetting position (Property 17)', () => {
      engine.jumpToDate(new Date('2025-07-15T12:00:00-04:00'));
      const rowBefore = engine.currentRow;
      const fracBefore = engine.interpolationFraction;

      engine.setSpeed('60x');
      expect(engine.currentRow).toBe(rowBefore);
      expect(engine.interpolationFraction).toBe(fracBefore);
      expect(engine.speed).toBe('60x');
      engine.pause();
    });

    it('rejects invalid speed values', () => {
      engine.setSpeed('invalid');
      expect(engine.speed).toBe('pause');
    });

    it('pauses when speed set to pause', () => {
      engine.setSpeed('3600x');
      expect(engine.running).toBe(true);
      engine.setSpeed('pause');
      expect(engine.running).toBe(false);
      expect(engine.speed).toBe('pause');
    });
  });

  describe('onTick / offTick', () => {
    it('registers and calls a listener', () => {
      const listener = vi.fn();
      engine.onTick(listener);
      engine.jumpToDate(new Date('2025-07-01T00:00:00-04:00'));
      expect(listener).toHaveBeenCalled();
    });

    it('does not register the same listener twice', () => {
      const listener = vi.fn();
      engine.onTick(listener);
      engine.onTick(listener);
      engine.jumpToDate(new Date('2025-07-01T00:00:00-04:00'));
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('removes a listener with offTick', () => {
      const listener = vi.fn();
      engine.onTick(listener);
      engine.offTick(listener);
      engine.jumpToDate(new Date('2025-07-01T00:00:00-04:00'));
      expect(listener).not.toHaveBeenCalled();
    });

    it('listener receives correct event shape', () => {
      const listener = vi.fn();
      engine.onTick(listener);
      engine.jumpToDate(new Date('2025-07-02T06:30:00-04:00'));

      const event = listener.mock.calls[0][0];
      expect(event).toHaveProperty('rowIndex');
      expect(event).toHaveProperty('interpolationFraction');
      expect(event).toHaveProperty('timestamp');
      expect(event.rowIndex).toBe(31);
      expect(event.interpolationFraction).toBeCloseTo(0.5, 5);
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('start / pause', () => {
    it('start begins running', () => {
      engine.start();
      expect(engine.running).toBe(true);
      expect(engine.speed).not.toBe('pause');
      engine.pause();
    });

    it('pause stops running', () => {
      engine.start();
      engine.pause();
      expect(engine.running).toBe(false);
    });

    it('start from pause defaults to 1x speed', () => {
      engine.start();
      expect(engine.speed).toBe('1x');
      engine.pause();
    });

    it('start after end resets to the seasonally-current row', () => {
      engine.jumpToDate(engine.END_DATE);
      expect(engine.atEnd).toBe(true);
      engine.start();
      expect(engine.currentRow).toBe(engine.seasonalStartRow());
      expect(engine.interpolationFraction).toBe(0);
      expect(engine.atEnd).toBe(false);
      engine.pause();
    });
  });

  describe('SPEED_MULTIPLIERS', () => {
    it('has correct values for all speeds', () => {
      expect(engine.SPEED_MULTIPLIERS['1x']).toBeCloseTo(1 / 3600, 10);
      expect(engine.SPEED_MULTIPLIERS['60x']).toBeCloseTo(1 / 60, 10);
      expect(engine.SPEED_MULTIPLIERS['3600x']).toBe(1);
      expect(engine.SPEED_MULTIPLIERS['pause']).toBe(0);
    });
  });
});
