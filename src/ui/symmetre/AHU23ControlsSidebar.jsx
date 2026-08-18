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
      className: 'px-2.5 py-1 text-[10px]',
      style: (window.CTAPanel || {}).sectionStyle
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
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] cta-row cta-row--click',
      onClick: toggle,
    },
      React.createElement('span', { className: 'flex-1 font-medium' }, label),
      React.createElement('span', {
        className: 'px-2 py-0 text-[10px] font-bold rounded border ' +
          (value
            ? 'cta-pill cta-pill--on'
            : 'cta-pill cta-pill--off')
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
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] cta-row',
    },
      React.createElement('span', { className: 'flex-1 font-medium' }, label),
      React.createElement('span', { className: 'font-bold text-[10px] cta-val' }, value ? yText : nText)
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
      return React.createElement('div', { className: 'flex items-center justify-between px-2 py-0.5 text-[10px] cta-row' },
        React.createElement('span', { className: 'flex-1 font-medium' }, label),
        React.createElement('input', {
          type: 'number', step: step || 1, min: min, max: max,
          className: 'w-14 px-1 py-0 text-[10px] font-mono cta-box cta-box--edit',
          value: editVal,
          onChange: function(e) { setEditVal(e.target.value); },
          onKeyDown: handleKeyDown,
          onBlur: handleSubmit,
          autoFocus: true,
        }),
        React.createElement('span', { className: 'text-[9px] cta-unit ml-1' }, units)
      );
    }

    return React.createElement('div', {
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] cta-row cta-row--click',
      onClick: handleClick,
      title: 'Click to edit'
    },
      React.createElement('span', { className: 'flex-1 font-medium' }, label),
      React.createElement('span', {
        className: 'px-1.5 py-0 text-[10px] font-mono font-bold rounded border bg-white text-black border-gray-400 text-right min-w-[44px] inline-block'
      }, typeof value === 'number' ? value.toFixed(1) : String(value)),
      React.createElement('span', { className: 'text-[9px] cta-unit ml-1' }, units)
    );
  }

  // Read-only row (bold value, no box)
  function ReadOnlyRow({ label, stateKey, units, format }) {
    // Formerly display-only. Every point on this unit can now be overridden by
    // an operator — a value the sequence normally calculates included. The
    // control matches what the point actually holds: a number gets an entry
    // box, a boolean toggles, a two-state string switches between its states,
    // and anything else gets a text box. While overridden the value reads in
    // the manual colour and ⟲ releases it back to Auto.
    var ctrl = window.AHU23Controller;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] !== undefined ? currentState[stateKey] : 0);
    var [manual, setManual] = useState(false);
    var [editing, setEditing] = useState(false);
    var [editVal, setEditVal] = useState('');

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) {
        setValue(s[stateKey]);
        if (ctrl.getModes) setManual(ctrl.getModes()[stateKey] === 'Manual');
      });
      return unsub;
    }, [stateKey]);

    var isBool = typeof value === 'boolean';
    var isStr = typeof value === 'string';

    // Two-state strings the model actually understands. Anything outside this
    // list is edited as free text rather than cycled into a state the control
    // sequences have never heard of.
    var STATE_PAIRS = [
      ['Manual', 'Automatic'], ['ON', 'OFF'], ['On', 'Off'],
      ['Open', 'Closed'], ['Running', 'Stopped']
    ];
    var pair = null;
    if (isStr) {
      for (var pi = 0; pi < STATE_PAIRS.length; pi++) {
        if (STATE_PAIRS[pi].indexOf(value) !== -1) { pair = STATE_PAIRS[pi]; break; }
      }
    }

    function handleClick() {
      if (!ctrl) return;
      if (isBool) { ctrl.setValue(stateKey, !value); return; }
      if (pair) { ctrl.setValue(stateKey, pair[(pair.indexOf(value) + 1) % pair.length]); return; }
      setEditing(true);
      setEditVal(value === null || value === undefined ? '' : String(value));
    }

    function handleSubmit() {
      if (ctrl) {
        if (isStr) {
          if (editVal !== '') ctrl.setValue(stateKey, editVal);
        } else {
          var num = parseFloat(editVal);
          if (!isNaN(num)) ctrl.setValue(stateKey, num);
        }
      }
      setEditing(false);
    }

    function handleKeyDown(e) {
      if (e.key === 'Enter') handleSubmit();
      if (e.key === 'Escape') setEditing(false);
    }

    function releaseAuto(e) {
      e.stopPropagation();
      if (!ctrl) return;
      if (ctrl.clearMode) ctrl.clearMode(stateKey);
      else if (ctrl.clearModes) ctrl.clearModes();
      if (ctrl.recalculate) ctrl.recalculate();
      setManual(false);
    }

    if (editing) {
      return React.createElement('div', { className: 'flex items-center justify-between px-2 py-0.5 text-[10px] cta-row' },
        React.createElement('span', { className: 'flex-1' }, label),
        React.createElement('input', {
          type: isStr ? 'text' : 'number',
          step: isStr ? undefined : 'any',
          className: (isStr ? 'w-20' : 'w-14') + ' px-1 py-0 text-[10px] font-mono cta-box cta-box--edit',
          value: editVal,
          onChange: function(e) { setEditVal(e.target.value); },
          onKeyDown: handleKeyDown,
          onBlur: handleSubmit,
          autoFocus: true,
        }),
        React.createElement('span', { className: 'text-[9px] cta-unit ml-1' }, units)
      );
    }

    // A "(live)" style formatter would be a lie once the point is overridden.
    var display = (!manual && format)
      ? format(value)
      : (typeof value === 'number' ? value.toFixed(1) : String(value));

    var hint = isBool ? 'Click to toggle'
      : (pair ? 'Click to switch to ' + pair[(pair.indexOf(value) + 1) % pair.length]
              : 'Click to override');

    return React.createElement('div', {
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] cta-row cta-row--click',
      onClick: handleClick,
      title: manual ? (hint + ' — ⟲ releases to Auto') : hint
    },
      React.createElement('span', { className: 'flex-1' }, label),
      manual ? React.createElement('button', {
        type: 'button',
        onClick: releaseAuto,
        title: 'Release to Auto',
        style: { fontFamily: 'inherit', fontSize: '9px', fontWeight: 800, lineHeight: 1,
                 padding: '1px 3px', marginRight: '3px', cursor: 'pointer',
                 borderRadius: '3px', border: '1px solid #c81fae',
                 background: 'transparent', color: '#c81fae' }
      }, '\u27f2') : null,
      React.createElement('span', {
        className: 'font-mono font-bold text-[10px]',
        style: manual ? { color: '#c81fae' } : null
      }, display),
      React.createElement('span', { className: 'text-[9px] cta-unit ml-1' }, units)
    );
  }

  // ─── Main Component ─────────────────────────────────────────────────────────

  function AHU23ControlsSidebarComponent() {
    var [collapsed, setCollapsed] = useState(false);

    if (collapsed) {
      return React.createElement('aside', {
        className: 'w-8 flex flex-col items-center pt-2 border-r border-gray-400',
        style: { background: (window.CTAPanel || {}).head || '#243247' }
      },
        React.createElement('button', {
          className: 'text-xs text-gray-700 hover:text-black', onClick: function() { setCollapsed(false); }
        }, '▶')
      );
    }

    return React.createElement('aside', {
      className: 'w-full border-r border-gray-400',
      style: { background: (window.CTAPanel || {}).panel || '#e8edf5' },
    },
      // Header bar
      React.createElement('div', {
        className: 'flex items-center justify-between px-2 py-1 border-b border-gray-400',
        style: { background: (window.CTAPanel || {}).head || '#243247' }
      },
        React.createElement('span', { className: 'text-[11px] font-bold cta-head-title' }, 'Controls — AHU-23-1'),
        React.createElement('button', {
          className: 'text-xs text-gray-600 hover:text-black', onClick: function() { setCollapsed(true); }
        }, '◀')
      ),

      // ════════════════════════════════════════════════════════════════════════
      // REAL HONEYWELL SYMMETRE SECTIONS (from screenshot)
      // ════════════════════════════════════════════════════════════════════════

      // LEGEND
      React.createElement('div', {
        className: 'px-2 py-1 cta-legend flex flex-wrap',
        style: { columnGap: '10px', rowGap: '3px' }
      },
        React.createElement('span', { className: 'text-[9px] cta-unit' },
          React.createElement('span', { className: 'inline-block cta-swatch cta-swatch--white mr-1' }),
          'White box = editable setpoint'
        ),
        React.createElement('span', { className: 'text-[9px] cta-unit' },
          React.createElement('span', { className: 'inline-block cta-swatch cta-swatch--grey mr-1' }),
          'Gray = calculated \u2014 click to override'
        ),
        React.createElement('span', { className: 'text-[9px] cta-unit' },
          React.createElement('span', { className: 'inline-block cta-swatch cta-swatch--pill mr-1' }),
          'Dark pill = actual value'
        ),
        React.createElement('span', { className: 'text-[9px] cta-unit' },
          React.createElement('span', { className: 'inline-block cta-swatch cta-swatch--alarm mr-1' }),
          'Red ring = in alarm'
        ),
        React.createElement('span', { className: 'text-[9px] cta-unit' },
          React.createElement('span', { className: 'cta-ovr-sample' }, '42'),
          'Magenta text = override (manual value)'
        )
      ),

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
          className: 'px-5 py-1 text-[10px] font-bold bg-gray-100',
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
      React.createElement(ReadOnlyRow, { label: 'Unit OA Humidity', stateKey: 'oaRelHumidity', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'Return Air Humidity', stateKey: 'returnAirRH', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'Supply Air Humidity', stateKey: 'supplyAirRH', units: '%' }),
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
