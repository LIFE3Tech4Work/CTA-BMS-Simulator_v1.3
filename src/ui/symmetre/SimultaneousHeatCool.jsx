/**
 * SimultaneousHeatCool.jsx — Amber warning overlay for simultaneous heating and cooling
 * 
 * Displays an amber semi-transparent overlay on the AHU graphic when BOTH:
 *   - Preheat Coil Valve (AO103) > 20%
 *   - CHW Coil Valve (AO102) > 20%
 * 
 * Overlay is hidden when either value falls to 20% or below.
 * 
 * Props:
 *   ahuId - 'AHU-4-4' or 'AHU-4-6' to determine which point addresses to watch
 * 
 * No import/export — exposed as window.SimultaneousHeatCool
 */

const SimultaneousHeatCool = (() => {
  const { useState, useEffect } = React;

  // Point address mapping per AHU
  const ADDRESS_MAP = {
    'AHU-4-4': {
      phtCoilValve: 'AO103@DEV4004',
      chwCoilValve: 'AO102@DEV4004',
    },
    'AHU-4-6': {
      phtCoilValve: 'AO103@DEV4006',
      chwCoilValve: 'AO102@DEV4006',
    },
  };

  function SimultaneousHeatCoolComponent({ ahuId }) {
    const effectiveAhuId = ahuId || 'AHU-4-4';
    const addresses = ADDRESS_MAP[effectiveAhuId] || ADDRESS_MAP['AHU-4-4'];

    const [phtValue, setPhtValue] = useState(0);
    const [chwValue, setChwValue] = useState(0);

    useEffect(() => {
      const registry = window.PointRegistry;
      if (!registry) return;

      // Get initial values
      const initialPht = registry.getValue(addresses.phtCoilValve);
      if (initialPht !== undefined) setPhtValue(initialPht);

      const initialChw = registry.getValue(addresses.chwCoilValve);
      if (initialChw !== undefined) setChwValue(initialChw);

      // Subscribe for reactive updates
      function onPhtUpdate(point) {
        setPhtValue(typeof point.currentValue === 'number' ? point.currentValue : 0);
      }
      function onChwUpdate(point) {
        setChwValue(typeof point.currentValue === 'number' ? point.currentValue : 0);
      }

      registry.subscribe(addresses.phtCoilValve, onPhtUpdate);
      registry.subscribe(addresses.chwCoilValve, onChwUpdate);

      return () => {
        registry.unsubscribe(addresses.phtCoilValve, onPhtUpdate);
        registry.unsubscribe(addresses.chwCoilValve, onChwUpdate);
      };
    }, [addresses.phtCoilValve, addresses.chwCoilValve]);

    // Overlay visible only when BOTH values exceed 20%
    const isActive = phtValue > 20 && chwValue > 20;

    if (!isActive) return null;

    return React.createElement('div', {
      className: 'absolute inset-0 z-20 flex items-center justify-center pointer-events-none',
      'data-testid': 'simultaneous-heat-cool-overlay',
    },
      // Semi-transparent amber background
      React.createElement('div', {
        className: 'absolute inset-0 bg-amber-500 opacity-20 rounded-lg',
      }),
      // Warning text
      React.createElement('div', {
        className: 'relative bg-amber-600/90 text-white px-4 py-2 rounded-md shadow-lg border border-amber-400 flex items-center gap-2',
      },
        React.createElement('span', { className: 'text-xl' }, '⚠'),
        React.createElement('span', { className: 'text-sm font-bold tracking-wide' },
          'SIMULTANEOUS HEATING AND COOLING'
        )
      )
    );
  }

  return SimultaneousHeatCoolComponent;
})();

// Expose on window for browser use (no import/export)
window.SimultaneousHeatCool = SimultaneousHeatCool;
