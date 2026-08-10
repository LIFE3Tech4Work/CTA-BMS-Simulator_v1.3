/**
 * AHU44NewControlsSidebar.jsx — Interactive Honeywell-style Controls for AHU-4-4
 *
 * Recreated from Honeywell SymmetrE / TecSystems screenshot.
 * Service: Pre-Function / Ballroom Level 2, Location: Level 4
 *
 * Editable controls that drive the AHU44NewController state model.
 * Changing values here recalculates outputs shown on the diagram.
 *
 * No import/export — exposed as window.AHU44NewControlsSidebar
 */

const AHU44NewControlsSidebar = (() => {
  'use strict';

  const { useState, useEffect } = React;

  // Section header (blue bar)
  function SectionHeader({ title }) {
    return React.createElement('div', {
      className: 'bg-blue-600 px-2 py-1 text-[10px] font-bold text-white uppercase tracking-wide'
    }, title);
  }

  // Editable numeric row
  function EditableRow({ label, stateKey, units, min, max, step }) {
    var ctrl = window.AHU44NewController;
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
  function ReadOnlyRow({ label, stateKey, units, format }) {
    var ctrl = window.AHU44NewController;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] || 0);

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

  // Toggle row (On/Off)
  function ToggleRow({ label, stateKey }) {
    var ctrl = window.AHU44NewController;
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

  // NORM toggle row (for Fire Alarm)
  function NormToggleRow({ label, stateKey }) {
    var ctrl = window.AHU44NewController;
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

  // ─── Main Component ─────────────────────────────────────────────────────────

  function AHU44NewControlsSidebarComponent() {
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
      className: 'w-full border-r border-gray-400',
      style: { backgroundColor: '#a8d0e6' },
    },
      // Header
      React.createElement('div', {
        className: 'flex items-center justify-between px-2 py-1 border-b border-gray-400',
        style: { backgroundColor: '#7fb3d4' }
      },
        React.createElement('span', { className: 'text-[11px] font-bold text-gray-800' }, 'Controls — AHU-4-4'),
        React.createElement('button', {
          className: 'text-xs text-gray-600 hover:text-black', onClick: function() { setCollapsed(true); }
        }, '◀')
      ),

      // LEGEND
      React.createElement('div', { className: 'px-2 py-1 bg-gray-100 border-b border-gray-300 flex gap-3 flex-wrap' },
        React.createElement('span', { className: 'text-[9px] text-gray-500' },
          React.createElement('span', { className: 'inline-block w-2 h-2 rounded-sm border border-blue-400 bg-white mr-1' }),
          'White box = editable setpoint'
        ),
        React.createElement('span', { className: 'text-[9px] text-gray-500' },
          React.createElement('span', { className: 'inline-block w-2 h-2 rounded-sm bg-gray-200 mr-1' }),
          'Gray = calculated / read-only'
        )
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
      React.createElement(SectionHeader, { title: 'Supply Air Temp Control  ·  Setpoints' }),
      React.createElement(EditableRow, { label: 'Cooling Coil Active SP', stateKey: 'coolingCoilSetpoint', units: '°F', min: 45, max: 75, step: 0.5 }),
      React.createElement(EditableRow, { label: 'Heating Coil Active SP', stateKey: 'heatingCoilSetpoint', units: '°F', min: 40, max: 70, step: 0.5 }),

      // PLENUM AIR TEMPERATURE CONTROL
      React.createElement(SectionHeader, { title: 'Plenum Air Temp Control' }),
      React.createElement(EditableRow, { label: 'Active Minimum Setpoint', stateKey: 'plenumMinSetpoint', units: '°F', min: 30, max: 55, step: 0.5 }),

      // ECONOMIZER CONTROL
      React.createElement(SectionHeader, { title: 'Economizer Control  ·  Setpoints' }),
      React.createElement(ReadOnlyRow, { label: 'OA Temp (Live)', stateKey: 'oaTemperature', units: '°F', format: function(v) { return (typeof v === 'number' ? v.toFixed(1) : '--') + ' (live)'; } }),
      React.createElement(ToggleRow, { label: 'Low OA Temp Lockout', stateKey: 'lowOATLockout' }),
      React.createElement(ReadOnlyRow, { label: 'OA Enthalpy (Live)', stateKey: 'oaEnthalpy', units: 'BTU' }),
      React.createElement(ToggleRow, { label: 'Enthalpy OK — Economizer (auto)',
        stateKey: 'enthalpyOKForEconomizer',
        tooltip: 'SOO CLC #2: Auto-calculated. Enable when OA enthalpy < return enthalpy − 5 BTU/lb AND OA > 38°F. Override with M badge for manual testing.' }),
      React.createElement(EditableRow, { label: 'OA Min Position (Damper)', stateKey: 'economizerMinPosition', units: '%', min: 0, max: 100 }),
      React.createElement(EditableRow, { label: 'Min Fan Speed Lockout', stateKey: 'minPositionFanSpeedLock', units: '%', min: 0, max: 50 }),
      React.createElement(EditableRow, { label: 'Economizer Mixed Air Target', stateKey: 'economizerTempControlSP', units: '°F', min: 40, max: 75, step: 0.5 }),

      // OUTSIDE AIR DAMPER CONTROL
      React.createElement(SectionHeader, { title: 'Outside Air Damper Control' }),
      React.createElement(EditableRow, { label: 'Controlling CO₂ Sensor', stateKey: 'co2Sensor', units: 'PPM', min: 300, max: 5000 }),
      React.createElement(EditableRow, {
        label: 'CO₂ Fresh Air Monitor SP',
        stateKey: 'co2Setpoint', units: 'PPM', min: 400, max: 2000,
        tooltip: 'SOO CLC #7: 900 PPM = OA delivery check. If CO₂ rises above this, more OA is demanded. DCV override threshold = 1100 PPM.'
      }),
      React.createElement(EditableRow, { label: 'Min OA Airflow Setpoint', stateKey: 'minOAAirflowSetpoint', units: 'CFM', min: 0, max: 16500 }),

      // FAN TRACKING
      React.createElement(SectionHeader, { title: 'Fan Tracking  ·  Setpoints' }),
      React.createElement(EditableRow, { label: 'Fan Speed Setpoint', stateKey: 'fanSpeedSetpoint', units: '%', min: 0, max: 100 }),
      React.createElement(ReadOnlyRow, { label: 'Return Fan Track Mode', stateKey: 'fanTrackMode', units: '' }),

      // CALCULATED OUTPUTS (mostly read-only — OA Damper Position can be
      // manually overridden, same as a real BACnet AO going Manual; see
      // the Manual-output note in AHU44NewController.js's file header)
      React.createElement(SectionHeader, { title: 'Calculated Outputs  ·  Read-Only' }),
      React.createElement(ReadOnlyRow, { label: 'Fan Status', stateKey: 'fanRunning', units: '',
        format: function(v) { return v ? '● RUNNING' : '○ STOPPED'; } }),
      React.createElement(ReadOnlyRow, { label: 'Supply CFM', stateKey: 'cfm', units: 'CFM',
        format: function(v) { return Math.round(v).toLocaleString(); } }),
      React.createElement(ReadOnlyRow, { label: 'OA CFM', stateKey: 'oaCFM', units: 'CFM',
        format: function(v) { return Math.round(v).toLocaleString(); } }),
      React.createElement(EditableRow, { label: 'OA Damper Position', stateKey: 'oaDamperPosition', units: '%', min: 0, max: 100 }),
      React.createElement(ReadOnlyRow, { label: 'Return Air Damper', stateKey: 'returnAirDamperPct', units: '%',
        format: function(v) { return Math.round(v) + '% (inverse of OA)'; } }),
      React.createElement(ReadOnlyRow, { label: 'Spill Damper (DA-3, N.O.)', stateKey: 'spillDamperPct', units: '%',
        format: function(v) { return Math.round(v) + '% (N.O.=100% when off)'; } }),
      React.createElement(ReadOnlyRow, { label: 'Exhaust Damper', stateKey: 'exhaustDamperPct', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'Return Fan CFM (90% of SF)', stateKey: 'returnCFM', units: 'CFM',
        format: function(v) { return Math.round(v).toLocaleString(); } }),
      React.createElement(ReadOnlyRow, { label: 'Supply Air %RH', stateKey: 'supplyRH', units: '%',
        format: function(v) { return Math.round(v) + '% (responds to CHW valve)'; } }),
      React.createElement(ReadOnlyRow, { label: 'Economizer Active', stateKey: 'economizerActive', units: '',
        format: function(v) { return v ? 'YES' : 'NO'; } }),
      React.createElement(ReadOnlyRow, { label: 'CHW Valve', stateKey: 'chwValvePosition', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'PHT Valve', stateKey: 'phtValvePosition', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'Supply Air Temp', stateKey: 'supplyAirTemp', units: '°F' }),
      React.createElement(ReadOnlyRow, { label: 'Preheat Temp', stateKey: 'preheatTemp', units: '°F' }),
      React.createElement(ReadOnlyRow, { label: 'Mixed Air Temp', stateKey: 'mixedAirTemp', units: '°F' }),

      // FIRE ALARM SYSTEM
      React.createElement(SectionHeader, { title: 'Fire Alarm System' }),
      React.createElement(NormToggleRow, { label: 'Shutdown', stateKey: 'fireAlarmShutdown' }),
      React.createElement(NormToggleRow, { label: 'Smoke Purge', stateKey: 'fireAlarmSmokePurge' }),

      // ALARM RESET + FULL RESET
      React.createElement(SectionHeader, { title: 'Reset' }),
      React.createElement('div', { className: 'px-2 py-2 flex flex-col gap-2' },

        // Alarm Reset — clears acknowledged alarms only
        React.createElement('button', {
          className: 'w-full px-3 py-1 text-[10px] bg-gray-200 border border-gray-400 rounded hover:bg-gray-300 text-gray-800 font-bold',
          onClick: function() {
            var engine = window.AHU44NewFaultEngine;
            if (engine && typeof engine.acknowledgeAll === 'function') {
              engine.acknowledgeAll('operator');
            }
          }
        }, 'ALARM RESET'),

        // Reset All to Defaults — clears every manual override and restores starting values
        React.createElement('button', {
          className: 'w-full px-3 py-1 text-[10px] bg-amber-100 border border-amber-500 rounded hover:bg-amber-200 text-amber-900 font-bold',
          title: 'Clear all manual overrides and restore default setpoints',
          onClick: function() {
            var ctrl = window.AHU44NewController;
            if (!ctrl) return;
            // Restore every editable setpoint to its starting value
            var defaults = {
              runSchedule:            true,
              systemStarting:         false,
              startingTimeSetpoint:   240,
              coolingCoilSetpoint:    60.0,
              heatingCoilSetpoint:    55.0,
              plenumMinSetpoint:      40.0,
              lowOATLockout:          false,
              enthalpyOKForEconomizer: false,
              economizerMinPosition:  20,
              minPositionFanSpeedLock: 5,
              economizerTempControlSP: 58.0,
              co2Sensor:              538,
              co2Setpoint:            900,
              minOAAirflowSetpoint:   4900,
              fanSpeedSetpoint:       75,
              fireAlarmShutdown:      false,
              fireAlarmSmokePurge:    false,
              interlockOn:            true,
              exhaustFanOn:           true,
              commonDamperOpen:       true,
              freezePumpOn:           true,
              oaDamperPosition:       20,
            };
            Object.keys(defaults).forEach(function(key) {
              ctrl.setValue(key, defaults[key]);
            });
            // Clear all manual mode flags so M badges disappear
            if (ctrl.clearModes) ctrl.clearModes();
            ctrl.recalculate();
          }
        }, '↺  RESET ALL TO DEFAULTS')
      )
    );
  }

  return AHU44NewControlsSidebarComponent;
})();

window.AHU44NewControlsSidebar = AHU44NewControlsSidebar;
