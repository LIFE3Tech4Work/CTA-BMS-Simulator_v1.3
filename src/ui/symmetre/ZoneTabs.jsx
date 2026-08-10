/**
 * ZoneTabs.jsx — AHU/VAV navigation tab bar + Outside Air data strip
 *
 * Renders the row of station tabs (AHU-4-6, AHU-4-4, AHU-23-1, VAV-4-4-02)
 * and the blue OA Strip below them that shows live TMY3 weather values.
 *
 * No import/export — exposes window.ZoneTabs and window.OutsideAirStrip
 */

// ── OutsideAirStrip ───────────────────────────────────────────────────────────
// Reads TMY3 weather from SimulationContext and renders the horizontal blue bar
// that mimics the Honeywell SymmetrE / EBI bottom-of-screen weather display.
const OutsideAirStrip = (function () {
  'use strict';
  const { useContext } = React;

  function OutsideAirStripComponent({ variant }) {
    var simCtx = useContext(window.SimulationContext);
    var currentRow = (simCtx && simCtx.currentRow) || 1;
    var fraction   = (simCtx && simCtx.interpolationFraction) || 0;

    var weather = (window.TMY3Projector && window.TMY3Projector.interpolateWeather)
      ? window.TMY3Projector.interpolateWeather(currentRow, fraction)
      : null;

    function fmt(val, dec) {
      return (val != null && !isNaN(val)) ? Number(val).toFixed(dec != null ? dec : 1) : '--';
    }

    // Honeywell blue style (used by AHU-4-4 and AHU-23-1)
    // Standard gray style (used by AHU-4-6 and VAV screens)
    var isBlue = variant !== 'standard';

    var bgClass  = isBlue ? 'bg-blue-700'      : 'bg-gray-700';
    var lblClass = isBlue ? 'text-blue-200'     : 'text-gray-400';
    var valClass = isBlue ? 'text-white font-bold' : 'text-gray-100 font-bold';

    function Cell(label, value, unit) {
      return React.createElement('div', {
        key: label,
        className: 'flex flex-col items-center px-3 border-r border-blue-600/40 last:border-r-0'
      },
        React.createElement('span', { className: lblClass + ' text-[9px] uppercase tracking-wide' }, label),
        React.createElement('span', { className: valClass + ' text-[11px]' },
          value + (unit ? '\u00a0' + unit : '')
        )
      );
    }

    return React.createElement('div', {
      className: bgClass + ' flex items-center h-8 px-2 border-b border-gray-600 select-none overflow-x-auto',
      style: { minHeight: '32px' }
    },
      React.createElement('span', { className: lblClass + ' text-[9px] font-semibold uppercase tracking-wider mr-3 shrink-0' },
        'Outside Air'
      ),
      Cell('OA Temp',    fmt(weather && weather.dryBulb),     '°F'),
      Cell('RH',         fmt(weather && weather.relHumidity),  '%'),
      Cell('Dewpoint',   fmt(weather && weather.dewPoint),     '°F'),
      Cell('Wetbulb',    fmt(weather && weather.wetBulb),      '°F'),
      Cell('Enthalpy',   fmt(weather && weather.enthalpy),     'BTU/lb')
    );
  }

  return OutsideAirStripComponent;
})();

window.OutsideAirStrip = OutsideAirStrip;

// ── ZoneTabs ──────────────────────────────────────────────────────────────────
// Renders the horizontal tab bar and the OA Strip below it.
const ZoneTabs = (function () {
  'use strict';
  const { useState, useEffect, useCallback } = React;

  // ─── Tab Definitions ────────────────────────────────────────────────────────
  const ZONE_TABS = [
    { id: 'AHU-4-6',    label: 'AHU-4-6',               icon: '🌀', route: '#/symmetre/AHU-4-6',    isZone: false },
    { id: 'AHU-4-4',    label: 'AHU-4-4',               icon: '🌀', route: '#/symmetre/AHU-4-4',    isZone: false },
    { id: 'AHU-23-1',   label: 'AHU-23-1',              icon: '🌀', route: '#/symmetre/AHU-23-1',   isZone: false },
    { id: 'VAV-4-4-02', label: 'VAV-4-4-02 (Ballroom)', icon: '🌬️', route: '#/symmetre/VAV-4-4-02', isZone: false },
  ];

  // ─── OA Strip variant per tab ────────────────────────────────────────────────
  // AHU-4-4 and AHU-23-1 use the Honeywell blue style; others use standard gray
  function oaVariant(tabId) {
    return (tabId === 'AHU-4-4' || tabId === 'AHU-23-1') ? 'blue' : 'standard';
  }

  // ─── Derive active tab from hash ─────────────────────────────────────────────
  function tabFromHash(hash) {
    if (!hash) return 'AHU-4-4';
    if (hash.indexOf('VAV-4-4-02') !== -1) return 'VAV-4-4-02';
    if (hash.indexOf('AHU-23-1')   !== -1) return 'AHU-23-1';
    if (hash.indexOf('AHU-4-6')    !== -1) return 'AHU-4-6';
    if (hash.indexOf('AHU-4-4')    !== -1) return 'AHU-4-4';
    return 'AHU-4-4';
  }

  // ─── Component ───────────────────────────────────────────────────────────────
  function ZoneTabsComponent() {
    var [activeTab, setActiveTab] = useState(function () {
      return tabFromHash(window.location.hash || '');
    });

    useEffect(function () {
      function syncFromHash() {
        setActiveTab(tabFromHash(window.location.hash || ''));
      }
      syncFromHash();
      window.addEventListener('hashchange', syncFromHash);
      return function () { window.removeEventListener('hashchange', syncFromHash); };
    }, []);

    var handleTabClick = useCallback(function (tab) {
      window.location.hash = tab.route;
    }, []);

    return React.createElement('div', { className: 'flex flex-col select-none shrink-0' },

      // ── Tab row ──────────────────────────────────────────────────────────────
      React.createElement('div', {
        className: 'flex items-end bg-gray-900 border-b border-gray-600 px-1 pt-1 gap-0.5 overflow-x-auto'
      },
        ZONE_TABS.map(function (tab) {
          var isActive = tab.id === activeTab;
          return React.createElement('button', {
            key: tab.id,
            onClick: function () { handleTabClick(tab); },
            className: [
              'flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold rounded-t border-t border-l border-r shrink-0 transition-colors',
              isActive
                ? 'bg-gray-800 border-gray-500 text-cyan-300 border-b-0 -mb-px'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            ].join(' ')
          },
            React.createElement('span', null, tab.icon),
            React.createElement('span', null, tab.label)
          );
        })
      ),

      // ── OA Strip ─────────────────────────────────────────────────────────────
      window.OutsideAirStrip
        ? React.createElement(window.OutsideAirStrip, { variant: oaVariant(activeTab) })
        : null
    );
  }

  return ZoneTabsComponent;
})();

window.ZoneTabs = ZoneTabs;
