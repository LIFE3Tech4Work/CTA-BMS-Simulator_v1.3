/**
 * AHU44NewImageOverlay.jsx — Real Honeywell/TecSystems AHU graphic as background
 * image with READ-ONLY hotspot overlays for AHU-4-4.
 *
 * Service: Pre-Function / Ballroom Level 2, Location: Level 4
 *
 * Data flow:
 *   window.AHU44NewState (shared state) → this overlay (READ-ONLY display)
 *   The Controls Sidebar is the ONLY place where values are edited.
 *
 * Hotspot positions mapped from the Honeywell/TecSystems screenshot.
 * Image dimensions reference: ~1024 × 575 (approximate from screenshot aspect)
 *
 * No import/export — exposed as window.AHU44NewImageOverlay
 *
 * v3 image change (from v2): five independent-variable setpoint numbers
 * (Cooling/Heating Coil Active SP, Economizer Temp Control SP, Min OA
 * Airflow SP, CO2 Setpoint) were erased from the source image — these are
 * already live, editable fields in AHU44NewControlsSidebar.jsx, so baking
 * a frozen copy of the same number into the image risked the two silently
 * disagreeing the moment an operator changed the sidebar value. The
 * descriptive text labels (e.g. "ACTIVE SETPOINT (COOLING)") were kept;
 * only the numbers themselves were removed. Also erased the "87.6%RH" /
 * "60.0°F" pair that was duplicated by the supplyStatic/supplyAirRHRef
 * hotspots (see below) — both already had a live overlay, but a
 * semi-transparent hotspot box doesn't fully hide frozen text underneath.
 */

