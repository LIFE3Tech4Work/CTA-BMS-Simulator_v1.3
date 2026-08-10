/**
 * VAVControlsSidebar.jsx — Controls panel for VAV terminal units
 *
 * Follows the same visual/interaction conventions as
 * AHU44NewControlsSidebar.jsx (click-to-edit numeric rows, toggle rows,
 * read-only calculated outputs), parameterized by `zoneId` since
 * VAVController.js manages one zone instance (VAV-4-4-02)
 * through one shared module rather than one file per zone.
 *
 * Note: unlike AHU44NewControlsSidebar.jsx (recreated from an actual
 * Honeywell SymmetrE screenshot — Hotel_AHU4_4Edit.png), there's no
 * reference screenshot of a real VAV box screen to match pixel-for-pixel.
 * This is a clean functional control panel following the same row/section
 * conventions, not a recreated screen.
 *
 * No import/export — exposed as window.VAVControlsSidebar
 */

const VAVControlsSidebar = (() => {
  'use strict';

  const { useState, useEffect } = React;

  // Section header (blue bar) — same convention as AHU44NewControlsSidebar
  function SectionHeader({ title }) {
    return React.createElement('div', {
      className: 'bg-blue-600 px-2 py-1 text-[10px] font-bold text-white uppercase tracking-wide'
    }, title);
  }

  // Editable numeric row
  function EditableRow({ zoneId, label, stateKey, units, min, max, step }) {
    var ctrl = window.VAVController;
    var currentState = ctrl ? ctrl.getState(zoneId) : {};
    var [value, setValue] = useState((currentState && currentState[stateKey]) || 0);
    var [editing, setEditing] = useState(false);
    var [editVal, setEditVal] = useState('');

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(zoneId, function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [zoneId, stateKey]);

    function handleClick() {
      setEditing(true);
      setEditVal(String(typeof value === 'number' ? value : 0));
    }

    function handleSubmit() {
      var num = parseFloat(editVal);
      if (!isNaN(num)) {
        if (min !== undefined && num < min) num = min;
        if (max !== undefined && num > max) num = max;
        if (ctrl) ctrl.setValue(zoneId, stateKey, num);
      }
      setEditing(false);
    }

    function handleKeyDown(e) {
      if (e.key === 'Enter') handleSubmit();
      if (e.key === 'Escape') setEditing(false);
    }

    if (editing) {
      return React.createElement('div', { className: 'flex items-center justify-between px-2 py-0.5 text-[10px] text-gray-800' },
        React.createElement('span', { className: 'flex-1' }, label),
        React.createElement('input', {
          type: 'number', step: step || 1, min: min, max: max,
          className: 'w-14 px-1 py-0 text-[10px] border border-blue-500 rounded bg-white text-black',
          value: editVal,
          onChange: function(e) { setEditVal(e.target.value); },
          onKeyDown: handleKeyDown,
          onBlur: handleSubmit,
          autoFocus: true,
        }),
        React.createElement('span', { className: 'text-[9px] text-gray-600 ml-1' }, units)
      );
    }

    return React.createElement('div', {
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] text-gray-800 cursor-pointer hover:bg-blue-100',
      onClick: handleClick,
      title: 'Click to edit'
    },
      React.createElement('span', { className: 'flex-1' }, label),
      React.createElement('span', {
        className: 'px-1.5 py-0 text-[10px] font-mono rounded border bg-white text-black border-gray-400'
      }, typeof value === 'number' ? value.toFixed(1) : String(value)),
      React.createElement('span', { className: 'text-[9px] text-gray-600 ml-1' }, units)
    );
  }

  // Read-only display row
  function ReadOnlyRow({ zoneId, label, stateKey, units, format }) {
    var ctrl = window.VAVController;
    var currentState = ctrl ? ctrl.getState(zoneId) : {};
    var [value, setValue] = useState((currentState && currentState[stateKey]) || 0);

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(zoneId, function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [zoneId, stateKey]);

    var display = format ? format(value) : (typeof value === 'number' ? value.toFixed(1) : String(value));

    return React.createElement('div', { className: 'flex items-center justify-between px-2 py-0.5 text-[10px] text-gray-800' },
      React.createElement('span', { className: 'flex-1' }, label),
      React.createElement('span', { className: 'font-mono font-bold' }, display),
      React.createElement('span', { className: 'text-[9px] text-gray-600 ml-1' }, units)
    );
  }

  // Toggle row (On/Off)
  function ToggleRow({ zoneId, label, stateKey }) {
    var ctrl = window.VAVController;
    var currentState = ctrl ? ctrl.getState(zoneId) : {};
    var [value, setValue] = useState((currentState && currentState[stateKey]) || false);

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(zoneId, function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [zoneId, stateKey]);

    function toggle() {
      if (ctrl) ctrl.setValue(zoneId, stateKey, !value);
    }

    return React.createElement('div', {
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] text-gray-800 cursor-pointer hover:bg-blue-100',
      onClick: toggle,
    },
      React.createElement('span', { className: 'flex-1' }, label),
      React.createElement('span', {
        className: 'px-2 py-0 text-[10px] font-bold rounded ' +
          (value ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-700')
      }, value ? 'Occupied' : 'Unoccupied')
    );
  }

  // ─── Main Component ─────────────────────────────────────────────────────────

  function VAVControlsSidebarComponent({ zoneId }) {
    var [collapsed, setCollapsed] = useState(false);
    var info = window.VAVController ? window.VAVController.getZoneInfo(zoneId) : null;
    var zoneLabel = info ? info.label : zoneId;

    if (collapsed) {
      return React.createElement('aside', {
        className: 'w-8 flex flex-col items-center pt-2 border-r border-gray-400',
        style: { backgroundColor: '#7fb3d4' }
      },
        React.createElement('button', {
          className: 'text-xs text-gray-700 hover:text-black', onClick: function() { setCollapsed(false); }
        }, '▶')
      );
    }

    return React.createElement('aside', {
      className: 'w-full border-r border-gray-400',
      style: { backgroundColor: '#a8d0e6' },
    },
      // Header
      React.createElement('div', {
        className: 'flex items-center justify-between px-2 py-1 border-b border-gray-400',
        style: { backgroundColor: '#7fb3d4' }
      },
        React.createElement('span', { className: 'text-[11px] font-bold text-gray-800' }, 'Controls — ' + zoneId + ' (' + zoneLabel + ')'),
        React.createElement('button', {
          className: 'text-xs text-gray-600 hover:text-black', onClick: function() { setCollapsed(true); }
        }, '◀')
      ),

      // SCHEDULE
      React.createElement(SectionHeader, { title: 'Schedule' }),
      React.createElement(ToggleRow, { zoneId: zoneId, label: 'Run Schedule', stateKey: 'runSchedule' }),

      // SPACE TEMPERATURE CONTROL
      React.createElement(SectionHeader, { title: 'Space Temperature Control' }),
      React.createElement(EditableRow, { zoneId: zoneId, label: 'Space Temp (sensor)', stateKey: 'spaceTemp', units: '°F', min: 55, max: 90, step: 0.5 }),
      React.createElement(EditableRow, { zoneId: zoneId, label: 'Cooling Setpoint', stateKey: 'spaceTempCoolingSetpoint', units: '°F', min: 65, max: 85, step: 0.5 }),
      React.createElement(EditableRow, { zoneId: zoneId, label: 'Heating Setpoint', stateKey: 'spaceTempHeatingSetpoint', units: '°F', min: 60, max: 80, step: 0.5 }),

      // AIRFLOW CONTROL
      React.createElement(SectionHeader, { title: 'Airflow Control' }),
      React.createElement(EditableRow, { zoneId: zoneId, label: 'Min Airflow Setpoint', stateKey: 'minAirflowSetpoint', units: 'CFM', min: 50, max: 2000 }),
      React.createElement(EditableRow, { zoneId: zoneId, label: 'Max Airflow Setpoint', stateKey: 'maxAirflowSetpoint', units: 'CFM', min: 200, max: 3000 }),

      // VENTILATION
      React.createElement(SectionHeader, { title: 'Ventilation (CO₂ / DCV)' }),
      React.createElement(EditableRow, { zoneId: zoneId, label: 'Controlling CO₂ Sensor', stateKey: 'co2Sensor', units: 'PPM', min: 300, max: 5000 }),
      React.createElement(EditableRow, { zoneId: zoneId, label: 'CO₂ Setpoint (DCV)', stateKey: 'co2Setpoint', units: 'PPM', min: 400, max: 2000 }),

      // CALCULATED OUTPUTS (mostly read-only — Damper Position and Reheat
      // Valve can be manually overridden, same as a real BACnet AO going
      // Manual; see the Manual-output note in VAVController.js's file header)
      React.createElement(SectionHeader, { title: 'Calculated Outputs' }),
      React.createElement(ReadOnlyRow, { zoneId: zoneId, label: 'Damper Mode', stateKey: 'damperMode', units: '' }),
      React.createElement(EditableRow, { zoneId: zoneId, label: 'Damper Position', stateKey: 'damperPosition', units: '%', min: 0, max: 100 }),
      React.createElement(ReadOnlyRow, { zoneId: zoneId, label: 'Airflow', stateKey: 'airflowCFM', units: 'CFM',
        format: function(v) { return Math.round(v).toLocaleString(); } }),
      React.createElement(EditableRow, { zoneId: zoneId, label: 'Reheat Valve', stateKey: 'reheatValvePosition', units: '%', min: 0, max: 100 }),
      React.createElement(ReadOnlyRow, { zoneId: zoneId, label: 'Reheat Status', stateKey: 'reheatValveStatus', units: '' }),
      React.createElement(ReadOnlyRow, { zoneId: zoneId, label: 'Discharge Air Temp (from AHU)', stateKey: 'dischargeAirTemp', units: '°F' }),
      React.createElement(ReadOnlyRow, { zoneId: zoneId, label: 'Leaving Air Temp', stateKey: 'leavingAirTemp', units: '°F' })
    );
  }

  return VAVControlsSidebarComponent;
})();

// Expose globally — no import/export
window.VAVControlsSidebar = VAVControlsSidebar;
