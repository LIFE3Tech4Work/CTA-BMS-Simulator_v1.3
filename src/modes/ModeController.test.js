/**
 * ModeController.test.js — Unit tests for ModeController
 * Tests mode state management, layout configuration, and setMode behavior.
 *
 * Uses vitest globals (globals: true in vitest.config.js).
 */

// Set up a minimal window/global environment before loading the module
globalThis.window = globalThis;
globalThis.React = {
  useContext: () => ({ currentMode: 'companion' }),
  createElement: () => null
};

// Load ModeController (IIFE attaches to window)
require('./ModeController.js');

describe('ModeController', () => {
  beforeEach(() => {
    // Reset to default state
    window.ModeController.currentMode = 'companion';
    window.ModeController._listeners = [];
    window.setModeState = undefined;
  });

  describe('currentMode state', () => {
    it('defaults to companion mode', () => {
      expect(window.ModeController.currentMode).toBe('companion');
    });

    it('accepts companion, freeExplore, and capstone as valid modes', () => {
      expect(window.ModeController.setMode('companion')).toBe(true);
      expect(window.ModeController.setMode('freeExplore')).toBe(true);
      expect(window.ModeController.currentMode).toBe('freeExplore');
      expect(window.ModeController.setMode('capstone')).toBe(true);
      expect(window.ModeController.currentMode).toBe('capstone');
    });

    it('rejects invalid mode strings', () => {
      expect(window.ModeController.setMode('invalid')).toBe(false);
      expect(window.ModeController.setMode('')).toBe(false);
      expect(window.ModeController.setMode('Companion')).toBe(false);
      expect(window.ModeController.currentMode).toBe('companion');
    });
  });

  describe('setMode()', () => {
    it('updates currentMode property', () => {
      window.ModeController.setMode('capstone');
      expect(window.ModeController.currentMode).toBe('capstone');
    });

    it('calls window.setModeState when available', () => {
      const mockSetModeState = vi.fn();
      window.setModeState = mockSetModeState;

      window.ModeController.setMode('freeExplore');

      expect(mockSetModeState).toHaveBeenCalledWith({ currentMode: 'freeExplore' });
    });

    it('does not throw when window.setModeState is not defined', () => {
      window.setModeState = undefined;
      expect(() => window.ModeController.setMode('capstone')).not.toThrow();
    });

    it('returns true without re-notifying when already in the requested mode', () => {
      window.ModeController.currentMode = 'freeExplore';
      const listener = vi.fn();
      window.ModeController.onModeChange(listener);

      const result = window.ModeController.setMode('freeExplore');

      expect(result).toBe(true);
      expect(listener).not.toHaveBeenCalled();
    });

    it('notifies listeners on mode change', () => {
      const listener = vi.fn();
      window.ModeController.onModeChange(listener);

      window.ModeController.setMode('capstone');

      expect(listener).toHaveBeenCalledWith('capstone');
    });
  });

  describe('getLayoutConfig()', () => {
    it('returns 70%/30% for companion mode', () => {
      window.ModeController.currentMode = 'companion';
      const config = window.ModeController.getLayoutConfig();
      expect(config).toEqual({ mainWidth: '70%', panelWidth: '30%' });
    });

    it('returns 100%/0% for freeExplore mode', () => {
      window.ModeController.currentMode = 'freeExplore';
      const config = window.ModeController.getLayoutConfig();
      expect(config).toEqual({ mainWidth: '100%', panelWidth: '0%' });
    });

    it('returns 65%/35% for capstone mode', () => {
      window.ModeController.currentMode = 'capstone';
      const config = window.ModeController.getLayoutConfig();
      expect(config).toEqual({ mainWidth: '65%', panelWidth: '35%' });
    });
  });

  describe('getLayoutConfigForMode()', () => {
    it('returns layout for a specific mode without switching', () => {
      window.ModeController.currentMode = 'companion';
      const config = window.ModeController.getLayoutConfigForMode('capstone');
      expect(config).toEqual({ mainWidth: '65%', panelWidth: '35%' });
      // Current mode unchanged
      expect(window.ModeController.currentMode).toBe('companion');
    });

    it('returns null for invalid mode', () => {
      expect(window.ModeController.getLayoutConfigForMode('invalid')).toBeNull();
    });
  });

  describe('getValidModes()', () => {
    it('returns all three valid mode strings', () => {
      const modes = window.ModeController.getValidModes();
      expect(modes).toEqual(['companion', 'freeExplore', 'capstone']);
    });

    it('returns a copy (not the internal array)', () => {
      const modes = window.ModeController.getValidModes();
      modes.push('test');
      expect(window.ModeController.getValidModes()).toHaveLength(3);
    });
  });

  describe('onModeChange() listener', () => {
    it('returns an unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = window.ModeController.onModeChange(listener);

      window.ModeController.setMode('freeExplore');
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      window.ModeController.setMode('capstone');
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });
  });
});
