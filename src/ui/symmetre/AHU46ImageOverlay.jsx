/**
 * AHU46ImageOverlay.jsx — Honeywell SymmetrE Graphic Overlay for AHU-4-6
 *
 * Displays the real AHU_4_6_Hotel.png screenshot as a background and layers
 * live value hotspots over it, driven by AHU46Controller state. Follows the
 * exact same pattern as AHU44NewImageOverlay.jsx — read that file's header
 * for the full design rationale.
 *
 * AHU_4_6_Hotel.png dimensions: 1920×1080
 *   Service: Pre-Function & Meeting Room, 2nd Level, Location: Level 4
 *   Source:  Honeywell SymmetrE R410.2, AHU-04-06.htm, 12-Jun-26 13:02:30
 *
 * v1 image note: certain independent-variable setpoint numbers from the
 * original screenshot are baked into the image (4500 CFM, 58.0°F, 55.0°F
 * active setpoints). These should be erased in a future image-editing pass
 * (same methodology as AHU-4-4's v1→v4 progression) — added to the
 * next-steps list but not blocking the initial build.
 *
 * Constant values on the image (leave as-is, no hotspot overlay):
 *   8376 CFM / 6172 CFM / 47 Hz — return fan (RF unit, separate, not modeled)
 *   28 BTU / 59.8%RH / 72.1°F  — return air properties (static reference)
 *   56.9°F                       — freeze coil reference (not individually modeled)
 *   2.02 IWC                     — supply duct static (not modeled)
 *
 * No import/export — exposed as window.AHU46ImageOverlay
 */

const AHU46ImageOverlay = (() => {
  'use strict';

  const { useState, useEffect, useRef } = React;

  // AHU_4_6_Hotel_1080p.png (1920×1080) — cropped from the original 3604×1452
  // screenshot, which had blank white space in the right ~47% (the actual AHU
  // display area occupied only the left 1920px). The full-width asset caused
  // hotspot percentage positions to resolve into the blank white region.
  // With this crop, x/y % positions map correctly to the visible diagram.
  const IMAGE_SRC = 'assets/AHU_4_6_Hotel_1080p.png';

  // ─── TMY3 Weather Driver ────────────────────────────────────────────────────

  // Invisible component that subscribes to the simulation clock and pushes
  // TMY3 weather data into AHU46Controller on every tick — same pattern as
  // AHU44NewImageOverlay.jsx's TMY3WeatherDriver.
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

  // ─── Hotspot Definitions ────────────────────────────────────────────────────
  // Positions: x/y as % of image width/height; w/h as % of image width/height.
  // live: true  = reads from AHU46Controller state (changes each tick)
  // live: false = static reference (shows frozen screenshot value, clearly labeled)

  const HOTSPOTS = [
    // ── Live values ────────────────────────────────────────────────────────────
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
    { id: 'supplyAirRH',  stateKey: 'supplyStaticPressure', label: 'Supply Air %RH', units: '%RH', live: true,
      x: 77.0, y: 42.5, w: 4.5, h: 1.8 },
    { id: 'supplyAirTemp', stateKey: 'supplyAirTemp',  label: 'Supply Air Temp', units: '°F', live: true,
      x: 77.0, y: 52.0, w: 4.5, h: 1.8 },
    { id: 'returnAirTemp', stateKey: 'returnAirTemp',  label: 'Return Air Temp', units: '°F', live: true,
      x: 70.5, y: 21.5, w: 4.0, h: 1.8 },
    { id: 'co2Sensor',  stateKey: 'co2Sensor',          label: 'CO₂ Sensor',     units: 'PPM', live: true,
      x: 80.5, y: 21.5, w: 4.5, h: 1.8 },
    { id: 'freezePump', stateKey: 'freezePumpOn',       label: 'Freeze Pump',    units: '',    live: true,
      x: 35.5, y: 69.5, w: 5.0, h: 2.0 },
    { id: 'exhaustDamper', stateKey: 'exhaustDamperPct', label: 'Exhaust Damper', units: '%', live: true,
      x: 25.0, y: 33.5, w: 3.5, h: 1.6 },
    { id: 'commonDamper', stateKey: 'commonDamperOpen', label: 'Common Damper', units: '',    live: true,
      x: 17.5, y: 36.5, w: 3.5, h: 2.0 },
  ];

  // ─── Alarm key map ──────────────────────────────────────────────────────────
  // Builds a map of stateKey → [ruleId, ...] from AHU46FaultEngine's M-series
  // rules (M-01..M-04). Same pattern as AHU44NewImageOverlay's buildAlarmKeyMap,
  // but referencing window.AHU46FaultEngine — the N-series rules on AHU-4-4
  // cover completely different operating conditions (economizer changeover temp,
  // supply fan VFD, simultaneous heat/cool) and would not be meaningful here.

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

  // ─── Hotspot component ──────────────────────────────────────────────────────

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

    // Only poll the fault engine for hotspots whose stateKey actually appears
    // in an M-series rule's relatedStateKeys — avoids unnecessary work on
    // fields like preheatTemp or returnAirTemp that no fault rule references.
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

    // Static reference marker
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

    // Format display value
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

    // Color-coded background: boolean ON → green, OFF → red, numeric → dark cyan
    var bgClass = 'bg-black/70 border-cyan-500/50';
    if (typeof value === 'boolean') {
      bgClass = value
        ? 'bg-green-900/80 border-green-400/70'
        : 'bg-red-900/70 border-red-400/50';
    }

    // Alarm ring + flash when an M-series rule referencing this field is active
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

  function AHU46ImageOverlayComponent() {
    const [activeFaultIds, setActiveFaultIds] = useState([]);

    useEffect(function() {
      var interval = setInterval(function() {
        if (window.AHU46FaultEngine && window.AHU46Controller) {
          var state = window.AHU46Controller.getState();
          var alarms = window.AHU46FaultEngine.evaluate(state);
          setActiveFaultIds(alarms.map(function(a) { return a.condition; }));
        }
      }, 500);
      return function() { clearInterval(interval); };
    }, []);

    return React.createElement('div', {
      className: 'relative w-full bg-gray-900',
      'data-testid': 'ahu-46-image-overlay',
    },
      // TMY3 weather driver — pushes live weather into AHU46Controller
      React.createElement(TMY3WeatherDriver, null),

      // Fault banners
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
      }, '⚠ M-04 OA damper below 60% minimum — meeting-room ventilation shortfall'),

      // Background image — sized by width (h-auto) so hotspot % positions always
      // match the actual rendered image area; same fix applied to AHU-4-4 in v3.
      React.createElement('img', {
        src: IMAGE_SRC,
        alt: 'AHU-4-6 — Honeywell SymmetrE / TecSystems AHU Schematic (Pre-Function & Meeting Room, 2nd Level)',
        className: 'block w-full h-auto',
        draggable: false,
      }),

      // Live hotspot overlay
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

  return AHU46ImageOverlayComponent;
})();

window.AHU46ImageOverlay = AHU46ImageOverlay;
