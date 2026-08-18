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
 * Key difference from AHU-4-4 sidebar: Minimum Position defaults to 50%
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
      className: 'px-2.5 py-1 text-[10px]',
      style: (window.CTAPanel || {}).sectionStyle
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
      return React.createElement('div', { className: 'flex items-center justify-between px-2 py-0.5 text-[10px] cta-row' },
        React.createElement('span', { className: 'flex-1' }, label),
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
      React.createElement('span', { className: 'flex-1' }, label),
      React.createElement('span', {
        className: 'px-1.5 py-0 text-[10px] font-mono cta-box'
      }, typeof value === 'number' ? value.toFixed(1) : String(value)),
      React.createElement('span', { className: 'text-[9px] cta-unit ml-1' }, units)
    );
  }

  function ReadOnlyRow({ label, stateKey, units, format }) {
    // Formerly display-only. Every point on this unit can now be overridden by
    // an operator — a value the sequence normally calculates included. The
    // control matches what the point actually holds: a number gets an entry
    // box, a boolean toggles, a two-state string switches between its states,
    // and anything else gets a text box. While overridden the value reads in
    // the manual colour and ⟲ releases it back to Auto.
    var ctrl = window.AHU46Controller;
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
        className: 'font-mono font-bold cta-val',
        style: manual ? { color: '#c81fae' } : null
      }, display),
      React.createElement('span', { className: 'text-[9px] cta-unit ml-1' }, units)
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
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] cta-row cta-row--click',
      onClick: toggle,
    },
      React.createElement('span', { className: 'flex-1' }, label),
      React.createElement('span', {
        className: 'px-2 py-0 text-[10px] font-bold rounded ' +
          (value ? 'cta-pill cta-pill--on' : 'cta-pill cta-pill--off')
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
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] cta-row cta-row--click',
      onClick: toggle,
    },
      React.createElement('span', { className: 'flex-1' }, label),
      React.createElement('span', {
        className: 'px-2 py-0 text-[10px] font-bold rounded ' +
          (value ? 'cta-pill cta-pill--alarm' : 'cta-pill cta-pill--on')
      }, value ? 'ACTIVE' : 'NORM')
    );
  }

  // Two-value string mode selector (e.g. 'Manual' / 'Automatic') — click to
  // cycle. Used for coolingSetpointMode (SCENARIO_TRACKING.md item #13).
  function ModeToggleRow({ label, stateKey, options }) {
    var ctrl = window.AHU46Controller;
    var currentState = ctrl ? ctrl.getState() : {};
    var [value, setValue] = useState(currentState[stateKey] || options[0]);

    useEffect(function() {
      if (!ctrl) return;
      var unsub = ctrl.subscribe(function(s) { setValue(s[stateKey]); });
      return unsub;
    }, [stateKey]);

    function cycle() {
      if (!ctrl) return;
      var next = options[(options.indexOf(value) + 1) % options.length];
      ctrl.setValue(stateKey, next);
    }

    return React.createElement('div', {
      className: 'flex items-center justify-between px-2 py-0.5 text-[10px] cta-row cta-row--click',
      onClick: cycle,
    },
      React.createElement('span', { className: 'flex-1' }, label),
      React.createElement('span', {
        className: 'px-2 py-0 text-[10px] font-bold rounded ' +
          (value === options[0] ? 'bg-gray-300 text-gray-700' : 'bg-blue-500 text-white')
      }, value)
    );
  }

  // ─── LL97 Panel (import from shared component, same as AHU-4-4) ─────────

  // ─── Main Component ─────────────────────────────────────────────────────────

  function AHU46ControlsSidebarComponent() {
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
      className: 'w-full border-r border-gray-400 overflow-y-auto',
      style: { background: (window.CTAPanel || {}).panel || '#e8edf5' },
    },
      // Header
      React.createElement('div', {
        className: 'flex items-center justify-between px-2 py-1 border-b border-gray-400',
        style: { background: (window.CTAPanel || {}).head || '#243247' }
      },
        React.createElement('span', { className: 'text-[11px] font-bold cta-head-title' }, 'Controls — AHU-4-6'),
        React.createElement('button', {
          className: 'text-xs text-gray-600 hover:text-black', onClick: function() { setCollapsed(true); }
        }, '◀')
      ),

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

      // TIMER CONTROL — System Starting/Starting Time Left are now derived
      // outputs of the staged fan-start sequence (SOO System Start #1-2),
      // not operator inputs — read-only, same as Economizer Active.
      React.createElement(SectionHeader, { title: 'Timer Control' }),
      React.createElement(ReadOnlyRow, { label: 'System Starting', stateKey: 'systemStarting', units: '',
        format: function(v) { return v ? 'YES' : 'NO'; } }),
      React.createElement(EditableRow, { label: 'Starting Time Setpoint', stateKey: 'startingTimeSetpoint', units: 'SEC', min: 0, max: 900 }),
      React.createElement(ReadOnlyRow, { label: 'Starting Time Left', stateKey: 'startingTimeLeft', units: 'SEC' }),

      // SUPPLY AIR TEMPERATURE CONTROL — Cooling Coil SP has two modes
      // (SOO Closed Loop Controller #3): Manual (operator sets the value
      // below directly, the default) or Automatic (BAS resets it from
      // Return Air %RH — see the Duct Static/Return Air readouts further
      // down). SCENARIO_TRACKING.md item #13.
      // SEASON / ZONE SETPOINT — added after the 14 Aug review, which asked for
      // the two things this panel could not answer: which setpoint has authority
      // ("I don't understand which set point actually controls your unit") and a
      // single zone setpoint that overrides both coil setpoints.
      React.createElement(SectionHeader, { title: 'Control Mode' }),
      React.createElement(ModeToggleRow, { label: 'Season Mode', stateKey: 'controlMode', options: ['Auto', 'Winter', 'Summer'] }),
      React.createElement(ReadOnlyRow, { label: 'Active Season', stateKey: 'activeSeason', units: '' }),
      React.createElement(ReadOnlyRow, { label: 'Setpoint In Control', stateKey: 'activeSetpointSource', units: '' }),
      // A heating setpoint is a floor and a cooling setpoint is a ceiling, not a
      // target the supply air is expected to sit on. The label says which, because
      // "why doesn't supply match the active setpoint?" was the confusion that
      // started this whole pass.
      React.createElement(ReadOnlyRow, { label: 'Active SA SP (limit)', stateKey: 'activeSetpoint', units: '°F' }),

      React.createElement(SectionHeader, { title: 'Zone (Space) Control' }),
      React.createElement(ToggleRow, { label: 'Zone SP Overrides Coils', stateKey: 'zoneSetpointControl' }),
      React.createElement(EditableRow, { label: 'Zone Temp Setpoint', stateKey: 'zoneTempSetpoint', units: '°F', min: 60, max: 85, step: 0.5 }),
      React.createElement(ReadOnlyRow, { label: 'Zone Temperature', stateKey: 'spaceTemp', units: '°F' }),

      React.createElement(SectionHeader, { title: 'Supply Air Temp Control' }),
      React.createElement(ModeToggleRow, { label: 'Cooling SP Mode', stateKey: 'coolingSetpointMode', options: ['Manual', 'Automatic'] }),
      React.createElement(EditableRow, { label: 'Cooling Coil Active SP', stateKey: 'coolingCoilSetpoint', units: '°F', min: 45, max: 75, step: 0.5 }),
      React.createElement(EditableRow, { label: 'Heating Coil Active SP', stateKey: 'heatingCoilSetpoint', units: '°F', min: 40, max: 70, step: 0.5 }),
      // The heating setpoint is reset off outdoor air (55 °F at 60 °F OAT rising to
      // 65 °F at 20 °F), so it is not a number that sits still all year. Switchable
      // so the flat-setpoint case can be shown next to it; a Manual hold on the
      // setpoint above, or zone setpoint control, both outrank the schedule.
      React.createElement(ToggleRow, { label: 'OA Reset Schedule', stateKey: 'oaResetEnabled' }),
      React.createElement(ReadOnlyRow, { label: 'Heating Reset Target', stateKey: 'heatingResetTarget', units: '°F' }),

      // PLENUM AIR TEMPERATURE CONTROL
      React.createElement(SectionHeader, { title: 'Plenum Air Temp Control' }),
      React.createElement(EditableRow, { label: 'Active Minimum Setpoint', stateKey: 'plenumMinSetpoint', units: '°F', min: 30, max: 55, step: 0.5 }),

      // ECONOMIZER CONTROL
      React.createElement(SectionHeader, { title: 'Economizer Control' }),
      React.createElement(ReadOnlyRow, { label: 'OA Temp (Live)', stateKey: 'oaTemperature', units: '°F',
        format: function(v) { return (typeof v === 'number' ? v.toFixed(1) : '--') + ' (live)'; } }),
      React.createElement(ToggleRow, { label: 'Low OA Temp Lockout', stateKey: 'lowOATLockout' }),
      React.createElement(ReadOnlyRow, { label: 'OA Enthalpy (Live)', stateKey: 'oaEnthalpy', units: 'BTU' }),
      React.createElement(ReadOnlyRow, { label: 'OA %RH (Live)', stateKey: 'oaRelHumidity', units: '%RH' }),
      React.createElement(ToggleRow, { label: 'Enthalpy OK — Economizer', stateKey: 'enthalpyOKForEconomizer' }),
      React.createElement(EditableRow, { label: 'OA Min Position (Damper)', stateKey: 'economizerMinPosition', units: '%', min: 0, max: 100 }),
      React.createElement(EditableRow, { label: 'Min Fan Speed Lockout', stateKey: 'minPositionFanSpeedLock', units: '%', min: 0, max: 50 }),
      React.createElement(EditableRow, { label: 'Economizer Mixed Air Target', stateKey: 'economizerTempControlSP', units: '°F', min: 40, max: 75, step: 0.5 }),

      // OUTSIDE AIR DAMPER CONTROL
      React.createElement(SectionHeader, { title: 'Outside Air Damper Control' }),
      React.createElement(EditableRow, { label: 'Controlling CO₂ Sensor', stateKey: 'co2Sensor', units: 'PPM', min: 300, max: 5000 }),
      React.createElement(EditableRow, { label: 'CO₂ Fresh Air Monitor SP', stateKey: 'co2Setpoint', units: 'PPM', min: 400, max: 2000 }),
      React.createElement(EditableRow, { label: 'Min OA Airflow Setpoint', stateKey: 'minOAAirflowSetpoint', units: 'CFM', min: 0, max: 12000 }),

      // FAN TRACKING — Fan Speed Setpoint is a Manual override (same
      // pattern as OA Damper Position): normally the duct static pressure
      // loop below computes fanSpeed automatically, but setting this row
      // takes over. Return Fan Track Mode is the tracking BASIS ("CFM" —
      // see the Return Fan Flow Tracking section below for the actual
      // numeric target).
      React.createElement(SectionHeader, { title: 'Fan Tracking' }),
      React.createElement(EditableRow, { label: 'Fan Speed Setpoint (Manual Override)', stateKey: 'fanSpeedSetpoint', units: '%', min: 0, max: 100 }),
      React.createElement(ReadOnlyRow, { label: 'Return Fan Track Mode', stateKey: 'fanTrackMode', units: '' }),

      // DUCT STATIC PRESSURE CONTROL — SOO Closed Loop Controller #5
      React.createElement(SectionHeader, { title: 'Duct Static Pressure Control' }),
      React.createElement(EditableRow, { label: 'Duct Static Pressure SP', stateKey: 'ductStaticPressureSetpoint', units: 'in w.c.', min: 0.1, max: 3.0, step: 0.05 }),
      React.createElement(ReadOnlyRow, { label: 'Duct Static Pressure', stateKey: 'ductStaticPressure', units: 'in w.c.' }),
      React.createElement(ReadOnlyRow, { label: 'Supply Fan Speed', stateKey: 'fanSpeed', units: '%' }),

      // RETURN FAN FLOW TRACKING — SOO Closed Loop Controller #6
      React.createElement(SectionHeader, { title: 'Return Fan Flow Tracking' }),
      React.createElement(EditableRow, { label: 'RF Tracking SP (% of Supply)', stateKey: 'returnFanFlowTrackingSetpoint', units: '%', min: 0, max: 100 }),
      React.createElement(ReadOnlyRow, { label: 'Return Fan CFM', stateKey: 'returnFanCFM', units: 'CFM',
        format: function(v) { return Math.round(v).toLocaleString(); } }),

      // FAN VFD STATUS — SOO General Automatic Control Sequences #16
      React.createElement(SectionHeader, { title: 'Fan VFD Status' }),
      React.createElement(NormToggleRow, { label: 'Supply Fan VFD Bypass', stateKey: 'supplyFanVFDBypass' }),
      React.createElement(NormToggleRow, { label: 'Return Fan VFD Bypass', stateKey: 'returnFanVFDBypass' }),
      React.createElement(NormToggleRow, { label: 'Supply Fan VFD Fault', stateKey: 'supplyFanVFDFault' }),
      React.createElement(NormToggleRow, { label: 'Return Fan VFD Fault', stateKey: 'returnFanVFDFault' }),
      React.createElement(ReadOnlyRow, { label: 'Supply VFD Damper Request', stateKey: 'supplyFanVFDDamperRequest', units: '',
        format: function(v) { return v ? 'YES' : 'NO'; } }),
      React.createElement(ReadOnlyRow, { label: 'Return VFD Damper Request', stateKey: 'returnFanVFDDamperRequest', units: '',
        format: function(v) { return v ? 'YES' : 'NO'; } }),

      // PRESSURE SWITCH SAFETIES — SOO Safeties items 1-6, SCENARIO_TRACKING.md item #21
      React.createElement(SectionHeader, { title: 'Pressure Switch Safeties (DPS)' }),
      React.createElement(NormToggleRow, { label: 'DPS-1 Filter Dirty (non-critical)', stateKey: 'filterDirty' }),
      React.createElement(NormToggleRow, { label: 'DPS-2 Supply High Suction', stateKey: 'dps2Tripped' }),
      React.createElement(NormToggleRow, { label: 'DPS-3 Supply High Static', stateKey: 'dps3Tripped' }),
      React.createElement(NormToggleRow, { label: 'DPS-4 Return High Suction', stateKey: 'dps4Tripped' }),
      React.createElement(NormToggleRow, { label: 'DPS-5 Return High Static', stateKey: 'dps5Tripped' }),

      // FREEZESTAT — SOO Safeties item 4, SCENARIO_TRACKING.md item #22
      React.createElement(SectionHeader, { title: 'Freezestat' }),
      React.createElement(ReadOnlyRow, { label: 'Freezestat Tripped (instant)', stateKey: 'freezestatTripped', units: '',
        format: function(v) { return v ? 'YES' : 'NO'; } }),
      React.createElement(ReadOnlyRow, { label: 'Freezestat Shutdown (latched)', stateKey: 'freezestatShutdown', units: '',
        format: function(v) { return v ? 'YES — MANUAL RESET REQUIRED' : 'NO'; } }),
      React.createElement(EditableRow, { label: 'Nuisance Delay SP', stateKey: 'freezestatDelaySetpoint', units: 'sec', min: 0, max: 600 }),

      // SOFTWARE LOCKOUT — Points List item 44, SCENARIO_TRACKING.md item #24
      React.createElement(SectionHeader, { title: 'Software Lockout' }),
      React.createElement(NormToggleRow, { label: 'Lockout Active', stateKey: 'softwareLockout' }),

      // CALCULATED OUTPUTS — OA Damper Position is Manual-able (same as AHU-4-4)
      React.createElement(SectionHeader, { title: 'Calculated Outputs' }),
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
      React.createElement(ReadOnlyRow, { label: 'Return Air Temp', stateKey: 'returnAirTemp', units: '°F' }),
      React.createElement(ReadOnlyRow, { label: 'Return Air %RH', stateKey: 'returnAirRH', units: '%RH' }),
      React.createElement(ReadOnlyRow, { label: 'Return Air Damper', stateKey: 'returnAirDamperPosition', units: '%' }),
      React.createElement(ReadOnlyRow, { label: 'Spill Damper', stateKey: 'spillDamperPosition', units: '%' }),

      // LL97 PANEL
      window.LL97Panel
        ? React.createElement(window.LL97Panel)
        : null,

      // FIRE ALARM SYSTEM
      React.createElement(SectionHeader, { title: 'Fire Alarm System' }),
      React.createElement(NormToggleRow, { label: 'Shutdown', stateKey: 'fireAlarmShutdown' }),
      React.createElement(NormToggleRow, { label: 'Smoke Purge', stateKey: 'fireAlarmSmokePurge' }),

      // ALARM RESET — Points List item 31. Was a placeholder that did
      // nothing; now clears freezestatShutdown (only if OAT has warmed
      // above the trip point — see the controller's own guard comment)
      // and every DPS-2..5 trip.
      React.createElement(SectionHeader, { title: 'Alarm Reset' }),
      React.createElement('div', { className: 'px-2 py-1' },
        React.createElement('button', {
          className: 'px-3 py-1 text-[10px] bg-gray-200 border border-gray-400 rounded hover:bg-gray-300 text-gray-800 font-bold',
          onClick: function() {
            if (window.AHU46Controller) window.AHU46Controller.setValue('resetPressed', true);
          }
        }, 'RESET')
      )
    );
  }

  return AHU46ControlsSidebarComponent;
})();

window.AHU46ControlsSidebar = AHU46ControlsSidebar;
