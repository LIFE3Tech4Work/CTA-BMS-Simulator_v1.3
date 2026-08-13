/**
 * AHUImageOverlay.jsx — Real Honeywell SymmetrE AHU graphic as background
 * image with READ-ONLY hotspot overlays for live point values.
 *
 * Data flow:
 *   window.AHU23State (shared state) → this overlay (READ-ONLY display)
 *   The Controls Sidebar is the ONLY place where values are edited.
 *   This component never modifies state — it only subscribes and renders.
 *
 * Uses the actual BMS screenshots as background, then positions value
 * displays on top at the locations where data appears in the real system.
 *
 * Props:
 *   ahuId - 'AHU-23-1'
 *
 * Hotspot positions are defined as percentages of image dimensions.
 * To adjust positions: open the image, measure pixel coords, divide by
 * image size and multiply by 100 to get %.
 *
 * No import/export — exposed as window.AHUImageOverlay
 */

const AHUImageOverlay = (() => {
  'use strict';

  const { useState, useEffect, useCallback, useRef } = React;

  // ─── Image paths (served from src/assets/) ──────────────────────────────────

  const IMAGE_MAP = {
    'AHU-23-1': 'assets/AHU_23_1_Honeywell.png',
  };

  // ─── Hotspot definitions ────────────────────────────────────────────────────
  // x, y = top-left corner as % of image width/height
  // w, h = width/height as % of image
  // stateKey = key in window.AHU23State to read from
  // All hotspots are READ-ONLY — they display calculated values from the controller

  const HOTSPOT_MAP = {
    'AHU-23-1': [
      // Temperature sensors
      { id: 'phtTemp', stateKey: 'preheatTemp', label: 'TS-1 (PHT Discharge)', units: '°F',
        x: 25, y: 22, w: 7, h: 6 },
      { id: 'satTemp', stateKey: 'supplyAirTemp', label: 'TS-2 (Supply Air)', units: '°F',
        x: 42, y: 22, w: 7, h: 6 },
      // Fan output
      { id: 'cfm', stateKey: 'cfm', label: 'Airflow', units: 'CFM',
        x: 60, y: 12, w: 9, h: 6 },
      { id: 'fanSpeed', stateKey: 'fanSpeed', label: 'VFD Speed', units: '%',
        x: 72, y: 30, w: 6, h: 5 },
      // Damper and valves
      { id: 'oaDamper', stateKey: 'oaDamperPosition', label: 'OA Damper', units: '%',
        x: 6, y: 42, w: 6, h: 5 },
      { id: 'phtValve', stateKey: 'phtValvePosition', label: 'V-1 PHT Valve', units: '%',
        x: 25, y: 42, w: 6, h: 5 },
      { id: 'chwValve', stateKey: 'chwValvePosition', label: 'V-2 CHW Valve', units: '%',
        x: 42, y: 42, w: 6, h: 5 },
      // Status
      { id: 'fanStatus', stateKey: 'fanRunning', label: 'Fan Status', units: '',
        x: 62, y: 55, w: 10, h: 7 },
      // Economizer status indicator
      { id: 'econStatus', stateKey: 'economizerActive', label: 'Economizer', units: '',
        x: 6, y: 55, w: 8, h: 5 },
    ],
  };

  // ─── Hotspot Component (reads from window.AHU23State via controller subscription) ──

  function Hotspot({ spot }) {
    var ctrl = window.AHU23Controller;
    var initialState = window.AHU23State || (ctrl ? ctrl.getState() : {});
    var [value, setValue] = useState(initialState[spot.stateKey]);

    useEffect(function() {
      if (!ctrl) return;
      // Subscribe to state changes — READ-ONLY consumption
      var unsub = ctrl.subscribe(function(s) {
        setValue(s[spot.stateKey]);
      });
      return unsub;
    }, [spot.stateKey]);

    // Format the display value
    var display = '--';
    if (value !== null && value !== undefined) {
      if (typeof value === 'boolean') {
        display = value ? 'ON' : 'OFF';
      } else if (typeof value === 'number') {
        if (spot.stateKey === 'cfm') {
          display = Math.round(value).toLocaleString();
        } else {
          display = value.toFixed(1);
        }
      } else {
        display = String(value);
      }
    }

    // Color coding for status hotspots
    var bgClass = 'bg-black/70 border-cyan-500/50';
    if (typeof value === 'boolean') {
      bgClass = value
        ? 'bg-green-900/80 border-green-400/70'
        : 'bg-red-900/70 border-red-400/50';
    }

    return React.createElement('div', {
      className: 'absolute flex items-center justify-center rounded ' +
        bgClass + ' border ' +
        'text-[9px] sm:text-[10px] font-mono text-white font-bold ' +
        'shadow-lg pointer-events-none select-none',
      style: {
        left: spot.x + '%',
        top: spot.y + '%',
        width: spot.w + '%',
        height: spot.h + '%',
        minWidth: '40px',
        minHeight: '18px',
      },
      title: spot.label + ': ' + display + (spot.units ? ' ' + spot.units : '') + ' (read-only)',
      'aria-label': spot.label + ' ' + display + ' ' + spot.units,
      role: 'status',
    },
      React.createElement('span', null, display + (spot.units ? ' ' + spot.units : ''))
    );
  }

  // ─── Main Component ─────────────────────────────────────────────────────────

  function AHUImageOverlayComponent({ ahuId }) {
    var effectiveId = ahuId || 'AHU-23-1';
    var imageSrc = IMAGE_MAP[effectiveId] || IMAGE_MAP['AHU-23-1'];
    var hotspots = HOTSPOT_MAP[effectiveId] || [];

    return React.createElement('div', {
      className: 'relative w-full bg-gray-900',
      'data-testid': 'ahu-image-overlay',
    },
      // Background image (the real Honeywell SymmetrE screenshot).
      // Sized by width only (h-auto) so its rendered box always matches its
      // own intrinsic aspect ratio — no letterboxing from object-contain
      // against an indeterminate parent height. The wrapper above has no
      // forced height, so it's exactly as tall as the image, which is what
      // lets the hotspot overlay below (absolute inset-0, matching this same
      // wrapper) stay pixel-aligned with the image at any scroll position or
      // window size. `block` avoids the few px of inline-image whitespace
      // gap that would otherwise nudge the hotspot layer off by a hair.
      React.createElement('img', {
        src: imageSrc,
        alt: effectiveId + ' — Honeywell SymmetrE AHU Schematic',
        className: 'block w-full h-auto',
        draggable: false,
        style: { imageRendering: 'auto' },
      }),

      // READ-ONLY hotspot overlay layer
      React.createElement('div', {
        className: 'absolute inset-0',
        'aria-label': 'AHU-23-1 live values — read-only display driven by Controls Sidebar',
        role: 'region',
      },
        hotspots.map(function(spot) {
          return React.createElement(Hotspot, {
            key: spot.id,
            spot: spot,
          });
        })
      )
    );
  }

  return AHUImageOverlayComponent;
})();

window.AHUImageOverlay = AHUImageOverlay;
