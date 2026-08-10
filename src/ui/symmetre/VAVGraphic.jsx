/**
 * VAVGraphic.jsx — Schematic diagram for a VAV terminal unit (SVG)
 *
 * Unlike AHU23Graphic.jsx / AHU44NewImageOverlay.jsx (both recreated from
 * real Honeywell SymmetrE screenshots), there is no reference screenshot of
 * a real VAV box screen available for this. This is a clean, clearly-labeled
 * functional schematic — discharge duct in, damper, reheat coil, leaving
 * duct to the zone — driven reactively by window.VAVController, not a
 * pixel-matched recreation of a real product screen.
 *
 * READ-ONLY DISPLAY: editing happens only in VAVControlsSidebar.jsx.
 *
 * No import/export — exposed as window.VAVGraphic
 */

const VAVGraphic = (() => {
  const { useState, useEffect } = React;

  function VAVGraphicComponent({ zoneId }) {
    var ctrl = window.VAVController;
    var initialState = ctrl ? ctrl.getState(zoneId) : {};

    var [state, setState] = useState(initialState || {});
    var [activeFaults, setActiveFaults] = useState([]);
    var [modes, setModes] = useState(ctrl ? ctrl.getModes(zoneId) : {});

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(zoneId, function(s) {
        setState(s);
        if (ctrl.getModes) setModes(ctrl.getModes(zoneId));
      });
      return unsub;
    }, [zoneId]);

    // Poll the fault engine for this zone's active alarms (same 1.5s cadence
    // AHU44NewImageOverlay.jsx uses for its alarm-ring polling)
    useEffect(function() {
      function poll() {
        if (window.VAVFaultEngine && typeof window.VAVFaultEngine.getActiveAlarms === 'function') {
          setActiveFaults(window.VAVFaultEngine.getActiveAlarms(zoneId));
        }
      }
      poll();
      var interval = setInterval(poll, 1500);
      return function() { clearInterval(interval); };
    }, [zoneId]);

    var info = ctrl ? ctrl.getZoneInfo(zoneId) : null;
    var zoneLabel = info ? info.label : zoneId;

    var damperFillColor = '#3b82f6'; // blue, scales with damper position
    var reheatActive = state.reheatValveStatus === 'ON';
    var hasExcessiveReheatFault = activeFaults.some(function(a) { return a.condition === 'V-01'; });
    var hasCO2Fault = activeFaults.some(function(a) { return a.condition === 'V-02'; });
    var hasUnoccupiedRunningFault = activeFaults.some(function(a) { return a.condition === 'V-03'; });

    function row(label, value, units, manual) {
      return React.createElement('div', { className: 'flex justify-between text-sm py-1 border-b border-gray-700' },
        React.createElement('span', { className: 'text-gray-400' }, label),
        React.createElement('span', { className: 'flex items-center gap-1.5' },
          manual && React.createElement('span', {
            className: 'text-[9px] font-bold text-amber-400 bg-amber-900/50 border border-amber-600 rounded px-1',
            title: 'Manually set from Controls Sidebar (not sequence-driven)'
          }, 'M'),
          React.createElement('span', { className: 'font-mono text-white' },
            (typeof value === 'number' ? value.toFixed(1) : String(value)) + (units || '')
          )
        )
      );
    }

    return React.createElement('div', { className: 'p-6 text-white' },
      React.createElement('h2', { className: 'text-lg font-bold mb-1' }, zoneId + ' — ' + zoneLabel),
      React.createElement('p', { className: 'text-xs text-gray-500 mb-4' }, 'Served by AHU-4-4 (functional schematic, not a recreated screen)'),

      // ─── Fault banners ───────────────────────────────────────────────────
      hasExcessiveReheatFault
        ? React.createElement('div', {
            className: 'mb-3 px-3 py-2 rounded border border-red-600 bg-red-900/50 text-red-200 text-sm font-semibold'
          }, '⚠ V-01 Excessive Reheat — discharge air is already cold, reheat is open')
        : null,
      hasCO2Fault
        ? React.createElement('div', {
            className: 'mb-3 px-3 py-2 rounded border border-red-600 bg-red-900/50 text-red-200 text-sm font-semibold'
          }, '⚠ V-02 CO₂ exceeds ventilation threshold')
        : null,
      hasUnoccupiedRunningFault
        ? React.createElement('div', {
            className: 'mb-3 px-3 py-2 rounded border border-red-600 bg-red-900/50 text-red-200 text-sm font-semibold'
          }, '⚠ V-03 Running during unoccupied hours — schedule is OFF but airflow is detected')
        : null,

      // ─── Airflow path schematic ──────────────────────────────────────────
      React.createElement('svg', { viewBox: '0 0 640 160', className: 'w-full max-w-2xl border border-gray-700 rounded bg-gray-900 mb-4' },
        // Inlet duct (from AHU)
        React.createElement('rect', { x: 10, y: 60, width: 120, height: 40, fill: '#1f2937', stroke: '#6b7280' }),
        React.createElement('text', { x: 70, y: 50, fill: '#9ca3af', fontSize: 11, textAnchor: 'middle' }, 'FROM AHU-4-4'),
        React.createElement('text', { x: 70, y: 85, fill: '#e5e7eb', fontSize: 13, textAnchor: 'middle', fontWeight: 'bold' },
          (typeof state.dischargeAirTemp === 'number' ? state.dischargeAirTemp.toFixed(1) : '--') + '°F'),

        // Damper (bowtie symbol, fill scales with position)
        React.createElement('polygon', {
          points: '150,60 190,80 150,100',
          fill: damperFillColor, opacity: Math.max(0.15, (state.damperPosition || 0) / 100)
        }),
        React.createElement('polygon', {
          points: '230,60 190,80 230,100',
          fill: damperFillColor, opacity: Math.max(0.15, (state.damperPosition || 0) / 100)
        }),
        React.createElement('text', { x: 190, y: 45, fill: '#9ca3af', fontSize: 11, textAnchor: 'middle' }, 'DAMPER'),
        React.createElement('text', { x: 190, y: 120, fill: '#e5e7eb', fontSize: 12, textAnchor: 'middle' },
          (state.damperPosition || 0) + '%'),

        // Reheat coil (cross-hatched rectangle, highlights red when active)
        React.createElement('rect', {
          x: 250, y: 60, width: 60, height: 40,
          fill: reheatActive ? '#7f1d1d' : '#1f2937',
          stroke: reheatActive ? '#ef4444' : '#6b7280',
          strokeWidth: reheatActive ? 2 : 1
        }),
        [0, 1, 2, 3].map(function(i) {
          return React.createElement('line', {
            key: i, x1: 255 + i * 14, y1: 60, x2: 255 + i * 14 + 10, y2: 100,
            stroke: reheatActive ? '#fca5a5' : '#4b5563', strokeWidth: 1
          });
        }),
        React.createElement('text', { x: 280, y: 50, fill: '#9ca3af', fontSize: 11, textAnchor: 'middle' }, 'REHEAT'),
        React.createElement('text', { x: 280, y: 120, fill: reheatActive ? '#fca5a5' : '#e5e7eb', fontSize: 12, textAnchor: 'middle' },
          (state.reheatValvePosition || 0) + '%'),

        // Outlet duct (to zone)
        React.createElement('rect', { x: 330, y: 60, width: 130, height: 40, fill: '#1f2937', stroke: '#6b7280' }),
        React.createElement('text', { x: 395, y: 50, fill: '#9ca3af', fontSize: 11, textAnchor: 'middle' }, 'TO ZONE'),
        React.createElement('text', { x: 395, y: 85, fill: '#e5e7eb', fontSize: 13, textAnchor: 'middle', fontWeight: 'bold' },
          (typeof state.leavingAirTemp === 'number' ? state.leavingAirTemp.toFixed(1) : '--') + '°F'),

        // Zone box
        React.createElement('rect', { x: 490, y: 40, width: 130, height: 80, fill: '#111827', stroke: '#6b7280', rx: 4 }),
        React.createElement('text', { x: 555, y: 58, fill: '#9ca3af', fontSize: 11, textAnchor: 'middle' }, zoneLabel),
        React.createElement('text', { x: 555, y: 85, fill: '#e5e7eb', fontSize: 16, textAnchor: 'middle', fontWeight: 'bold' },
          (typeof state.spaceTemp === 'number' ? state.spaceTemp.toFixed(1) : '--') + '°F'),
        React.createElement('text', { x: 555, y: 105, fill: '#9ca3af', fontSize: 10, textAnchor: 'middle' },
          (state.co2Sensor || 0) + ' ppm CO₂')
      ),

      // ─── Readout panel ───────────────────────────────────────────────────
      React.createElement('div', { className: 'max-w-md bg-gray-800 border border-gray-700 rounded p-3' },
        React.createElement('div', { className: 'text-xs uppercase tracking-wide text-gray-500 mb-2' }, 'Live Readings'),
        row('Damper Mode', state.damperMode, ''),
        row('Damper Position', state.damperPosition, '%', modes.damperPosition === 'Manual'),
        row('Airflow', state.airflowCFM, ' CFM'),
        row('Reheat Valve', state.reheatValvePosition, '%', modes.reheatValvePosition === 'Manual'),
        row('Discharge Air Temp (from AHU)', state.dischargeAirTemp, '°F'),
        row('Leaving Air Temp', state.leavingAirTemp, '°F'),
        row('Space Temp', state.spaceTemp, '°F'),
        row('CO₂', state.co2Sensor, ' ppm')
      )
    );
  }

  return VAVGraphicComponent;
})();

// Expose globally — no import/export
window.VAVGraphic = VAVGraphic;
