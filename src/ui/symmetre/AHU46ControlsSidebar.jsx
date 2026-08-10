/**
 * AHU46ControlsSidebar.jsx — Interactive Honeywell-style Controls for AHU-4-6
 *
 * Recreated from Honeywell SymmetrE / TecSystems screenshot (AHU-04-06.htm,
 * 12-Jun-26 13:02:30).
 * Service: Meeting Room 2nd Level, Location: Level 4
 *
 * Editable controls that drive the AHU46Controller state model.
 * Changing values here recalculates outputs shown on the diagram.
 *
 * Key difference from AHU-4-4 sidebar: Minimum Position defaults to 60%
 * (meeting-room ASHRAE 62.1 ventilation requirement, vs 20% for the
 * Pre-Function/Ballroom). Min OA Airflow Active SP is 4500 CFM (vs 4900).
 *
 * No import/export — exposed as window.AHU46ControlsSidebar
 */

const AHU46ControlsSidebar = (() => {
  'use strict';

  const { useState, useEffect } = React;

  function SectionHeader({ title }) {
    return React.createElement('div', {
      className: 'bg-blue-600 px-2 py-1 text-[10px] font-bold text-white uppercase tracking-wide'
    }, title);
  }

  function EditableRow({ label, stateKey, units, min, max, step }) {
    var ctrl = window.AHU46Controller;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] !== undefined ? currentState[stateKey] : 0);
    var [editing, setEditing] = useState(false);
    var [editVal, setEditVal] = useState('');

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [stateKey]);

    function handleClick() {
      setEditing(true);
      setEditVal(String(typeof value === 'number' ? value : 0));
    }

    function handleSubmit() {
      var num = parseFloat(editVal);
      if (!isNaN(num)) {
        if (min !== undefined && num < min) num = min;
        if (max !== undefined && num > max) num = max;
        if (ctrl) ctrl.setValue(stateKey, num);
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

  function ReadOnlyRow({ label, stateKey, units, format }) {
    var ctrl = window.AHU46Controller;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] !== undefined ? currentState[stateKey] : 0);

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [stateKey]);

    var display = format ? format(value) : (typeof value === 'number' ? value.toFixed(1) : String(value));

    return React.createElement('div', { className: 'flex items-center justify-between px-2 py-0.5 text-[10px] text-gray-800' },
      React.createElement('span', { className: 'flex-1' }, label),
      React.createElement('span', { className: 'font-mono font-bold' }, display),
      React.createElement('span', { className: 'text-[9px] text-gray-600 ml-1' }, units)
    );
  }

  function ToggleRow({ label, stateKey }) {
    var ctrl = window.AHU46Controller;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] || false);

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [stateKey]);

    function toggle() { if (ctrl) ctrl.setValue(stateKey, !value); }

    return React.createElement('div', {
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] text-gray-800 cursor-pointer hover:bg-blue-100',
      onClick: toggle,
    },
      React.createElement('span', { className: 'flex-1' }, label),
      React.createElement('span', {
        className: 'px-2 py-0 text-[10px] font-bold rounded ' +
          (value ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-700')
      }, value ? 'On' : 'Off')
    );
  }

  function NormToggleRow({ label, stateKey }) {
    var ctrl = window.AHU46Controller;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] || false);

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [stateKey]);

    function toggle() { if (ctrl) ctrl.setValue(stateKey, !value); }

    return React.createElement('div', {
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] text-gray-800 cursor-pointer hover:bg-blue-100',
      onClick: toggle,
    },
      React.createElement('span', { className: 'flex-1' }, label),
      React.createElement('span', {
        className: 'px-2 py-0 text-[10px] font-bold rounded ' +
          (value ? 'bg-red-500 text-white' : 'bg-green-600 text-white')
      }, value ? 'ACTIVE' : 'NORM')
    );
  }

  // ─── LL97 Panel (import from shared component, same as AHU-4-4) ─────────

  // ─── Main Component ─────────────────────────────────────────────────────────

  function AHU46ControlsSidebarComponent() {
    var [collapsed, setCollapsed] = useState(false);

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
      className: 'w-full border-r border-gray-400 overflow-y-auto',
      style: { backgroundColor: '#a8d0e6' },
    },
      // Header
      React.createElement('div', {
        className: 'flex items-center justify-between px-2 py-1 border-b border-gray-400',
        style: { backgroundColor: '#7fb3d4' }
      },
        React.createElement('span', { className: 'text-[11px] font-bold text-gray-800' }, 'Controls — AHU-4-6'),
        React.createElement('button', {
          className: 'text-xs text-gray-600 hover:text-black', onClick: function() { setCollapsed(true); }
        }, '◀')
      ),

      // SCHEDULE
      React.createElement(SectionHeader, { title: 'Schedule' }),
      React.createElement(ToggleRow, { label: 'Run Schedule', stateKey: 'runSchedule' }),

      // TIMER CONTROL
      React.createElement(SectionHeader, { title: 'Timer Control' }),
      React.createElement(ToggleRow, { label: 'System Starting', stateKey: 'systemStarting' }),
      React.createElement(EditableRow, { label: 'Starting Time Setpoint', stateKey: 'startingTimeSetpoint', units: 'SEC', min: 0, max: 600 }),
      React.createElement(ReadOnlyRow, { label: 'Starting Time Left', stateKey: 'startingTimeLeft', units: 'SEC' }),

      // SUPPLY AIR TEMPERATURE CONTROL
      React.createElement(SectionHeader, { title: 'Supply Air Temp Control' }),
      React.createElement(EditableRow, { label: 'Cooling Coil Active SP', stateKey: 'coolingCoilSetpoint', units: '°F', min: 45, max: 75, step: 0.5 }),
      React.createElement(EditableRow, { label: 'Heating Coil Active SP', stateKey: 'heatingCoilSetpoint', units: '°F', min: 40, max: 70, step: 0.5 }),

      // PLENUM AIR TEMPERATURE CONTROL
      React.createElement(SectionHeader, { title: 'Plenum Air Temp Control' }),
      React.createElement(EditableRow, { label: 'Active Minimum Setpoint', stateKey: 'plenumMinSetpoint', units: '°F', min: 30, max: 55, step: 0.5 }),

      // ECONOMIZER CONTROL
      React.createElement(SectionHeader, { title: 'Economizer Control' }),
      React.createElement(ReadOnlyRow, { label: 'OA Temp (Live)', stateKey: 'oaTemperature', units: '°F',
        format: function(v) { return (typeof v === 'number' ? v.toFixed(1) : '--') + ' (live)'; } }),
      React.createElement(ToggleRow, { label: 'Low OA Temp Lockout', stateKey: 'lowOATLockout' }),
      React.createElement(ReadOnlyRow, { label: 'OA Enthalpy (Live)', stateKey: 'oaEnthalpy', units: 'BTU' }),
      React.createElement(ToggleRow, { label: 'Enthalpy OK — Economizer', stateKey: 'enthalpyOKForEconomizer' }),
      React.createElement(EditableRow, { label: 'OA Min Position (Damper)', stateKey: 'economizerMinPosition', units: '%', min: 0, max: 100 }),
      React.createElement(EditableRow, { label: 'Min Fan Speed Lockout', stateKey: 'minPositionFanSpeedLock', units: '%', min: 0, max: 50 }),
      React.createElement(EditableRow, { label: 'Economizer Mixed Air Target', stateKey: 'economizerTempControlSP', units: '°F', min: 40, max: 75, step: 0.5 }),

      // OUTSIDE AIR DAMPER CONTROL
      React.createElement(SectionHeader, { title: 'Outside Air Damper Control' }),
      React.createElement(EditableRow, { label: 'Controlling CO₂ Sensor', stateKey: 'co2Sensor', units: 'PPM', min: 300, max: 5000 }),
      React.createElement(EditableRow, { label: 'CO₂ Fresh Air Monitor SP', stateKey: 'co2Setpoint', units: 'PPM', min: 400, max: 2000 }),
      React.createElement(EditableRow, { label: 'Min OA Airflow Setpoint', stateKey: 'minOAAirflowSetpoint', units: 'CFM', min: 0, max: 12000 }),

      // FAN TRACKING
      React.createElement(SectionHeader, { title: 'Fan Tracking' }),
      React.createElement(EditableRow, { label: 'Fan Speed Setpoint', stateKey: 'fanSpeedSetpoint', units: '%', min: 0, max: 100 }),
      React.createElement(ReadOnlyRow, { label: 'Return Fan Track Mode', stateKey: 'fanTrackMode', units: '' }),

      // CALCULATED OUTPUTS — OA Damper Position is Manual-able (same as AHU-4-4)
      React.createElement(SectionHeader, { title: 'Calculated Outputs  ·  Read-Only' }),
      React.createElement(ReadOnlyRow, { label: 'Fan Status', stateKey: 'fanRunning', units: '',
        format: function(v) { return v ? '● RUNNING' : '○ STOPPED'; } }),
      React.createElement(ReadOnlyRow, { label: 'Supply CFM', stateKey: 'cfm', units: 'CFM',
        format: function(v) { return Math.round(v).toLocaleString(); } }),
      React.createElement(ReadOnlyRow, { label: 'OA CFM', stateKey: 'oaCFM', units: 'CFM',
        format: function(v) { return Math.round(v).toLocaleString(); } }),
      React.createElement(EditableRow, { label: 'OA Damper Position', stateKey: 'oaDamperPosition', units: '%', min: 0, max: 100 }),
      React.createElement(ReadOnlyRow, { label: 'Economizer Active', stateKey: 'economizerActive', units: '',
        format: function(v) { return v ? 'YES' : 'NO'; } }),
      React.createElement(ReadOnlyRow, { label: 'CHW Valve', stateKey: 'chwValvePosition', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'PHT Valve', stateKey: 'phtValvePosition', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'Supply Air Temp', stateKey: 'supplyAirTemp', units: '°F' }),
      React.createElement(ReadOnlyRow, { label: 'Preheat Temp', stateKey: 'preheatTemp', units: '°F' }),
      React.createElement(ReadOnlyRow, { label: 'Mixed Air Temp', stateKey: 'mixedAirTemp', units: '°F' }),

      // LL97 PANEL
      window.LL97Panel
        ? React.createElement(window.LL97Panel)
        : null,

      // FIRE ALARM SYSTEM
      React.createElement(SectionHeader, { title: 'Fire Alarm System' }),
      React.createElement(NormToggleRow, { label: 'Shutdown', stateKey: 'fireAlarmShutdown' }),
      React.createElement(NormToggleRow, { label: 'Smoke Purge', stateKey: 'fireAlarmSmokePurge' }),

      // ALARM RESET
      React.createElement(SectionHeader, { title: 'Alarm Reset' }),
      React.createElement('div', { className: 'px-2 py-1' },
        React.createElement('button', {
          className: 'px-3 py-1 text-[10px] bg-gray-200 border border-gray-400 rounded hover:bg-gray-300 text-gray-800 font-bold',
          onClick: function() { /* Alarm reset placeholder */ }
        }, 'RESET')
      )
    );
  }

  return AHU46ControlsSidebarComponent;
})();

window.AHU46ControlsSidebar = AHU46ControlsSidebar;
