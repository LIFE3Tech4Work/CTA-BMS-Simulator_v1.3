/**
 * AHU23ControlsSidebar.jsx — Honeywell SymmetrE-style Controls for AHU-23-1
 *
 * Recreated from real Honeywell SymmetrE R410 screenshot.
 * Larger text, authentic lavender/blue color scheme, proper spacing.
 *
 * Sections (matching real system):
 * - SCHEDULE: Run Schedule ON/OFF
 * - DAMPERS: AHU Requires Dampers Open
 * - FIRE ALARM: Fire Alarm Shutdown Signal
 * - ALARM RESET: Reset button
 *
 * Plus engineering controls below for interactive training.
 *
 * Editable controls drive the AHU23Controller state model.
 * No import/export — exposed as window.AHU23ControlsSidebar
 */

const AHU23ControlsSidebar = (() => {
  'use strict';

  const { useState, useEffect } = React;

  // ─── Styled Components matching real Honeywell SymmetrE ─────────────────────

  // Section header — dark blue/navy bar with white bold text
  function SectionHeader({ title }) {
    return React.createElement('div', {
      className: 'px-3 py-1.5 text-[13px] font-bold text-white uppercase tracking-wide',
      style: { backgroundColor: '#3366cc' }
    }, title);
  }

  // Row with ON/OFF toggle styled like real SymmetrE (rounded pill button)
  function ToggleRow({ label, stateKey, onLabel, offLabel }) {
    var ctrl = window.AHU23Controller;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] || false);

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [stateKey]);

    function toggle() {
      if (ctrl) ctrl.setValue(stateKey, !value);
    }

    var onText = onLabel || 'ON';
    var offText = offLabel || 'OFF';

    return React.createElement('div', {
      className: 'flex items-center justify-between px-3 py-2 text-[13px] text-gray-900 cursor-pointer hover:bg-blue-200/40 border-b border-blue-300/30',
      onClick: toggle,
    },
      React.createElement('span', { className: 'flex-1 font-medium' }, label),
      React.createElement('span', {
        className: 'px-3 py-0.5 text-[12px] font-bold rounded border ' +
          (value
            ? 'bg-green-500 text-white border-green-600'
            : 'bg-gray-100 text-gray-700 border-gray-400')
      }, value ? onText : offText)
    );
  }

  // Read-only YES/NO display row
  function StatusRow({ label, stateKey, yesLabel, noLabel }) {
    var ctrl = window.AHU23Controller;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] || false);

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [stateKey]);

    var yText = yesLabel || 'YES';
    var nText = noLabel || 'NO';

    return React.createElement('div', {
      className: 'flex items-center justify-between px-3 py-2 text-[13px] text-gray-900 border-b border-blue-300/30',
    },
      React.createElement('span', { className: 'flex-1 font-medium' }, label),
      React.createElement('span', { className: 'font-bold text-[13px]' }, value ? yText : nText)
    );
  }

  // Editable numeric row — white boxed value
  function EditableRow({ label, stateKey, units, min, max, step }) {
    var ctrl = window.AHU23Controller;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] || 0);
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
      return React.createElement('div', { className: 'flex items-center justify-between px-3 py-1.5 text-[13px] text-gray-900 border-b border-blue-300/30' },
        React.createElement('span', { className: 'flex-1 font-medium' }, label),
        React.createElement('input', {
          type: 'number', step: step || 1, min: min, max: max,
          className: 'w-16 px-1.5 py-0.5 text-[13px] border-2 border-blue-500 rounded bg-white text-black font-mono font-bold text-right',
          value: editVal,
          onChange: function(e) { setEditVal(e.target.value); },
          onKeyDown: handleKeyDown,
          onBlur: handleSubmit,
          autoFocus: true,
        }),
        React.createElement('span', { className: 'text-[11px] text-gray-600 ml-1.5 w-8' }, units)
      );
    }

    return React.createElement('div', {
      className: 'flex items-center justify-between px-3 py-1.5 text-[13px] text-gray-900 cursor-pointer hover:bg-blue-200/40 border-b border-blue-300/30',
      onClick: handleClick,
      title: 'Click to edit'
    },
      React.createElement('span', { className: 'flex-1 font-medium' }, label),
      React.createElement('span', {
        className: 'px-2 py-0.5 text-[13px] font-mono font-bold rounded border bg-white text-black border-gray-400 text-right min-w-[50px] inline-block'
      }, typeof value === 'number' ? value.toFixed(1) : String(value)),
      React.createElement('span', { className: 'text-[11px] text-gray-600 ml-1.5 w-8' }, units)
    );
  }

  // Read-only row (bold value, no box)
  function ReadOnlyRow({ label, stateKey, units, format }) {
    var ctrl = window.AHU23Controller;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] || 0);

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [stateKey]);

    var display = format ? format(value) : (typeof value === 'number' ? value.toFixed(1) : String(value));

    return React.createElement('div', { className: 'flex items-center justify-between px-3 py-1.5 text-[13px] text-gray-900 border-b border-blue-300/30' },
      React.createElement('span', { className: 'flex-1 font-medium' }, label),
      React.createElement('span', { className: 'font-mono font-bold text-[13px]' }, display),
      React.createElement('span', { className: 'text-[11px] text-gray-600 ml-1.5 w-8' }, units || '')
    );
  }

  // ─── Main Component ─────────────────────────────────────────────────────────

  function AHU23ControlsSidebarComponent() {
    var [collapsed, setCollapsed] = useState(false);

    if (collapsed) {
      return React.createElement('aside', {
        className: 'w-8 flex flex-col items-center pt-2 border-r border-gray-400',
        style: { backgroundColor: '#b8ccde' }
      },
        React.createElement('button', {
          className: 'text-sm text-gray-700 hover:text-black', onClick: function() { setCollapsed(false); }
        }, '▶')
      );
    }

    return React.createElement('aside', {
      className: 'w-full border-r border-gray-400',
      style: { backgroundColor: '#c4d6ea' },
    },
      // Header bar
      React.createElement('div', {
        className: 'flex items-center justify-between px-3 py-2 border-b border-gray-500',
        style: { backgroundColor: '#a0b8d0' }
      },
        React.createElement('span', { className: 'text-[14px] font-bold text-gray-900' }, 'Controls — AHU-23-1'),
        React.createElement('button', {
          className: 'text-sm text-gray-600 hover:text-black font-bold', onClick: function() { setCollapsed(true); }
        }, '◀')
      ),

      // ════════════════════════════════════════════════════════════════════════
      // REAL HONEYWELL SYMMETRE SECTIONS (from screenshot)
      // ════════════════════════════════════════════════════════════════════════

      // SCHEDULE
      React.createElement(SectionHeader, { title: 'Schedule' }),
      React.createElement(ToggleRow, { label: 'Run Schedule', stateKey: 'runSchedule' }),

      // DAMPERS
      React.createElement(SectionHeader, { title: 'Dampers' }),
      React.createElement(StatusRow, { label: 'AHU Requires Dampers Open', stateKey: 'fanRunning', yesLabel: 'YES', noLabel: 'NO' }),

      // FIRE ALARM
      React.createElement(SectionHeader, { title: 'Fire Alarm' }),
      React.createElement(ToggleRow, { label: 'Fire Alarm Shutdown Signal', stateKey: 'fireAlarmShutdown', onLabel: 'ON', offLabel: 'OFF' }),

      // ALARM RESET
      React.createElement(SectionHeader, { title: 'Alarm Reset' }),
      React.createElement('div', { className: 'flex justify-center py-3' },
        React.createElement('button', {
          className: 'px-6 py-1.5 text-[13px] font-bold text-gray-800 bg-gray-100 border-2 border-gray-500 rounded-full hover:bg-gray-200 active:bg-gray-300',
          style: { minWidth: '100px' },
          onClick: function() { /* Alarm reset placeholder */ }
        }, 'RESET')
      ),

      // ════════════════════════════════════════════════════════════════════════
      // ENGINEERING CONTROLS (for training — editable setpoints)
      // ════════════════════════════════════════════════════════════════════════

      // SUPPLY AIR TEMPERATURE CONTROL
      React.createElement(SectionHeader, { title: 'Supply Air Temp Control' }),
      React.createElement(EditableRow, { label: 'Cooling Coil Active SP', stateKey: 'coolingCoilSetpoint', units: '°F', min: 45, max: 75, step: 0.5 }),
      React.createElement(EditableRow, { label: 'Heating Coil Active SP', stateKey: 'heatingCoilSetpoint', units: '°F', min: 40, max: 70, step: 0.5 }),

      // PLENUM AIR TEMPERATURE CONTROL
      React.createElement(SectionHeader, { title: 'Plenum Air Temp Control' }),
      React.createElement(EditableRow, { label: 'Active Minimum Setpoint', stateKey: 'plenumMinSetpoint', units: '°F', min: 30, max: 55, step: 0.5 }),

      // ECONOMIZER CONTROL
      React.createElement(SectionHeader, { title: 'Economizer Control' }),
      React.createElement(EditableRow, { label: 'Unit Outside Air Temp', stateKey: 'oaTemperature', units: '°F', min: -10, max: 110, step: 0.5 }),
      React.createElement(ToggleRow, { label: 'Low OAT Lockout', stateKey: 'lowOATLockout' }),
      React.createElement(ReadOnlyRow, { label: 'Unit OA Enthalpy', stateKey: 'oaEnthalpy', units: 'BTU' }),
      React.createElement(ToggleRow, { label: 'Enthalpy OK For Economizer', stateKey: 'enthalpyOKForEconomizer' }),
      React.createElement(EditableRow, { label: 'Minimum Position', stateKey: 'economizerMinPosition', units: '%', min: 0, max: 100 }),
      React.createElement(EditableRow, { label: 'Min Pos Fan Speed Lock', stateKey: 'minPositionFanSpeedLock', units: '%', min: 0, max: 50 }),
      React.createElement(EditableRow, { label: 'Economizer Temp Ctrl SP', stateKey: 'economizerTempControlSP', units: '°F', min: 40, max: 75, step: 0.5 }),

      // OA DAMPER CONTROL
      React.createElement(SectionHeader, { title: 'OA Damper Control' }),
      React.createElement(EditableRow, { label: 'CO₂ Sensor', stateKey: 'co2Sensor', units: 'PPM', min: 300, max: 5000 }),
      React.createElement(EditableRow, { label: 'CO₂ Setpoint', stateKey: 'co2Setpoint', units: 'PPM', min: 400, max: 2000 }),
      React.createElement(EditableRow, { label: 'Min OA Airflow SP', stateKey: 'minOAAirflowSetpoint', units: 'CFM', min: 0, max: 16500 }),

      // FAN TRACKING
      React.createElement(SectionHeader, { title: 'Fan Tracking' }),
      React.createElement(EditableRow, { label: 'Fan Speed Setpoint', stateKey: 'fanSpeedSetpoint', units: '%', min: 0, max: 100 }),

      // CALCULATED OUTPUTS (read-only)
      React.createElement(SectionHeader, { title: 'Calculated Outputs' }),
      React.createElement(ReadOnlyRow, { label: 'Fan Status', stateKey: 'fanRunning', units: '',
        format: function(v) { return v ? '● RUNNING' : '○ STOPPED'; } }),
      React.createElement(ReadOnlyRow, { label: 'Actual CFM', stateKey: 'cfm', units: 'CFM',
        format: function(v) { return Math.round(v).toLocaleString(); } }),
      React.createElement(ReadOnlyRow, { label: 'OA Damper Position', stateKey: 'oaDamperPosition', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'Economizer Active', stateKey: 'economizerActive', units: '',
        format: function(v) { return v ? 'YES' : 'NO'; } }),
      React.createElement(ReadOnlyRow, { label: 'CHW Valve (V-2)', stateKey: 'chwValvePosition', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'PHT Valve (V-1)', stateKey: 'phtValvePosition', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'Supply Air Temp', stateKey: 'supplyAirTemp', units: '°F' }),
      React.createElement(ReadOnlyRow, { label: 'Mixed Air Temp', stateKey: 'mixedAirTemp', units: '°F' })
    );
  }

  return AHU23ControlsSidebarComponent;
})();

window.AHU23ControlsSidebar = AHU23ControlsSidebar;
