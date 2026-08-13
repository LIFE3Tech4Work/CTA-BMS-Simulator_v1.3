/**
 * Unit tests for HDHCDHCounter.
 * HDHCDHCounter.js attaches to `window`, so we set up globals before loading.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Mock browser globals
globalThis.window = globalThis;

// Load HDHCDHCounter.js
const require = createRequire(import.meta.url);
require('./HDHCDHCounter.js');

describe('HDHCDHCounter', () => {
  let counter;

  beforeEach(() => {
    counter = window.HDHCDHCounter;
    counter.reset();
  });

  describe('Constants', () => {
    it('BASE_TEMP is 65°F', () => {
      expect(counter.BASE_TEMP).toBe(65);
    });
  });

  describe('reset', () => {
    it('zeros both counters', () => {
      counter.tick(50); // add some HDH
      counter.tick(80); // add some CDH
      counter.reset();

      const values = counter.getValues();
      expect(values.heatDegreeHours).toBe(0);
      expect(values.coolDegreeHours).toBe(0);
    });

    it('zeros getters', () => {
      counter.tick(50);
      counter.reset();
      expect(counter.heatDegreeHours).toBe(0);
      expect(counter.coolDegreeHours).toBe(0);
    });
  });

  describe('tick', () => {
    it('increments HDH when temp below 65°F', () => {
      counter.tick(50); // 65 - 50 = 15 HDH
      expect(counter.heatDegreeHours).toBe(15);
      expect(counter.coolDegreeHours).toBe(0);
    });

    it('increments CDH when temp above 65°F', () => {
      counter.tick(80); // 80 - 65 = 15 CDH
      expect(counter.heatDegreeHours).toBe(0);
      expect(counter.coolDegreeHours).toBe(15);
    });

    it('does not increment at exactly 65°F', () => {
      counter.tick(65);
      expect(counter.heatDegreeHours).toBe(0);
      expect(counter.coolDegreeHours).toBe(0);
    });

    it('accumulates over multiple ticks', () => {
      counter.tick(55); // HDH += 10
      counter.tick(45); // HDH += 20
      counter.tick(75); // CDH += 10
      counter.tick(85); // CDH += 20

      expect(counter.heatDegreeHours).toBe(30);
      expect(counter.coolDegreeHours).toBe(30);
    });

    it('handles fractional temperatures', () => {
      counter.tick(64.5); // HDH += 0.5
      expect(counter.heatDegreeHours).toBeCloseTo(0.5, 5);

      counter.tick(65.5); // CDH += 0.5
      expect(counter.coolDegreeHours).toBeCloseTo(0.5, 5);
    });

    it('handles very cold temperatures', () => {
      counter.tick(0); // HDH += 65
      expect(counter.heatDegreeHours).toBe(65);
    });

    it('handles very hot temperatures', () => {
      counter.tick(100); // CDH += 35
      expect(counter.coolDegreeHours).toBe(35);
    });

    it('ignores null/undefined/NaN input', () => {
      counter.tick(null);
      counter.tick(undefined);
      counter.tick(NaN);

      expect(counter.heatDegreeHours).toBe(0);
      expect(counter.coolDegreeHours).toBe(0);
    });
  });

  describe('getValues', () => {
    it('returns an object with both counter fields', () => {
      const values = counter.getValues();
      expect(values).toHaveProperty('heatDegreeHours');
      expect(values).toHaveProperty('coolDegreeHours');
    });

    it('reflects accumulated state', () => {
      counter.tick(50);
      counter.tick(80);

      const values = counter.getValues();
      expect(values.heatDegreeHours).toBe(15);
      expect(values.coolDegreeHours).toBe(15);
    });
  });
});