const AHU44NewImageOverlay = (() => {
  'use strict';

  const { useState, useEffect, useContext } = React;

  // ─── Image path ─────────────────────────────────────────────────────────────

  const IMAGE_SRC = 'assets/AHU_4_4_NEW_Honeywell_v4.png';

  // ─── TMY3 Weather Driver ────────────────────────────────────────────────────
  // Pushes live TMY3 outdoor air temperature/enthalpy into AHU44NewController
  // on every simulation tick, mirroring the pattern used by ZoneTabs.jsx's
  // OutsideAirStrip. Outdoor air temperature has no manual override in this
  // controller — see AHU44NewController.js WEATHER_DRIVEN_KEYS / setValue.
  function TMY3WeatherDriver() {
    var simContext = useContext(window.SimulationContext);

    useEffect(function () {
      var row = (simContext && simContext.currentRow) || 1;
      var fraction = (simContext && simContext.interpolationFraction) || 0;
      if (window.AHU44NewController && window.AHU44NewController.updateFromTMY3) {
        window.AHU44NewController.updateFromTMY3(row, fraction);
      }
    }, [simContext && simContext.currentRow, simContext && simContext.interpolationFraction]);

    return null; // driver only — renders nothing
  }

  // ─── Hotspot definitions ────────────────────────────────────────────────────
  // Positions as % of image width/height, measured directly against
  // AHU_4_4_NEW_Honeywell_v4.png (1617×875, same dimensions throughout —
  // pixel content changed, no resize), sourced from the Honeywell
  // SymmetrE screenshot (Hotel_AHU4_4Edit.png, Service: Pre-Function/Ballroom
  // Level 2, Location: Level 4). Each (x,y,w,h) was measured by cropping and
  // gridding the source image at 2x zoom, not estimated by eye.
  //
  // `live: true` hotspots bind to a real AHU44NewController state field and
  // update on every tick. `live: false` hotspots are static reference labels
  // for real values visible on the Honeywell screenshot that are not yet
  // modeled in the controller (e.g. a separate return fan, dual freeze coils,
  // CHW flow GPM) — they display the screenshot's captured value as text so
  // the graphic stays visually complete, but do not imply live simulation.

  const HOTSPOTS = [
    // ── Live, bound to controller state ──────────────────────────────────────
    { id: 'oaCfm', stateKey: 'oaCFM', label: 'OA Plenum CFM', units: 'CFM', live: true,
      x: 8.78, y: 53.37, w: 3.46, h: 1.83 },
    { id: 'oaDamper', stateKey: 'oaDamperPosition', label: 'OA Damper', units: '%', live: true,
      x: 14.84, y: 63.09, w: 2.6, h: 1.6 },
    { id: 'mixedAirTemp', stateKey: 'mixedAirTemp', label: 'Mixed Air Temp', units: '°F', live: true,
      x: 24.61, y: 52.91, w: 3.09, h: 1.94 },
    // preheatTemp: shown in the OA plenum section, BEFORE the return-air mixing point.
    // The "72.9°F" on the real Honeywell screenshot (erased from image in v4) was
    // mixedAirTemp, not preheatTemp. preheatTemp at default 83.4°F OAT = 83.4°F
    // (no heating above the 55°F setpoint), which is correct but different.
    { id: 'phtTemp', stateKey: 'preheatTemp', label: 'Preheat Discharge', units: '°F', live: true,
      x: 18.49, y: 52.91, w: 3.09, h: 1.94 },
    { id: 'phtValve', stateKey: 'phtValvePosition', label: 'Heating Valve', units: '%', live: true,
      x: 40.07, y: 67.66, w: 1.67, h: 1.83 },
    { id: 'chwValve', stateKey: 'chwValvePosition', label: 'Cooling Valve', units: '%', live: true,
      x: 44.84, y: 67.66, w: 1.86, h: 1.83 },
    { id: 'supplyCfm', stateKey: 'cfm', label: 'Supply CFM', units: 'CFM', live: true,
      x: 57.51, y: 57.14, w: 4.95, h: 1.71 },
    { id: 'fanSpeed', stateKey: 'fanSpeed', label: 'VFD Speed', units: '%', live: true,
      x: 67.9, y: 67.66, w: 2.6, h: 1.83 },
    { id: 'fanStatus', stateKey: 'fanRunning', label: 'Fan Status', units: '', live: true,
      x: 60.11, y: 71.09, w: 11.01, h: 4.34 },
    { id: 'interlock', stateKey: 'interlockOn', label: 'Interlock', units: '', live: true,
      x: 57.02, y: 35.66, w: 13.98, h: 8.69 },
    { id: 'supplyStatic', stateKey: 'supplyStaticPressure', label: 'Supply Air %RH', units: '%RH', live: true,
      x: 71.43, y: 54.29, w: 4.64, h: 1.71 },
    { id: 'supplyAirTemp', stateKey: 'supplyAirTemp', label: 'Supply Air Temp / Active SP (Cooling)', units: '°F', live: true,
      x: 71.43, y: 56.69, w: 4.14, h: 1.83 },
    { id: 'returnAirTemp', stateKey: 'returnAirTemp', label: 'Return Air Temp', units: '°F', live: true,
      x: 71.74, y: 22.17, w: 3.4, h: 1.83 },
    { id: 'freezePump', stateKey: 'freezePumpOn', label: 'Freeze Pump', units: '', live: true,
      x: 35.87, y: 72.91, w: 3.83, h: 2.29 },
    { id: 'co2Sensor', stateKey: 'co2Sensor', label: 'CO2 Sensor', units: 'PPM', live: true,
      x: 77.18, y: 22.17, w: 3.22, h: 1.83 },
    { id: 'commonDamper', stateKey: 'commonDamperOpen', label: 'Common Damper', units: '', live: true,
      x: 7.54, y: 36.8, w: 5.32, h: 2.06 },
    { id: 'exhaustDamper', stateKey: 'exhaustDamperPct', label: 'Exhaust Damper', units: '%', live: true,
      x: 15.77, y: 32.91, w: 2.29, h: 1.49 },

    // Static reference values (freeze coils, return fan, duct static) are
    // left as baked text on the image — they're constant and the user
    // confirmed constant values should remain on the image as-is with no
    // hotspot overlay on top. Removing the former live: false hotspots that
    // were doubling those constant values visually (Images 5 & 6 in the
    // user's overlap report). The values are still visible on the diagram
    // image itself:
    //   57.0°F / 56.5°F — freeze coils (one combined preheatTemp in controller)
    //   12,438 CFM / 8,102 CFM / 60 Hz — return fan RF-4-7 (separate unit)
    //   28 BTU / 56.9%RH — return air properties
    //   1.66 IWC — supply duct static pressure
  ];

  // ─── Alarm-related hotspot map ──────────────────────────────────────────────
  // Built from AHU44NewFaultEngine.rules so the graphic can visually surface
  // its own active alarms — the real product ties dynamic display objects'
  // color/flash directly to alarm condition (see Overview guide, "Responding
  // to alarms and events"). Maps stateKey -> [ruleId, ...].
  function buildAlarmKeyMap() {
    var map = {};
    var engine = window.AHU44NewFaultEngine;
    if (!engine || !engine.rules) return map;
    engine.rules.forEach(function (rule) {
      (rule.relatedStateKeys || []).forEach(function (key) {
        if (!map[key]) map[key] = [];
        map[key].push(rule.id);
      });
    });
    return map;
  }

  // ─── Hotspot Component ──────────────────────────────────────────────────────

  function Hotspot({ spot }) {
    var ctrl = window.AHU44NewController;
    var initialState = window.AHU44NewState || (ctrl ? ctrl.getState() : {});
    var [value, setValue] = useState(spot.live === false ? null : initialState[spot.stateKey]);
    var [isManual, setIsManual] = useState(false);
    var [isAlarming, setIsAlarming] = useState(false);

    useEffect(function() {
      if (spot.live === false) return; // static reference marker — no subscription
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) {
        setValue(s[spot.stateKey]);
        if (ctrl.getModes) {
          setIsManual(ctrl.getModes()[spot.stateKey] === 'Manual');
        }
      });
      return unsub;
    }, [spot.stateKey, spot.live]);

    // Poll the AHU-4-4 fault engine for any active alarm tied to this
    // hotspot's stateKey. Only hotspots that actually appear in a fault
    // rule's relatedStateKeys do this work.
    useEffect(function() {
      if (spot.live === false) return;
      var alarmKeyMap = buildAlarmKeyMap();
      var relatedRuleIds = alarmKeyMap[spot.stateKey];
      if (!relatedRuleIds || relatedRuleIds.length === 0) return;

      function checkAlarms() {
        var engine = window.AHU44NewFaultEngine;
        if (!engine || !engine.getActiveAlarms) return;
        var active = engine.getActiveAlarms();
        var matches = active.some(function(a) { return relatedRuleIds.indexOf(a.condition) !== -1; });
        setIsAlarming(matches);
      }

      checkAlarms();
      var interval = setInterval(checkAlarms, 1500);
      return function() { clearInterval(interval); };
    }, [spot.stateKey, spot.live]);

    // Static reference marker — display the screenshot's captured value as-is,
    // styled distinctly (amber/dim) to signal "not live simulation data."
    if (spot.live === false) {
      return React.createElement('div', {
        className: 'absolute flex items-center justify-center rounded ' +
          'bg-amber-950/60 border border-amber-500/40 ' +
          'text-[8px] sm:text-[9px] font-mono text-amber-200/80 ' +
          'shadow pointer-events-none select-none',
        style: {
          left: spot.x + '%',
          top: spot.y + '%',
          width: spot.w + '%',
          height: spot.h + '%',
          minWidth: '36px',
          minHeight: '14px',
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

    // Color coding
    var bgClass = 'bg-black/70 border-cyan-500/50';
    if (typeof value === 'boolean') {
      bgClass = value
        ? 'bg-green-900/80 border-green-400/70'
        : 'bg-red-900/70 border-red-400/50';
    }

    // Active-alarm state — ties this hotspot's appearance to
    // AHU44NewFaultEngine's active alarms (real SymmetrE displays color/
    // flash dynamic objects in response to alarm condition; previously this
    // graphic had no alarm awareness at all).
    var alarmClass = isAlarming ? ' ring-2 ring-red-500 animate-bms-flash' : '';

    return React.createElement('div', {
      className: 'absolute flex items-center justify-center rounded ' +
        bgClass + alarmClass + ' border ' +
        'text-[9px] sm:text-[10px] font-mono text-white font-bold ' +
        'shadow-lg pointer-events-none select-none',
      style: {
        left: spot.x + '%',
        top: spot.y + '%',
        width: spot.w + '%',
        height: spot.h + '%',
        minWidth: '40px',
        minHeight: '16px',
      },
      title: spot.label + ': ' + display + (spot.units ? ' ' + spot.units : '') +
        (isManual ? ' (Manual override)' : '') +
        (isAlarming ? ' — ALARM ACTIVE' : '') + ' (read-only)',
      'aria-label': spot.label + ' ' + display + ' ' + spot.units +
        (isManual ? ' manual override' : '') + (isAlarming ? ' alarm active' : ''),
      role: 'status',
    },
      React.createElement('span', null, display + (spot.units ? ' ' + spot.units : '')),
      // "M" badge — mirrors the real SymmetrE trend-display convention of
      // tagging manually-set values (e.g. "87.0°C M") rather than inventing
      // a non-standard indicator.
      isManual && React.createElement('span', {
        className: 'ml-0.5 text-amber-300',
        title: 'Manually set from Controls Sidebar (not simulation-driven)',
      }, 'M')
    );
  }

  // ─── Main Component ─────────────────────────────────────────────────────────

  function AHU44NewImageOverlayComponent() {
    return React.createElement('div', {
      className: 'relative w-full bg-gray-900',
      'data-testid': 'ahu-44-new-image-overlay',
    },
      // Live weather driver — invisible, pushes TMY3 data into the controller
      // on every simulation tick. Outdoor air temperature is always live —
      // it cannot be manually overridden (see AHU44NewController.js).
      React.createElement(TMY3WeatherDriver, null),

      // Background image (the Honeywell/TecSystems screenshot). Sized by
      // width only (h-auto) so its rendered box always matches its own
      // intrinsic aspect ratio — no letterboxing from object-contain against
      // an indeterminate parent height. The wrapper above has no forced
      // height, so it's exactly as tall as the image, which is what lets the
      // hotspot overlay below (absolute inset-0, matching this same wrapper)
      // stay pixel-aligned with the image at any scroll position or window
      // size. `block` avoids the few px of inline-image whitespace gap that
      // would otherwise nudge the hotspot layer off by a hair.
      React.createElement('img', {
        src: IMAGE_SRC,
        alt: 'AHU-4-4 — Honeywell SymmetrE / TecSystems AHU Schematic (Pre-Function/Ballroom Level 2)',
        className: 'block w-full h-auto',
        draggable: false,
        style: { imageRendering: 'auto' },
      }),

      // READ-ONLY hotspot overlay layer
      React.createElement('div', {
        className: 'absolute inset-0',
        'aria-label': 'AHU-4-4 live values — read-only display driven by Controls Sidebar',
        role: 'region',
      },
        HOTSPOTS.map(function(spot) {
          return React.createElement(Hotspot, {
            key: spot.id,
            spot: spot,
          });
        })
      )
    );
  }

  return AHU44NewImageOverlayComponent;
})();

window.AHU44NewImageOverlay = AHU44NewImageOverlay;
