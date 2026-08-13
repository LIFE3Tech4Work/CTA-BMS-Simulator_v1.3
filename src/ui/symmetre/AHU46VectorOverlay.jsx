/**
 * AHU46VectorOverlay.jsx — Honeywell SymmetrE Graphic Overlay for AHU-4-6
 * (vector art version)
 *
 * Replaces AHU46ImageOverlay.jsx's PNG-screenshot background with the
 * hand-built vector SVG artwork from CTA-BMS-Simulator_v1.2 (repo2),
 * extracted from src/ui/symmetre/AHU-4-6.dc.html (the "master for shared
 * symbols" artwork source per that repo's docs/BRIEF.md). That file is pure
 * static SVG — no template bindings — so it was lifted directly, unmodified,
 * to src/assets/vector/ahu46_board.svg.
 *
 * The live-value system is UNCHANGED from AHU46ImageOverlay.jsx: same
 * HOTSPOTS list, same Hotspot component, same AHU46Controller.subscribe()
 * wiring, same AHU46FaultEngine alarm banners. Only the background layer
 * changed (PNG <img> → inline SVG).
 *
 * ⚠ KNOWN LIMITATION — read before treating this as done:
 * The HOTSPOTS x/y/w/h percentages below are copy-pasted from
 * AHU46ImageOverlay.jsx, where they were hand-calibrated against the PNG
 * screenshot's layout (AHU_4_6_Hotel_1080p.png). The vector art has a
 * DIFFERENT internal layout (different duct routing, different equipment
 * spacing — it's a redraw, not a trace), so most hotspots will NOT land on
 * the correct spot on the new artwork. They will need to be recalibrated
 * by eye against the new SVG (open the component, compare each hotspot's
 * position against where that value actually reads on the new diagram, and
 * adjust x/y). This file is a structural swap (screenshot → vector,
 * same data-binding pattern) — visual recalibration is the next step,
 * not done here.
 *
 * No import/export — exposed as window.AHU46VectorOverlay
 */

