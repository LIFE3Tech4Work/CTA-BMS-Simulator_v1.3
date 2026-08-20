/**
 * ZoneTabs.jsx — AHU/VAV navigation tab bar + Outside Air data strip
 *
 * Renders the row of station tabs (AHU-4-6, AHU-4-4, AHU-23-1, VAV-4-4-02)
 * and the blue OA Strip below them that shows live TMY3 weather values.
 *
 * Styling follows the CTA BMS design reference. Tabs, labels, icons, routes and
 * the five weather cells are unchanged from v1.3.
 *
 * No import/export — exposes window.ZoneTabs and window.OutsideAirStrip
 */

// ── OutsideAirStrip ───────────────────────────────────────────────────────────
// Reads TMY3 weather from SimulationContext and renders the horizontal blue bar
// that mimics the Honeywell SymmetrE / EBI weather display.
const OutsideAirStrip = (function () {
  'use strict';
  const { useContext } = React;

  function OutsideAirStripComponent({ variant }) {
    var { useState: useStateOA, useEffect: useEffectOA } = React;
    var simCtx = useContext(window.SimulationContext);
    var currentRow = (simCtx && simCtx.currentRow) || 1;
    var fraction   = (simCtx && simCtx.interpolationFraction) || 0;

    // While a manual weather override is active, this strip shows the
    // override's own reading (a real recorded TMY3 date for a preset, or the
    // hand-typed custom condition) instead of the live sim-clock row — the
    // sim clock itself can't move to an out-of-window date like Jan 1, so
    // showing its unrelated May/June value here while a "Winter" override is
    // in effect made it look like nothing had happened.
    var [ovr, setOvr] = useStateOA(function () {
      return window.WeatherOverride ? window.WeatherOverride.getState() : { active: false };
    });
    useEffectOA(function () {
      if (!window.WeatherOverride) return;
      return window.WeatherOverride.subscribe(setOvr);
    }, []);

    var liveWeather = (window.TMY3Projector && window.TMY3Projector.interpolateWeather)
      ? window.TMY3Projector.interpolateWeather(currentRow, fraction)
      : null;
    var weather = ovr.active ? ovr.weather : liveWeather;

    function fmt(val, dec) {
      return (val != null && !isNaN(val)) ? Number(val).toFixed(dec != null ? dec : 1) : '--';
    }

    // The design reference uses one treatment for this strip on every screen,
    // so the old blue/standard split is no longer applied visually. The prop is
    // still accepted so existing callers (ZoneTabs, VAV screens) keep working.
    function Cell(label, value, unit) {
      return React.createElement('div', {
        key: label,
        style: { display: 'flex', flexDirection: 'column', justifyContent: 'center',
                 padding: '0 13px', borderLeft: '1px solid rgba(255,255,255,.22)', flexShrink: 0 },
      },
        React.createElement('span', {
          style: { color: '#c6d8f2', fontSize: '9px', fontWeight: 700, letterSpacing: '.4px',
                   lineHeight: 1.15, textTransform: 'uppercase' },
        }, label),
        React.createElement('span', { style: { color: '#fff', fontSize: '14px', fontWeight: 800, lineHeight: 1.15 } },
          value,
          unit ? React.createElement('span', {
            style: { fontSize: '9px', color: '#d5e4f8', marginLeft: '2px' },
          }, unit) : null
        )
      );
    }

    // Same blue as the left control panel's section bars (CTAPanel.section) so
    // the strip and the panel read as one palette.
    var SECTION_BLUE = (window.CTAPanel || {}).section || 'linear-gradient(180deg,#3f6fbf,#30528e)';

    return React.createElement('div', {
      className: 'select-none',
      style: { height: '34px', background: SECTION_BLUE,
               display: 'flex', alignItems: 'center', padding: '0 12px',
               overflowX: 'auto', flexShrink: 0 },
    },
      React.createElement('div', {
        style: { display: 'flex', flexDirection: 'column', marginRight: '8px', flexShrink: 0 },
      },
        React.createElement('span', {
          style: { color: '#eaf2ff', fontSize: '11px', fontWeight: 800, letterSpacing: '.5px', lineHeight: 1.15 },
        }, 'OUTSIDE AIR'),
        React.createElement('span', {
          style: { color: ovr.active ? '#ff9bec' : '#c6d8f2', fontSize: '8.5px', fontWeight: 700,
                   letterSpacing: '.3px', lineHeight: 1.15 },
        }, ovr.active
             ? ('OVERRIDE' + (ovr.dateLabel ? ' — ' + ovr.dateLabel : ' — CUSTOM'))
             : 'TMY WEATHER DATA')
      ),
      Cell('OA Temp',    fmt(weather && weather.dryBulb),     '°F'),
      Cell('RH',         fmt(weather && weather.relHumidity),  '%'),
      Cell('Dewpoint',   fmt(weather && weather.dewPoint),     '°F'),
      Cell('Wetbulb',    fmt(weather && weather.wetBulb),      '°F'),
      Cell('Enthalpy',   fmt(weather && weather.enthalpy),     'BTU/lb'),
      React.createElement('div', { style: { flex: 1 } }),
      window.WeatherControl ? React.createElement(window.WeatherControl, null) : null,
      window.ExerciseAuthorButton ? React.createElement(window.ExerciseAuthorButton, null) : null
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
  // Order follows the teaching sequence agreed in the 14 Aug review: the simple
  // terminal box first, then the small single-coil unit, then the two large
  // mixing-box units. AHU-4-3 sits beside AHU-4-4, its paired twin.
  const ZONE_TABS = [
    // VAV-02-03 is built and reachable by URL, but hidden from the tab bar until
    // its content is ready to put in front of students.
    { id: 'VAV-02-03',  label: 'VAV-02-03 (Mtg Rm 214)', icon: '🌬️', route: '#/symmetre/VAV-02-03',  isZone: false, hidden: true },
    { id: 'VAV-4-4-02', label: 'VAV-4-4 (Ballroom)', icon: '🌬️', route: '#/symmetre/VAV-4-4-02', isZone: false },
    { id: 'AHU-23-1',   label: 'AHU-23-1',              icon: '🌀', route: '#/symmetre/AHU-23-1',   isZone: false },
    { id: 'AHU-4-6',    label: 'AHU-4-6',               icon: '🌀', route: '#/symmetre/AHU-4-6',    isZone: false },
    { id: 'AHU-4-4',    label: 'AHU-4-4',               icon: '🌀', route: '#/symmetre/AHU-4-4',    isZone: false },
    { id: 'AHU-4-3',    label: 'AHU-4-3',               icon: '🌀', route: '#/symmetre/AHU-4-3',    isZone: false },
  ];

  // ─── OA Strip variant per tab ────────────────────────────────────────────────
  function oaVariant(tabId) {
    return (tabId === 'AHU-4-4' || tabId === 'AHU-23-1') ? 'blue' : 'standard';
  }

  // ─── Derive active tab from hash ─────────────────────────────────────────────
  function tabFromHash(hash) {
    if (!hash) return 'AHU-4-4';
    if (hash.indexOf('VAV-4-4-02') !== -1) return 'VAV-4-4-02';
    if (hash.indexOf('VAV-02-03')  !== -1) return 'VAV-02-03';
    if (hash.indexOf('AHU-4-3')    !== -1) return 'AHU-4-3';
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

    return React.createElement('div', {
      className: 'flex flex-col select-none shrink-0',
      style: { fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" },
    },

      // ── Tab row ──────────────────────────────────────────────────────────────
      React.createElement('div', {
        style: { height: '34px', background: '#26334a', display: 'flex', alignItems: 'flex-end',
                 gap: '3px', padding: '0 12px', overflowX: 'auto' },
      },
        ZONE_TABS.filter(function (t) { return !t.hidden; }).map(function (tab) {
          var isActive = tab.id === activeTab;
          return React.createElement('button', {
            key: tab.id,
            onClick: function () { handleTabClick(tab); },
            style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 14px 6px',
                     borderRadius: '7px 7px 0 0', fontSize: '12px',
                     fontWeight: isActive ? 800 : 600, cursor: 'pointer', flexShrink: 0,
                     color: isActive ? '#eaf3ff' : '#93a3bd',
                     background: isActive
                       ? ((window.CTAPanel || {}).section || 'linear-gradient(180deg,#3f6fbf,#30528e)')
                       : 'transparent',
                     border: 'none',
                     borderBottom: '3px solid ' + (isActive ? '#7fb2ee' : 'transparent'),
                     fontFamily: 'inherit' },
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
