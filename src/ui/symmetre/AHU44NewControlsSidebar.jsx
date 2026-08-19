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

  // AHU-4-3 and AHU-4-4 are the paired mixing-box units and share this panel,
  // each driving its own controller instance. The rows below read their
  // controller at render time, so the active global is held here and set from the
  // panel's `controller` prop before its children render. Exactly one panel is
  // mounted at a time (App.jsx renders the tab's sidebar only), so there is no
  // ambiguity about which unit the rows belong to.
  var ACTIVE_CTRL = 'AHU44NewController';

  const { useState, useEffect } = React;

  // Section header (blue bar)
  function SectionHeader({ title }) {
    return React.createElement('div', {
      className: 'px-2.5 py-1 text-[10px]',
      style: (window.CTAPanel || {}).sectionStyle
    }, title);
  }

  // Editable numeric row
  function EditableRow({ label, stateKey, units, min, max, step }) {
    var ctrl = window[ACTIVE_CTRL];
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

  // Read-only display row
  function ReadOnlyRow({ label, stateKey, units, format }) {
    // Formerly display-only. Every point on this unit can now be overridden by
    // an operator — a value the sequence normally calculates included. The
    // control matches what the point actually holds: a number gets an entry
    // box, a boolean toggles, a two-state string switches between its states,
    // and anything else gets a text box. While overridden the value reads in
    // the manual colour and ⟲ releases it back to Auto.
    var ctrl = window[ACTIVE_CTRL];
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
      ['Auto', 'Winter', 'Summer'],
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

  // Toggle row (On/Off)
  function ToggleRow({ label, stateKey }) {
    var ctrl = window[ACTIVE_CTRL];
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

  // NORM toggle row (for Fire Alarm)
  function NormToggleRow({ label, stateKey }) {
    var ctrl = window[ACTIVE_CTRL];
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

  // ─── Main Component ─────────────────────────────────────────────────────────

  function AHU44NewControlsSidebarComponent(props) {
    ACTIVE_CTRL = (props && props.controller) || 'AHU44NewController';
    var unitLabel = (props && props.unitId) || 'AHU-4-4';
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
      // Header
      React.createElement('div', {
        className: 'flex items-center justify-between px-2 py-1 border-b border-gray-400',
        style: { background: (window.CTAPanel || {}).head || '#243247' }
      },
        React.createElement('span', { className: 'text-[11px] font-bold cta-head-title' }, 'Controls — ' + unitLabel),
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

      // TIMER CONTROL
      React.createElement(SectionHeader, { title: 'Timer Control' }),
      React.createElement(ToggleRow, { label: 'System Starting', stateKey: 'systemStarting' }),
      React.createElement(EditableRow, { label: 'Starting Time Setpoint', stateKey: 'startingTimeSetpoint', units: 'SEC', min: 0, max: 600 }),
      React.createElement(ReadOnlyRow, { label: 'Starting Time Left', stateKey: 'startingTimeLeft', units: 'SEC' }),

      // CONTROL MODE / ZONE SETPOINT — same pair added to AHU-4-6 after the
      // 14 Aug review: which setpoint has coil authority, and one zone setpoint
      // that can override both.
      React.createElement(SectionHeader, { title: 'Control Mode' }),
      React.createElement(ReadOnlyRow, { label: 'Season Mode', stateKey: 'controlMode', units: '' }),
      React.createElement(ReadOnlyRow, { label: 'Active Season', stateKey: 'activeSeason', units: '' }),
      React.createElement(ReadOnlyRow, { label: 'Setpoint In Control', stateKey: 'activeSetpointSource', units: '' }),
      React.createElement(ReadOnlyRow, { label: 'Active SA SP (limit)', stateKey: 'activeSetpoint', units: '°F' }),

      React.createElement(SectionHeader, { title: 'Zone (Space) Control' }),
      React.createElement(ToggleRow, { label: 'Zone SP Overrides Coils', stateKey: 'zoneSetpointControl' }),
      React.createElement(EditableRow, { label: 'Zone Temp Setpoint', stateKey: 'zoneTempSetpoint', units: '°F', min: 60, max: 85, step: 0.5 }),
      React.createElement(ReadOnlyRow, { label: 'Zone Temperature', stateKey: 'spaceTemp', units: '°F' }),

      // SUPPLY AIR TEMPERATURE CONTROL
      React.createElement(SectionHeader, { title: 'Supply Air Temp Control  ·  Setpoints' }),
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
      React.createElement(SectionHeader, { title: 'Calculated Outputs' }),
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

      // FULL RESET
      // A one-click "acknowledge every alarm" button was removed here — real
      // BMS practice (per Lev) requires acknowledging each alarm individually,
      // precisely so an operator can't wave away active alarms unseen. Use the
      // Alarm Summary to acknowledge alarms one at a time instead.
      React.createElement(SectionHeader, { title: 'Reset' }),
      React.createElement('div', { className: 'px-2 py-2 flex flex-col gap-2' },

// Was a hardcoded table of every starting value, rewritten by hand whenever a
        // setpoint was added — the same pattern that let the toolbar reload miss
        // three units. clearModes() restores each point's own pre-override value, so
        // this needs no per-unit knowledge and cannot fall behind the model.
        window.ResetControls
          ? React.createElement(window.ResetControls.ResetAllButton, {
              controller: ACTIVE_CTRL, faultEngine: 'AHU44NewFaultEngine'
            })
          : null
      )
    );
  }

  return AHU44NewControlsSidebarComponent;
})();

window.AHU44NewControlsSidebar = AHU44NewControlsSidebar;