const AHU46VectorOverlay = (() => {
  'use strict';

  const { useState, useEffect, useRef } = React;

  const SVG_SRC = 'assets/vector/ahu46_board.svg';

  // ─── TMY3 Weather Driver — unchanged from AHU46ImageOverlay.jsx ───────────

  function TMY3WeatherDriver() {
    const simCtx = React.useContext(window.SimulationContext);

    useEffect(function() {
      if (!simCtx) return;
      var row = simCtx.currentRow || 1;
      var fraction = simCtx.interpolationFraction || 0;
      if (window.AHU46Controller && window.AHU46Controller.updateFromTMY3) {
        window.AHU46Controller.updateFromTMY3(row, fraction);
      }
    }, [simCtx && simCtx.currentRow, simCtx && simCtx.interpolationFraction]);

    return null;
  }

  // ─── Vector background loader ──────────────────────────────────────────────
  // Fetches the raw SVG markup once and injects it via dangerouslySetInnerHTML.
  // (The SVG is ~39KB of gradients/patterns/paths — hand-converting that to
  // JSX would be both error-prone and pointless; this is the standard pattern
  // for dropping externally-authored SVG into React.)

  function VectorBoard() {
    const [svgMarkup, setSvgMarkup] = useState(null);
    const [loadError, setLoadError] = useState(false);

    useEffect(function() {
      let cancelled = false;
      fetch(SVG_SRC)
        .then(function(res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function(text) {
          if (!cancelled) setSvgMarkup(text);
        })
        .catch(function() {
          if (!cancelled) setLoadError(true);
        });
      return function() { cancelled = true; };
    }, []);

    if (loadError) {
      return React.createElement('div', {
        className: 'w-full aspect-[1613/878] bg-gray-800 flex items-center justify-center text-red-300 text-sm',
      }, 'AHU-4-6 vector artwork failed to load (' + SVG_SRC + ')');
    }

    if (!svgMarkup) {
      return React.createElement('div', {
        className: 'w-full aspect-[1613/878] bg-gray-800 animate-pulse',
      });
    }

    return React.createElement('div', {
      className: 'block w-full h-auto',
      dangerouslySetInnerHTML: { __html: svgMarkup },
    });
  }

  // ─── Hotspot Definitions ────────────────────────────────────────────────────
  // UNCHANGED from AHU46ImageOverlay.jsx — see file header re: recalibration.

  const HOTSPOTS = [
    { id: 'oaCfm',      stateKey: 'oaCFM',            label: 'OA Plenum CFM',  units: 'CFM', live: true,
      x: 20.5, y: 52.0, w: 5.0, h: 1.8 },
    { id: 'oaDamper',   stateKey: 'oaDamperPosition',  label: 'OA Damper',      units: '%',   live: true,
      x: 24.0, y: 63.5, w: 3.5, h: 1.6 },
    { id: 'mixedAirTemp', stateKey: 'mixedAirTemp',   label: 'Mixed Air Temp', units: '°F',  live: true,
      x: 34.5, y: 52.0, w: 3.5, h: 1.8 },
    { id: 'phtTemp',    stateKey: 'preheatTemp',       label: 'Preheat Discharge', units: '°F', live: true,
      x: 20.5, y: 44.5, w: 3.5, h: 1.8 },
    { id: 'phtValve',   stateKey: 'phtValvePosition',  label: 'Heating Valve',  units: '%',   live: true,
      x: 41.0, y: 68.5, w: 3.0, h: 1.6 },
    { id: 'chwValve',   stateKey: 'chwValvePosition',  label: 'Cooling Valve',  units: '%',   live: true,
      x: 49.0, y: 68.5, w: 3.0, h: 1.6 },
    { id: 'supplyCfm',  stateKey: 'cfm',               label: 'Supply CFM',     units: 'CFM', live: true,
      x: 59.5, y: 52.0, w: 5.5, h: 1.8 },
    { id: 'fanStatus',  stateKey: 'fanRunning',         label: 'Fan Status',     units: '',    live: true,
      x: 57.0, y: 41.5, w: 9.5, h: 6.0 },
    { id: 'interlock',  stateKey: 'interlockOn',        label: 'Interlock',      units: '',    live: true,
      x: 57.0, y: 72.0, w: 9.5, h: 6.0 },
    { id: 'supplyAirRH',  stateKey: 'supplyAirRH',          label: 'Supply Air %RH', units: '%RH', live: true,
      x: 77.0, y: 42.5, w: 4.5, h: 1.8 },
    { id: 'supplyAirTemp', stateKey: 'supplyAirTemp',  label: 'Supply Air Temp', units: '°F', live: true,
      x: 77.0, y: 52.0, w: 4.5, h: 1.8 },
    { id: 'returnAirTemp', stateKey: 'returnAirTemp',  label: 'Return Air Temp', units: '°F', live: true,
      x: 70.5, y: 21.5, w: 4.0, h: 1.8 },
    { id: 'returnAirRH', stateKey: 'returnAirRH',      label: 'Return Air %RH', units: '%RH', live: true,
      x: 75.5, y: 21.5, w: 4.0, h: 1.8 },
    { id: 'co2Sensor',  stateKey: 'co2Sensor',          label: 'CO₂ Sensor',     units: 'PPM', live: true,
      x: 80.5, y: 21.5, w: 4.5, h: 1.8 },
    { id: 'freezePump', stateKey: 'freezePumpOn',       label: 'Freeze Pump',    units: '',    live: true,
      x: 35.5, y: 69.5, w: 5.0, h: 2.0 },
    { id: 'exhaustDamper', stateKey: 'exhaustDamperPct', label: 'Exhaust Damper', units: '%', live: true,
      x: 25.0, y: 33.5, w: 3.5, h: 1.6 },
    { id: 'commonDamper', stateKey: 'commonDamperOpen', label: 'Common Damper', units: '',    live: true,
      x: 17.5, y: 36.5, w: 3.5, h: 2.0 },
    // Copy-pasted from AHU46ImageOverlay.jsx, same as the rest of this
    // list — needs recalibration against the vector art (see file header).
    { id: 'ductStaticPressure', stateKey: 'ductStaticPressure', label: 'Duct Static', units: 'IWC', live: true,
      x: 87.0, y: 68.5, w: 4.0, h: 1.8 },
    { id: 'returnFanCfm', stateKey: 'returnFanCFM', label: 'Return Fan CFM', units: 'CFM', live: true,
      x: 63.0, y: 21.5, w: 5.0, h: 1.8 },
    { id: 'returnAirDamper', stateKey: 'returnAirDamperPosition', label: 'Return Air Damper', units: '%', live: true,
      x: 63.0, y: 33.5, w: 3.5, h: 1.6 },
    { id: 'spillDamper', stateKey: 'spillDamperPosition', label: 'Spill Damper', units: '%', live: true,
      x: 68.5, y: 33.5, w: 3.5, h: 1.6 },
  ];

  // ─── Alarm key map — unchanged from AHU46ImageOverlay.jsx ──────────────────

  function buildAlarmKeyMap() {
    var map = {};
    var engine = window.AHU46FaultEngine;
    if (!engine || !engine.rules) return map;
    engine.rules.forEach(function(rule) {
      (rule.relatedStateKeys || []).forEach(function(key) {
        if (!map[key]) map[key] = [];
        map[key].push(rule.id);
      });
    });
    return map;
  }

  // ─── Hotspot component — unchanged from AHU46ImageOverlay.jsx ─────────────

  function Hotspot({ spot }) {
    var ctrl = window.AHU46Controller;
    var initialState = window.AHU46State || (ctrl ? ctrl.getState() : {});
    var [value, setValue] = useState(spot.live === false ? null : initialState[spot.stateKey]);
    var [isManual, setIsManual] = useState(false);
    var [isAlarming, setIsAlarming] = useState(false);

    useEffect(function() {
      if (spot.live === false) return;
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) {
        setValue(s[spot.stateKey]);
        if (ctrl.getModes) {
          setIsManual(ctrl.getModes()[spot.stateKey] === 'Manual');
        }
      });
      return unsub;
    }, [spot.stateKey, spot.live]);

    useEffect(function() {
      if (spot.live === false) return;
      var alarmKeyMap = buildAlarmKeyMap();
      var relatedRuleIds = alarmKeyMap[spot.stateKey];
      if (!relatedRuleIds || relatedRuleIds.length === 0) return;

      function checkAlarms() {
        var engine = window.AHU46FaultEngine;
        if (!engine || !engine.getActiveAlarms) return;
        var active = engine.getActiveAlarms();
        var matches = active.some(function(a) { return relatedRuleIds.indexOf(a.condition) !== -1; });
        setIsAlarming(matches);
      }

      checkAlarms();
      var interval = setInterval(checkAlarms, 1500);
      return function() { clearInterval(interval); };
    }, [spot.stateKey, spot.live]);

    if (spot.live === false) {
      return React.createElement('div', {
        className: 'absolute flex items-center justify-center rounded ' +
          'bg-amber-950/60 border border-amber-500/40 ' +
          'text-[8px] sm:text-[9px] font-mono text-amber-200/80 ' +
          'shadow pointer-events-none select-none',
        style: {
          left: spot.x + '%', top: spot.y + '%',
          width: spot.w + '%', height: spot.h + '%',
          minWidth: '36px', minHeight: '14px',
        },
        title: spot.label + ': ' + spot.refValue + (spot.units ? ' ' + spot.units : '') +
          ' — reference value from source screenshot, not simulated',
        'aria-label': spot.label + ' ' + spot.refValue + ' ' + spot.units + ' (reference, not live)',
        role: 'note',
      },
        React.createElement('span', null, spot.refValue + (spot.units ? ' ' + spot.units : ''))
      );
    }

    var display = '--';
    if (value !== null && value !== undefined) {
      if (typeof value === 'boolean') {
        display = value ? 'ON' : 'OFF';
      } else if (typeof value === 'number') {
        if (spot.stateKey === 'cfm' || spot.stateKey === 'oaCFM') {
          display = Math.round(value).toLocaleString();
        } else {
          display = value.toFixed(1);
        }
      } else {
        display = String(value);
      }
    }

    var bgClass = 'bg-black/70 border-cyan-500/50';
    if (typeof value === 'boolean') {
      bgClass = value
        ? 'bg-green-900/80 border-green-400/70'
        : 'bg-red-900/70 border-red-400/50';
    }

    var alarmClass = isAlarming ? ' ring-2 ring-red-500 animate-bms-flash' : '';

    return React.createElement('div', {
      className: 'absolute flex items-center justify-center rounded ' +
        bgClass + alarmClass + ' border ' +
        'text-[9px] sm:text-[10px] font-mono text-white font-bold ' +
        'shadow-lg pointer-events-none select-none',
      style: {
        left: spot.x + '%', top: spot.y + '%',
        width: spot.w + '%', height: spot.h + '%',
        minWidth: '40px', minHeight: '16px',
      },
      title: spot.label + ': ' + display + (spot.units ? ' ' + spot.units : '') +
        (isManual ? ' (Manual override)' : '') +
        (isAlarming ? ' — ALARM ACTIVE' : '') + ' (read-only)',
      'aria-label': spot.label + ' ' + display + ' ' + spot.units +
        (isManual ? ' manual override' : '') + (isAlarming ? ' alarm active' : ''),
      role: 'status',
    },
      React.createElement('span', null, display + (spot.units ? ' ' + spot.units : '')),
      isManual && React.createElement('span', {
        className: 'ml-0.5 text-amber-300',
        title: 'Manually set from Controls Sidebar (not simulation-driven)',
      }, 'M')
    );
  }

  // ─── Main Component ─────────────────────────────────────────────────────────

  function AHU46VectorOverlayComponent() {
    const [activeFaultIds, setActiveFaultIds] = useState([]);

    useEffect(function() {
      var interval = setInterval(function() {
        if (window.AHU46FaultEngine && window.AHU46Controller) {
          var state = window.AHU46Controller.getState();
          // M-07 (SCENARIO_TRACKING.md item #16) needs the Manual-override
          // map, not just the state snapshot.
          var modes = window.AHU46Controller.getModes ? window.AHU46Controller.getModes() : {};
          var alarms = window.AHU46FaultEngine.evaluate(state, modes);
          setActiveFaultIds(alarms.map(function(a) { return a.condition; }));
        }
      }, 500);
      return function() { clearInterval(interval); };
    }, []);

    return React.createElement('div', {
      className: 'relative w-full bg-gray-900',
      'data-testid': 'ahu-46-vector-overlay',
    },
      React.createElement(TMY3WeatherDriver, null),

      activeFaultIds.includes('M-01') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-red-700 bg-opacity-90 text-white text-xs font-bold text-center'
      }, '⚠ M-01 Supply air exceeds cooling setpoint — cooling coil cannot maintain discharge temp'),
      activeFaultIds.includes('M-02') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-red-700 bg-opacity-90 text-white text-xs font-bold text-center mt-6'
      }, '⚠ M-02 CO₂ exceeds 1,100 ppm ventilation threshold'),
      activeFaultIds.includes('M-03') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-red-700 bg-opacity-90 text-white text-xs font-bold text-center mt-12'
      }, '⚠ M-03 Economizer active while mechanical cooling engaged'),
      activeFaultIds.includes('M-04') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-red-700 bg-opacity-90 text-white text-xs font-bold text-center mt-18'
      }, '⚠ M-04 OA damper below 50% minimum — meeting-room ventilation shortfall'),
      activeFaultIds.includes('M-05') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-red-700 bg-opacity-90 text-white text-xs font-bold text-center mt-24'
      }, '⚠ M-05 Supply Fan VFD in bypass'),
      activeFaultIds.includes('M-06') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-red-700 bg-opacity-90 text-white text-xs font-bold text-center mt-30'
      }, '⚠ M-06 Return Fan VFD in bypass'),
      // Medium priority (amber, not red) — a Manual override isn't
      // necessarily wrong, just worth double-checking. SCENARIO_TRACKING.md
      // item #16.
      activeFaultIds.includes('M-07') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-amber-600 bg-opacity-90 text-white text-xs font-bold text-center mt-36'
      }, '⚠ M-07 Point(s) forced to Manual override'),
      // M-08 (DPS-1, non-critical) — muted, no red/amber urgency coloring,
      // matching its 'low' priority; alarm-only, never a shutdown.
      activeFaultIds.includes('M-08') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-gray-500 bg-opacity-90 text-white text-xs font-bold text-center mt-42'
      }, 'ⓘ M-08 Filter dirty (DPS-1) — non-critical'),
      activeFaultIds.includes('M-09') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-red-700 bg-opacity-90 text-white text-xs font-bold text-center mt-48'
      }, '⚠ M-09 High suction/static pressure trip (DPS-2..5) — manual reset required'),
      activeFaultIds.includes('M-10') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-amber-600 bg-opacity-90 text-white text-xs font-bold text-center mt-54'
      }, '⚠ M-10 Freezestat warning — nuisance delay running'),
      // M-11 (freezestat shutdown, 'urgent') — the SOO explicitly calls
      // this a "critical alarm," the strongest banner on this screen.
      activeFaultIds.includes('M-11') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-red-900 bg-opacity-95 text-white text-xs font-bold text-center mt-60'
      }, '🛑 M-11 FREEZESTAT SHUTDOWN — heating valve forced open, manual reset required'),
      activeFaultIds.includes('M-12') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-red-700 bg-opacity-90 text-white text-xs font-bold text-center mt-66'
      }, '⚠ M-12 Supply/Return Fan VFD fault'),
      activeFaultIds.includes('M-13') && React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-20 px-3 py-1 bg-amber-600 bg-opacity-90 text-white text-xs font-bold text-center mt-72'
      }, '⚠ M-13 Software lockout active'),

      // Vector background — replaces the old <img src={IMAGE_SRC}> PNG
      React.createElement(VectorBoard, null),

      React.createElement('div', {
        className: 'absolute inset-0',
        'aria-label': 'AHU-4-6 live values — read-only display driven by Controls Sidebar',
        role: 'region',
      },
        HOTSPOTS.map(function(spot) {
          return React.createElement(Hotspot, { key: spot.id, spot: spot });
        })
      )
    );
  }

  return AHU46VectorOverlayComponent;
})();

window.AHU46VectorOverlay = AHU46VectorOverlay;
