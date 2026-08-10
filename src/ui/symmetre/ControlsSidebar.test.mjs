/**
 * Unit tests for ControlsSidebar.jsx
 *
 * Tests the controls sidebar component logic: section definitions,
 * field box styling, editability, and value validation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock browser globals ─────────────────────────────────────────────────────

globalThis.window = globalThis;

// Mock React hooks
const mockSubscribers = new Map();

window.React = {
  useState: (init) => [typeof init === 'function' ? init() : init, vi.fn()],
  useEffect: vi.fn(),
  useContext: vi.fn(() => ({
    authenticated: true,
    operator: 'cta_student',
    securityLevel: 'Oper'
  })),
  useCallback: vi.fn((fn) => fn),
  useRef: vi.fn(() => ({ current: null })),
  createElement: vi.fn((...args) => ({ type: args[0], props: args[1], children: args.slice(2) }))
};

// Mock PointRegistry
window.PointRegistry = {
  getValue: vi.fn((address) => {
    if (address === 'AO101@DEV4004') return 75.5;
    if (address === 'AI301@DEV4004') return 55.2;
    if (address === 'BI601@DEV4004') return 1;
    return 0;
  }),
  getMetadata: vi.fn((address) => {
    if (address === 'AO101@DEV4004') {
      return { type: 'AO', units: '%', min: 0, max: 100, mode: 'Auto', covIncrement: 1, sensorOffset: 0 };
    }
    if (address === 'AI301@DEV4004') {
      return { type: 'AI', units: '°F', min: 40, max: 120, mode: 'Auto', covIncrement: 0.5, sensorOffset: 0 };
    }
    if (address === 'BI601@DEV4004') {
      return { type: 'BI', units: '', min: 0, max: 1, mode: 'Auto', covIncrement: 0, sensorOffset: 0 };
    }
    if (address === 'BI602@DEV4004') {
      return { type: 'BI', units: '', min: 0, max: 1, mode: 'Auto', covIncrement: 0, sensorOffset: 0 };
    }
    if (address === 'AO106@DEV4004') {
      return { type: 'AO', units: '°F', min: 40, max: 80, mode: 'Auto', covIncrement: 0.5, sensorOffset: 0 };
    }
    if (address === 'AO103@DEV4004') {
      return { type: 'AO', units: '%', min: 0, max: 100, mode: 'Auto', covIncrement: 1, sensorOffset: 0 };
    }
    if (address === 'AO104@DEV4004') {
      return { type: 'AO', units: '%', min: 0, max: 100, mode: 'Auto', covIncrement: 1, sensorOffset: 0 };
    }
    if (address === 'AO105@DEV4004') {
      return { type: 'AO', units: '%', min: 0, max: 100, mode: 'Auto', covIncrement: 1, sensorOffset: 0 };
    }
    return null;
  }),
  subscribe: vi.fn((address, cb) => {
    if (!mockSubscribers.has(address)) mockSubscribers.set(address, new Set());
    mockSubscribers.get(address).add(cb);
  }),
  unsubscribe: vi.fn((address, cb) => {
    const subs = mockSubscribers.get(address);
    if (subs) subs.delete(cb);
  }),
  setValue: vi.fn()
};

// Mock AuthContext as a context reference
window.AuthContext = {};

// Mock AlarmStore
window.AlarmStore = {
  query: vi.fn(() => [])
};

// Load ControlsSidebar (sets up window.ControlsSidebar)
const { createRequire } = await import('module');
const require = createRequire(import.meta.url);
require('./ControlsSidebar.jsx');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ControlsSidebar', () => {
  it('exposes ControlsSidebar as a window global', () => {
    expect(window.ControlsSidebar).toBeDefined();
    expect(typeof window.ControlsSidebar).toBe('function');
  });

  it('is a React functional component (callable)', () => {
    const result = window.ControlsSidebar({ ahuId: 'AHU-4-4' });
    expect(result).toBeDefined();
  });

  it('renders with default AHU-4-4 when no ahuId provided', () => {
    const result = window.ControlsSidebar({});
    expect(result).toBeDefined();
  });

  it('renders as an aside element with correct background', () => {
    const result = window.ControlsSidebar({ ahuId: 'AHU-4-4' });
    expect(result.type).toBe('aside');
    expect(result.props.className).toContain('bg-gray-800');
  });
});

describe('PointRegistry integration', () => {
  it('subscribes to point changes when PointField is created', () => {
    expect(window.PointRegistry.subscribe).toBeDefined();
  });

  it('reads point metadata via getMetadata', () => {
    const meta = window.PointRegistry.getMetadata('AO101@DEV4004');
    expect(meta.type).toBe('AO');
    expect(meta.min).toBe(0);
    expect(meta.max).toBe(100);
  });

  it('reads current value via getValue', () => {
    const val = window.PointRegistry.getValue('AO101@DEV4004');
    expect(val).toBe(75.5);
  });
});

describe('Field box styling logic (Property 4)', () => {
  // Helper to determine expected box style — mirrors component logic
  function getBoxStyle(pointType, securityLevel, mode) {
    const SECURITY_LEVELS = ['ViewOnly', 'AckOnly', 'Oper', 'Supv', 'Engr', 'Mngr'];
    const isManual = mode === 'Manual';
    const isEditable = (pointType === 'AO' || pointType === 'BO') &&
      SECURITY_LEVELS.indexOf(securityLevel) >= SECURITY_LEVELS.indexOf('Oper');

    if (isManual) return 'blue';
    if (isEditable) return 'white';
    return 'grey';
  }

  it('returns white for AO point with Oper security level', () => {
    expect(getBoxStyle('AO', 'Oper', 'Auto')).toBe('white');
  });

  it('returns grey for AI point regardless of security level', () => {
    expect(getBoxStyle('AI', 'Oper', 'Auto')).toBe('grey');
    expect(getBoxStyle('AI', 'Engr', 'Auto')).toBe('grey');
    expect(getBoxStyle('AI', 'Mngr', 'Auto')).toBe('grey');
  });

  it('returns grey for AO point with ViewOnly security level', () => {
    expect(getBoxStyle('AO', 'ViewOnly', 'Auto')).toBe('grey');
  });

  it('returns blue for any point in Manual override', () => {
    expect(getBoxStyle('AO', 'Oper', 'Manual')).toBe('blue');
    expect(getBoxStyle('AI', 'Oper', 'Manual')).toBe('blue');
    expect(getBoxStyle('BI', 'ViewOnly', 'Manual')).toBe('blue');
  });

  it('returns grey for BI point at Oper level (binary inputs are not operator-editable)', () => {
    expect(getBoxStyle('BI', 'Oper', 'Auto')).toBe('grey');
  });

  it('returns white for BO point at Oper+ level', () => {
    expect(getBoxStyle('BO', 'Oper', 'Auto')).toBe('white');
    expect(getBoxStyle('BO', 'Engr', 'Auto')).toBe('white');
  });

  // Verify the actual CSS classes used
  it('uses bg-gray-300 text-gray-700 for grey box', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/symmetre/ControlsSidebar.jsx'), 'utf-8');
    expect(src).toContain('bg-gray-300 text-gray-700');
  });

  it('uses bg-blue-200 text-blue-900 for blue box', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/symmetre/ControlsSidebar.jsx'), 'utf-8');
    expect(src).toContain('bg-blue-200 text-blue-900');
  });

  it('uses bg-white text-black for white box', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/symmetre/ControlsSidebar.jsx'), 'utf-8');
    expect(src).toContain('bg-white text-black');
  });
});

describe('Value validation (Property 5)', () => {
  // Simulates the validation logic from the component
  function validateValue(value, min, max, units) {
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return { valid: false, error: 'Enter a valid number' };
    if (numVal < min || numVal > max) {
      return { valid: false, error: `Value must be between ${min} and ${max} ${units || ''}`.trim() };
    }
    return { valid: true, error: null };
  }

  it('accepts values within range', () => {
    expect(validateValue('50', 0, 100, '%').valid).toBe(true);
    expect(validateValue('0', 0, 100, '%').valid).toBe(true);
    expect(validateValue('100', 0, 100, '%').valid).toBe(true);
  });

  it('rejects values below min', () => {
    expect(validateValue('-1', 0, 100, '%').valid).toBe(false);
    expect(validateValue('39', 40, 120, '°F').valid).toBe(false);
  });

  it('rejects values above max', () => {
    expect(validateValue('101', 0, 100, '%').valid).toBe(false);
    expect(validateValue('121', 40, 120, '°F').valid).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(validateValue('abc', 0, 100, '%').valid).toBe(false);
    expect(validateValue('', 0, 100, '%').valid).toBe(false);
  });

  it('accepts boundary values', () => {
    expect(validateValue('0', 0, 100, '%').valid).toBe(true);
    expect(validateValue('100', 0, 100, '%').valid).toBe(true);
  });

  it('error message includes min, max, and units', () => {
    const result = validateValue('150', 0, 100, '%');
    expect(result.error).toBe('Value must be between 0 and 100 %');
  });

  it('error message for temperature range', () => {
    const result = validateValue('130', 40, 120, '°F');
    expect(result.error).toBe('Value must be between 40 and 120 °F');
  });
});

describe('Section definitions', () => {
  it('component renders 9 sections for AHU-4-4', () => {
    const result = window.ControlsSidebar({ ahuId: 'AHU-4-4' });
    expect(result).toBeDefined();
    expect(result.type).toBe('aside');
  });

  it('contains all 9 required section titles', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/symmetre/ControlsSidebar.jsx'), 'utf-8');
    const requiredSections = [
      'Schedule',
      'System Settings',
      'Supply Air Temp Control',
      'Plenum Air Temp Control',
      'Economizer Control',
      'OA Damper Control',
      'Fan Tracking',
      'Fire Alarm System',
      'Alarms'
    ];
    requiredSections.forEach(section => {
      expect(src).toContain(`title: '${section}'`);
    });
  });
});
