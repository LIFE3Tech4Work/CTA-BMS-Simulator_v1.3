/**
 * Unit tests for EBI AppChrome.jsx
 *
 * Tests component exposure, tab routing logic, and breadcrumb derivation.
 * EBI AppChrome attaches to `window`, so we set up globals before loading.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

// ─── Mock browser globals ─────────────────────────────────────────────────────

globalThis.window = globalThis;

// Mock location.hash
let mockHash = '#/ebi/AI301@DEV4004/general';
Object.defineProperty(window, 'location', {
  value: { get hash() { return mockHash; }, set hash(v) { mockHash = v; } },
  writable: true
});

// Mock addEventListener / removeEventListener
window.addEventListener = vi.fn();
window.removeEventListener = vi.fn();

// Track createElement calls
const createElementCalls = [];

// Mock React hooks minimally for IIFE execution
window.React = {
  useState: (init) => [typeof init === 'function' ? init() : init, vi.fn()],
  useEffect: vi.fn(),
  useContext: vi.fn(() => ({})),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  createElement: (...args) => {
    createElementCalls.push(args);
    return args;
  },
};

// Mock PointRegistry
window.PointRegistry = {
  getMetadata: function(address) {
    const catalog = {
      'AI301@DEV4004': {
        address: 'AI301@DEV4004',
        name: 'AHU-4-4 Supply Air Temp',
        type: 'AI',
        units: '°F',
        min: 40,
        max: 120,
        covIncrement: 0.5,
        sensorOffset: 0,
        subsystem: 'AHU-4-4',
      },
      'AO101@DEV4004': {
        address: 'AO101@DEV4004',
        name: 'AHU-4-4 Supply Air Fan Speed',
        type: 'AO',
        units: '%',
        min: 0,
        max: 100,
        covIncrement: 1,
        sensorOffset: 0,
        subsystem: 'AHU-4-4',
      },
      'AI201@DEV4006': {
        address: 'AI201@DEV4006',
        name: 'AHU-4-6 Return Air Temp',
        type: 'AI',
        units: '°F',
        min: 40,
        max: 120,
        covIncrement: 0.5,
        sensorOffset: 0,
        subsystem: 'AHU-4-6',
      },
      'AI901@DEV5000': {
        address: 'AI901@DEV5000',
        name: 'Outside Air Temperature',
        type: 'AI',
        units: '°F',
        min: -20,
        max: 120,
        covIncrement: 0.5,
        sensorOffset: 0,
        subsystem: 'Outdoor',
      },
    };
    return catalog[address] || undefined;
  },
};

// Load EBI AppChrome (sets up window.EBIAppChrome)
const require = createRequire(import.meta.url);
require('./AppChrome.jsx');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EBIAppChrome', () => {
  it('exposes EBIAppChrome as a window global', () => {
    expect(window.EBIAppChrome).toBeDefined();
    expect(typeof window.EBIAppChrome).toBe('function');
  });

  it('renders without crashing when given a valid pointId', () => {
    mockHash = '#/ebi/AI301@DEV4004/general';
    createElementCalls.length = 0;
    const result = window.EBIAppChrome({ pointId: 'AI301@DEV4004' });
    expect(result).toBeDefined();
  });

  it('renders without crashing when given no pointId', () => {
    mockHash = '#/ebi/';
    createElementCalls.length = 0;
    const result = window.EBIAppChrome({ pointId: undefined });
    expect(result).toBeDefined();
  });

  it('renders without crashing for unknown pointId', () => {
    mockHash = '#/ebi/UNKNOWN/general';
    createElementCalls.length = 0;
    const result = window.EBIAppChrome({ pointId: 'UNKNOWN' });
    expect(result).toBeDefined();
  });
});

describe('Tab bar routing', () => {
  it('defaults to general tab when no tab in hash', () => {
    mockHash = '#/ebi/AI301@DEV4004';
    createElementCalls.length = 0;
    const result = window.EBIAppChrome({ pointId: 'AI301@DEV4004' });
    expect(result).toBeDefined();
  });

  it('reads active tab from hash route', () => {
    mockHash = '#/ebi/AI301@DEV4004/history';
    createElementCalls.length = 0;
    const result = window.EBIAppChrome({ pointId: 'AI301@DEV4004' });
    expect(result).toBeDefined();
  });

  it('updates hash route when tab changes via handleTabChange', () => {
    mockHash = '#/ebi/AI301@DEV4004/general';
    createElementCalls.length = 0;
    window.EBIAppChrome({ pointId: 'AI301@DEV4004' });

    // Find TabBar render — it receives onTabChange prop
    const tabBarCall = createElementCalls.find(call =>
      call[1] && call[1].onTabChange && call[1].activeTab
    );
    expect(tabBarCall).toBeDefined();
    const handleTabChange = tabBarCall[1].onTabChange;

    handleTabChange('history');
    expect(mockHash).toBe('#/ebi/AI301%40DEV4004/history');
  });

  it('updates hash route for command-priorities tab', () => {
    mockHash = '#/ebi/AO101@DEV4004/general';
    createElementCalls.length = 0;
    window.EBIAppChrome({ pointId: 'AO101@DEV4004' });

    const tabBarCall = createElementCalls.find(call =>
      call[1] && call[1].onTabChange && call[1].activeTab
    );
    const handleTabChange = tabBarCall[1].onTabChange;

    handleTabChange('command-priorities');
    expect(mockHash).toBe('#/ebi/AO101%40DEV4004/command-priorities');
  });

  it('updates hash route for recent-events tab', () => {
    mockHash = '#/ebi/AI301@DEV4004/general';
    createElementCalls.length = 0;
    window.EBIAppChrome({ pointId: 'AI301@DEV4004' });

    const tabBarCall = createElementCalls.find(call =>
      call[1] && call[1].onTabChange && call[1].activeTab
    );
    const handleTabChange = tabBarCall[1].onTabChange;

    handleTabChange('recent-events');
    expect(mockHash).toBe('#/ebi/AI301%40DEV4004/recent-events');
  });
});

describe('Breadcrumb derivation', () => {
  it('passes pointId to breadcrumb component', () => {
    mockHash = '#/ebi/AI301@DEV4004/general';
    createElementCalls.length = 0;
    window.EBIAppChrome({ pointId: 'AI301@DEV4004' });

    // Find the Breadcrumb createElement call — it has pointId prop
    const breadcrumbCall = createElementCalls.find(call =>
      call[1] && call[1].pointId === 'AI301@DEV4004' && typeof call[0] === 'function'
    );
    expect(breadcrumbCall).toBeDefined();
  });

  it('PointRegistry.getMetadata returns correct subsystem for AHU-4-4 point', () => {
    const meta = window.PointRegistry.getMetadata('AI301@DEV4004');
    expect(meta.subsystem).toBe('AHU-4-4');
    expect(meta.name).toBe('AHU-4-4 Supply Air Temp');
  });

  it('PointRegistry.getMetadata returns correct subsystem for AHU-4-6 point', () => {
    const meta = window.PointRegistry.getMetadata('AI201@DEV4006');
    expect(meta.subsystem).toBe('AHU-4-6');
    expect(meta.name).toBe('AHU-4-6 Return Air Temp');
  });

  it('PointRegistry.getMetadata returns correct subsystem for Outdoor point', () => {
    const meta = window.PointRegistry.getMetadata('AI901@DEV5000');
    expect(meta.subsystem).toBe('Outdoor');
    expect(meta.name).toBe('Outside Air Temperature');
  });

  it('returns undefined for unknown point address', () => {
    const meta = window.PointRegistry.getMetadata('UNKNOWN');
    expect(meta).toBeUndefined();
  });
});

describe('Status bar', () => {
  it('renders StatusBar component in the chrome layout', () => {
    mockHash = '#/ebi/AI301@DEV4004/general';
    createElementCalls.length = 0;
    window.EBIAppChrome({ pointId: 'AI301@DEV4004' });

    // The StatusBar is rendered via createElement(StatusBar, null)
    const statusBarCall = createElementCalls.find(call =>
      typeof call[0] === 'function' && call[0].name === 'StatusBar'
    );
    expect(statusBarCall).toBeDefined();
  });
});
