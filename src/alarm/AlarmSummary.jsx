/* AlarmSummary.jsx — Full alarm summary screen with filter tree and sortable list
 * No import/export — exposes window.AlarmSummary
 * Reads from: window.FaultEngine (getAllAlarms, getActiveAlarms)
 * Reads from: window.AuthContext (canAcknowledge privilege check)
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

(function () {
  'use strict';

  const { useState, useEffect, useContext, useCallback, useRef } = React;

  // ─── 9-State Alarm Icon System (Property 13) ─────────────────────────────────
  // Priority (urgent/high/low) × Lifecycle-Ack state (active-unack/active-ack/inactive-unack)

  function getAlarmIconStyle(priority, lifecycle, acknowledged) {
    // Determine color base
    var colorMap = {
      urgent: { fill: '#ef4444', outline: '#ef4444' },   // red
      high: { fill: '#f59e0b', outline: '#f59e0b' },     // amber
      low: { fill: '#3b82f6', outline: '#3b82f6' }       // blue
    };

    var colors = colorMap[priority] || colorMap.high;

    if (lifecycle === 'active' && !acknowledged) {
      // Active + Unacknowledged → flashing filled
      return { background: colors.fill, border: 'none', flashing: true };
    } else if (lifecycle === 'active' && acknowledged) {
      // Active + Acknowledged → solid filled
      return { background: colors.fill, border: 'none', flashing: false };
    }
    // Inactive + Unacknowledged → outline, still blinking. The blink is what says
    // "this still needs you": the condition has cleared but nobody has signed for
    // it. Previously drawn steady, which made it read as already handled.
    //
    // Inactive + Acknowledged never reaches here — acknowledging a cleared alarm
    // removes the row (see the Summary filter below), so there is no fourth icon.
    return { background: 'transparent', border: '2px solid ' + colors.outline, flashing: true };
  }

  // ─── Alarm Icon Component ─────────────────────────────────────────────────────

  function AlarmIcon({ priority, lifecycle, acknowledged }) {
    var style = getAlarmIconStyle(priority, lifecycle, acknowledged);

    var className = 'w-4 h-4 rounded-full inline-block flex-shrink-0';
    if (style.flashing) {
      className += ' animate-bms-flash';
    }

    var inlineStyle = {
      backgroundColor: style.background,
      border: style.border || 'none',
      minWidth: '16px',
      minHeight: '16px'
    };
    if (style.opacity != null) inlineStyle.opacity = style.opacity;

    // Build aria label for accessibility
    var stateLabel = lifecycle + (acknowledged ? '-acknowledged' : '-unacknowledged');
    var ariaLabel = priority + ' ' + stateLabel + ' alarm';

    return React.createElement('span', {
      className: className,
      style: inlineStyle,
      role: 'img',
      'aria-label': ariaLabel,
      title: ariaLabel
    });
  }

  // ─── Pre-loaded Fault Records (6 real fault records — Requirement 13.4) ───────

  var PRELOADED_ALARMS = [
    {
      id: 'preload-F01-1',
      timestamp: new Date('2026-05-15T14:30:00'),
      source: 'AO103@DEV4004',
      // Live point this alarm reports. Without it the Value column showed a frozen
      // number that contradicted the unit's own panel.
      unitId: 'AHU-4-4', pointKey: 'phtValvePosition',
      // Both coils conditioning the same air stream. Dehumidification is the
      // legitimate exception, so a unit that is deliberately reheating dried air
      // is not in alarm.
      test: function (st) {
        return st.phtValvePosition > 0 && st.chwValvePosition > 0 && !st.dehumidifying;
      },
      condition: 'F-01',
      priority: 'urgent',
      description: 'Simultaneous heating and cooling — PHT and CHW both active',
      value: 45.2,
      lifecycle: 'active',
      acknowledged: false,
      operator: '',
      action: '',
      subsystem: 'AHU-4-4'
    },
    {
      id: 'preload-F02-1',
      timestamp: new Date('2026-05-16T09:15:00'),
      source: 'AI301@DEV4004',
      unitId: 'AHU-4-4', pointKey: 'supplyAirTemp',
      // Deviation from whichever setpoint is currently in control, so the test
      // follows a reset schedule or season change instead of a fixed number.
      test: function (st) {
        var sp = (typeof st.activeSetpoint === 'number') ? st.activeSetpoint : 60;
        return st.fanRunning && Math.abs(st.supplyAirTemp - sp) > 5;
      },
      condition: 'F-02',
      priority: 'high',
      description: 'Supply air temperature deviation exceeds 5°F from setpoint',
      value: 62.8,
      lifecycle: 'active',
      acknowledged: true,
      operator: 'cta_student',
      action: 'Acknowledged',
      subsystem: 'AHU-4-4'
    },
    {
      // Returned to normal but NOT yet acknowledged — outline, blinking. Seeded on
      // AHU-4-3 so its tree node has something to filter to, and so the
      // acknowledge-then-retire behaviour is demonstrable out of the box.
      id: 'preload-F02-3',
      timestamp: new Date('2026-05-15T14:42:00'),
      source: 'AI301@DEV4003',
      unitId: 'AHU-4-3', pointKey: 'supplyAirTemp',
      test: function (st) {
        var sp = (typeof st.activeSetpoint === 'number') ? st.activeSetpoint : 60;
        return st.fanRunning && Math.abs(st.supplyAirTemp - sp) > 5;
      },
      condition: 'F-02',
      priority: 'high',
      description: 'Supply air temperature deviation exceeds 5\u00b0F from setpoint',
      value: 55.4,
      lifecycle: 'inactive',
      acknowledged: false,
      operator: '',
      action: '',
      subsystem: 'AHU-4-3'
    },
    {
      id: 'preload-F03-1',
      timestamp: new Date('2026-05-18T02:00:00'),
      source: 'BI601@DEV4004',
      unitId: 'AHU-4-4', pointKey: 'fanRunning',
      // Running outside the Schedule Manager's occupied window. Trips by advancing
      // the clock past 18:00 with the unit still commanded on.
      test: function (st) { return !!st.fanRunning && !isOccupiedNow(); },
      condition: 'F-03',
      priority: 'high',
      description: 'AHU-4-4 running during unoccupied hours',
      value: 1,
      lifecycle: 'inactive',
      acknowledged: false,
      operator: '',
      action: '',
      subsystem: 'AHU-4-4'
    },
    {
      id: 'preload-F04-1',
      timestamp: new Date('2026-05-20T10:45:00'),
      source: 'AO104@DEV4004',
      unitId: 'AHU-4-4', pointKey: 'oaDamperPosition',
      // Fully closed while occupied — distinct from AHU44NewFaultEngine's N-04,
      // which trips on the damper being anywhere below the unit's ASHRAE 62.1
      // minimum. Two rules on one condition would put two alarms on the screen for
      // one fault, so this one is reserved for the more severe case: shut, not
      // merely low. Threshold read from the unit's own minimum rather than a number
      // picked here, so it cannot disagree with how the unit is configured.
      test: function (st) {
        var minPos = (typeof st.economizerMinPosition === 'number') ? st.economizerMinPosition : 20;
        return st.fanRunning && isOccupiedNow() && st.oaDamperPosition < Math.min(1, minPos);
      },
      condition: 'F-04',
      priority: 'urgent',
      description: 'Outdoor air damper fully closed during occupied hours',
      value: 2.1,
      lifecycle: 'active',
      acknowledged: false,
      operator: '',
      action: '',
      subsystem: 'AHU-4-4'
    },
    {
      id: 'preload-F06-1',
      timestamp: new Date('2026-05-22T11:30:00'),
      source: 'AI401@DEV4004',
      unitId: 'AHU-4-4', pointKey: 'co2Sensor',
      test: function (st) { return st.co2Sensor > 1100; },
      condition: 'F-06',
      priority: 'urgent',
      description: 'CO2 exceeds ventilation threshold (>1,100 ppm)',
      value: 1180,
      lifecycle: 'active',
      acknowledged: false,
      operator: '',
      action: '',
      subsystem: 'AHU-4-4'
    },
    {
      id: 'preload-F05-1',
      timestamp: new Date('2026-06-01T08:00:00'),
      source: 'AI701@DEV5000',
      unitId: 'AHU-4-4', pointKey: 'oaTemperature',
      // Free cooling available and unused. Trips by setting a mild outdoor
      // condition while the economizer stays disabled.
      test: function (st) {
        return st.fanRunning && !st.economizerActive &&
               st.oaTemperature >= 45 && st.oaTemperature <= 65;
      },
      condition: 'F-05',
      priority: 'high',
      description: 'Economizer not active when OAT permits free cooling',
      value: 52.3,
      lifecycle: 'inactive',
      acknowledged: false,
      operator: '',
      action: '',
      subsystem: 'Outdoor'
    }
  ];

  // ─── Location/Filter Tree (Requirement 13.1, Property 15) ─────────────────────

  // One node per station tab. AHU-4-3 and VAV-02-03 were missing, so their alarms
  // could only ever be seen under All Alarms — filtering to a unit silently
  // excluded them.
  var TREE_NODES = [
    { id: 'all', label: 'All Alarms', parent: null },
    { id: 'AHU-4-6', label: 'AHU-4-6', parent: 'all' },
    { id: 'AHU-4-4', label: 'AHU-4-4', parent: 'all' },
    { id: 'AHU-4-3', label: 'AHU-4-3', parent: 'all' },
    { id: 'AHU-23-1', label: 'AHU-23-1', parent: 'all' },
    { id: 'VAV-4-4-02', label: 'VAV-4-4 (Conference Room)', parent: 'all' },
    // VAV-02-03 is hidden from the station tab bar, so it has no node here either
    // — an empty filter for a unit the operator cannot open is just clutter.
    { id: 'Outdoor', label: 'Outdoor', parent: 'all' }
  ];

  // Map source BACnet addresses to subsystems
  function getSubsystemForSource(source) {
    if (!source) return 'all';
    if (source.indexOf('DEV4004') !== -1) return 'AHU-4-4';
    if (source.indexOf('DEV4006') !== -1) return 'AHU-4-6';
    if (source.indexOf('DEV4003') !== -1) return 'AHU-4-3';
    if (source.indexOf('DEV2301') !== -1) return 'AHU-23-1';
    if (source.indexOf('DEV4402') !== -1) return 'VAV-4-4-02';
    if (source.indexOf('DEV0203') !== -1) return 'VAV-02-03';
    if (source.indexOf('DEV5000') !== -1) return 'Outdoor';
    return 'all';
  }

  // Check if alarm belongs to node or its descendants
  function alarmMatchesNode(alarm, nodeId) {
    if (nodeId === 'all') return true;
    var subsystem = alarm.subsystem || getSubsystemForSource(alarm.source);
    return subsystem === nodeId;
  }

  // ─── Filter Tree Component ────────────────────────────────────────────────────

  function FilterTree({ selectedNode, onSelectNode, alarmCounts }) {
    return React.createElement('div', {
      style: { width: '230px', background: '#0e1420', borderRight: '1px solid #232c3d',
               padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '2px',
               overflowY: 'auto', flexShrink: 0 },
      role: 'tree',
      'aria-label': 'Alarm location filter'
    },
      TREE_NODES.map(function (node) {
        var isSelected = selectedNode === node.id;
        var count = alarmCounts[node.id] || 0;
        var isRoot = node.parent === null;

        return React.createElement('button', {
          key: node.id,
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                   width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: '5px',
                   fontSize: '12.5px', fontWeight: isSelected ? 800 : (isRoot ? 700 : 600),
                   paddingLeft: isRoot ? '10px' : '16px', border: 'none', cursor: 'pointer',
                   fontFamily: 'inherit',
                   background: isSelected ? 'linear-gradient(180deg,#2f6fd0,#1f57c8)' : 'transparent',
                   color: isSelected ? '#fff' : '#c3cfdd' },
          onMouseEnter: function (e) { if (!isSelected) e.currentTarget.style.background = '#18202e'; },
          onMouseLeave: function (e) { if (!isSelected) e.currentTarget.style.background = 'transparent'; },
          onClick: function () { onSelectNode(node.id); },
          role: 'treeitem',
          'aria-selected': isSelected
        },
          React.createElement('span', null, node.label),
          React.createElement('span', {
            style: { fontSize: '10.5px', fontWeight: 800, minWidth: '18px', textAlign: 'center',
                     padding: '1px 5px', borderRadius: '9px',
                     background: isSelected ? 'rgba(8,16,32,.42)' : '#1c2432',
                     color: isSelected ? '#e8f1ff' : '#7f8fa6' }
          }, count)
        );
      })
    );
  }

  // ─── Column Definitions ───────────────────────────────────────────────────────

  // Alarm table geometry. TREE_W matches FilterTree's width and SELECT_W /
  // CELL_PAD_X are set explicitly (rather than via w-9/px-* utilities, which the
  // prebuilt output.css doesn't all carry) so the title bar can line the screen
  // heading up with the Action column from the same numbers.
  var TREE_W = 230, SELECT_W = 36, CELL_PAD_X = 10, BOX_W = 15;

  // Action sits in the leftmost data position (right after the selection
  // spacer), so the acknowledge state of every row reads down a single edge
  // column. The 'select' column used to hold a per-row checkbox for
  // multi-select acknowledge; that was removed (real BMS practice requires
  // acknowledging alarms one at a time, per Lev) but the column stays as a
  // plain spacer so the row-highlight/click-to-select gutter still lines up.
  var COLUMNS = [
    { key: 'select', label: '', sortable: false, width: '' },
    { key: 'action', label: 'Action', sortable: true, width: 'w-24' },
    { key: 'icon', label: '', sortable: false, width: 'w-10' },
    { key: 'source', label: 'Source', sortable: true, width: 'w-36' },
    { key: 'condition', label: 'Condition', sortable: true, width: 'w-24' },
    { key: 'operator', label: 'Operator', sortable: true, width: 'w-28' },
    { key: 'priority', label: 'Priority', sortable: true, width: 'w-24' },
    { key: 'description', label: 'Description', sortable: true, width: 'w-96' },
    { key: 'value', label: 'Value', sortable: true, width: 'w-20', align: 'right' }
  ];

  // ─── Selection tick box ───────────────────────────────────────────────────────
  // A real <input type="checkbox"> so keyboard and screen readers get the native
  // behaviour, but drawn explicitly (appearance:none + an inline check glyph) so
  // the ticked state is unambiguous against the dark rows.
  // ─── Sorting Logic (Property 14) ─────────────────────────────────────────────

  function compareAlarms(a, b, sortColumn, sortDirection) {
    var valA, valB;

    var ACTION_RANK = { awaiting: 0, acked: 1, solved: 2 };

    switch (sortColumn) {
      case 'action':
        valA = ACTION_RANK[actionStateFor(a)];
        valB = ACTION_RANK[actionStateFor(b)];
        break;
      case 'timestamp':
        valA = a.timestamp ? a.timestamp.getTime() : 0;
        valB = b.timestamp ? b.timestamp.getTime() : 0;
        break;
      case 'priority':
        var priorityOrder = { urgent: 0, high: 1, low: 2, journal: 3 };
        valA = priorityOrder[a.priority] !== undefined ? priorityOrder[a.priority] : 99;
        valB = priorityOrder[b.priority] !== undefined ? priorityOrder[b.priority] : 99;
        break;
      case 'value':
        // Sort on what is displayed — a column sorted by a hidden frozen number
        // while showing live readings is worse than not sorting at all.
        var lvA = liveReading(a), lvB = liveReading(b);
        valA = Number(lvA !== undefined ? lvA : a.value) || 0;
        valB = Number(lvB !== undefined ? lvB : b.value) || 0;
        break;
      default:
        valA = (a[sortColumn] || '').toString().toLowerCase();
        valB = (b[sortColumn] || '').toString().toLowerCase();
        break;
    }

    var result = 0;
    if (valA < valB) result = -1;
    else if (valA > valB) result = 1;

    return sortDirection === 'desc' ? -result : result;
  }

  // ─── Action column ───────────────────────────────────────────────────────────
  // Three states, because acknowledging is not the same as fixing: an alarm that
  // has been acknowledged AND has returned to normal is done with, one that is
  // acknowledged but still active is seen-but-unresolved, and one that is neither
  // is still waiting on the operator.
  function actionStateFor(alarm) {
    if (!alarm.acknowledged) return 'awaiting';
    return alarm.lifecycle === 'inactive' ? 'solved' : 'acked';
  }

  var ACTION_LABELS = { awaiting: 'Awaiting', acked: 'Acknowledged', solved: 'Solved' };
  var ACTION_COLORS = { awaiting: '#e6a23c', acked: '#6ee7a8', solved: '#5b9bd5' };
  var ACTION_TITLES = {
    awaiting: 'Awaiting acknowledgment',
    acked: 'Acknowledged — condition still active',
    solved: 'Solved — acknowledged and returned to normal'
  };

  function actionLabelFor(alarm) { return ACTION_LABELS[actionStateFor(alarm)]; }
  function actionTitleFor(alarm) { return ACTION_TITLES[actionStateFor(alarm)]; }
  function actionColorFor(alarm) { return ACTION_COLORS[actionStateFor(alarm)]; }

  // ─── Event history: the backlog of acknowledged alarms ───────────────────────
  // An alarm that has cleared AND been acknowledged leaves the Summary, which is
  // right — there is nothing left to act on. But it was leaving with no record at
  // all, so there was no way to answer "what has been acknowledged, by whom, and
  // when". Real Station retires these to Event history; this is that list.
  var HISTORY_KEY = 'cta_alarm_history';
  var HISTORY_CAP = 200;   // newest kept; a training session never needs more

  function readHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function retireToHistory(alarm, operator) {
    try {
      var hist = readHistory();
      // Keyed by alarm id so a condition that trips, clears and trips again does
      // not overwrite its own earlier record.
      var stamp = new Date().toISOString();
      hist.unshift({
        id: alarm.id + '@' + stamp,
        alarmId: alarm.id,
        source: alarm.source,
        condition: alarm.condition,
        priority: alarm.priority,
        description: alarm.description,
        subsystem: alarm.subsystem || alarm.unitId,
        raisedAt: alarm.timestamp ? String(alarm.timestamp) : null,
        acknowledgedBy: operator || alarm.operator || 'operator',
        retiredAt: stamp
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, HISTORY_CAP)));
    } catch (e) {}
  }

  // ─── Are these conditions actually true right now? ───────────────────────────
  // The preloaded rows came from the legacy screenshots and were displayed
  // unconditionally: every one of them was always in the list whether or not the
  // condition existed in the running model. That is why an alarm could claim
  // simultaneous heating and cooling while both coil valves read closed.
  //
  // Each now carries a test against its unit's live state, and the list is derived
  // from those tests. An alarm appears when its condition becomes true, stays
  // (cleared, awaiting acknowledgment) when it goes false, and leaves once it has
  // been both cleared and acknowledged.
  var OCCUPIED_START_HOUR = 8;   // Schedule Manager's AHU-4-4 occupied window,
  var OCCUPIED_END_HOUR = 18;    // 08:00–18:00. Unoccupied is anything outside it.

  function isOccupiedNow() {
    var eng = window.SimulationEngine;
    var d = (eng && typeof eng.getCurrentTimestamp === 'function')
      ? eng.getCurrentTimestamp() : new Date();
    if (!d || typeof d.getHours !== 'function') return true;
    var h = d.getHours();
    var day = d.getDay();
    if (day === 0 || day === 6) return false;   // weekends are unoccupied
    return h >= OCCUPIED_START_HOUR && h < OCCUPIED_END_HOUR;
  }

  function stateOf(unitId) {
    var name = UNIT_CONTROLLERS[unitId];
    var c = name && window[name];
    return (c && typeof c.getState === 'function') ? c.getState() : null;
  }

  // ─── Alarm value ─────────────────────────────────────────────────────────────
  // A bare "45.2" or "1" tells an operator nothing: no unit, and for a binary
  // point no meaning at all. Worse, the number was frozen at authoring time, so an
  // alarm could report a valve at 25% while the unit's own panel read 0% — the
  // alarm list and the diagram disagreeing is the fastest way to lose a student's
  // trust in both.
  //
  // The value is now read from the unit's controller wherever the alarm names a
  // point, and formatted with that point's own unit and precision from the shared
  // point metadata. The frozen value is the fallback for alarms that report
  // something with no live equivalent.
  var UNIT_CONTROLLERS = {
    'AHU-4-6': 'AHU46Controller', 'AHU-4-4': 'AHU44NewController',
    'AHU-4-3': 'AHU43Controller', 'AHU-23-1': 'AHU23Controller'
  };

  /**
   * The controller field an alarm reports on, from whichever of three places
   * carries it: preloaded alarms name it outright, AHU46FaultEngine copies
   * sourceField onto the alarm, and AHU44NewFaultEngine leaves it only inside the
   * source string as "supplyAirTemp@AHU-4-4". Resolved in one place so the value,
   * its unit and its tooltip can never disagree about which point is being shown.
   */
  function pointKeyFor(alarm) {
    if (!alarm) return null;
    if (alarm.pointKey) return alarm.pointKey;
    if (alarm.sourceField) return alarm.sourceField;
    if (alarm.source && alarm.source.indexOf('@') > 0) {
      var head = alarm.source.split('@')[0];
      // A controller field name, never a BACnet address like AI301.
      if (/^[a-z][A-Za-z0-9]*$/.test(head)) return head;
    }
    return null;
  }

  function unitIdFor(alarm) {
    return (alarm && (alarm.unitId || alarm.subsystem)) || null;
  }

  function liveReading(alarm) {
    var key = pointKeyFor(alarm);
    if (!key) return undefined;
    var ctrlName = UNIT_CONTROLLERS[unitIdFor(alarm)];
    var ctrl = ctrlName && window[ctrlName];
    if (!ctrl || typeof ctrl.getState !== 'function') return undefined;
    var v = ctrl.getState()[key];
    return (v === undefined || v === null) ? undefined : v;
  }

  function pointMeta(alarm) {
    var BP = window.SymmetreBoardPoints;
    var key = pointKeyFor(alarm);
    if (!BP || !key) return null;
    // meta(key, unitId), not POINTS[key] — the accessor also applies each unit's
    // own label/unit overrides, so CO₂ reads PPM on the units that name it that
    // way. Reaching for a raw POINTS map found nothing, which made the whole
    // unit/precision branch below dead code.
    if (typeof BP.meta === 'function') {
      return BP.meta(key, unitIdFor(alarm)) || null;
    }
    return (BP.META && BP.META[key]) || null;
  }

  /** Display string for the Value column: live where possible, always with a unit. */
  function formatAlarmValue(alarm) {
    var BP = window.SymmetreBoardPoints;
    var key = pointKeyFor(alarm);
    var live = liveReading(alarm);
    var v = (live !== undefined) ? live : alarm.value;
    if (v === undefined || v === null) return '—';

    // Use the board's own formatter so the alarm list and the diagram chips cannot
    // drift apart in how they render the same point. It already resolves each
    // point's precision and its ON/OFF (or Open/Closed) option labels — which is
    // what turns a stored "1" into a reading instead of a bare digit.
    if (key && BP && typeof BP.format === 'function') {
      var formatted = BP.format(key, v);
      if (formatted !== undefined && formatted !== null && formatted !== '') {
        var text = String(formatted);
        var meta = pointMeta(alarm);
        var unit = meta && meta.unit ? String(meta.unit) : '';
        // A state word (ON, Open, Manual) carries no unit; a number takes one.
        var isNumeric = /^-?[\d,]+(\.\d+)?$/.test(text);
        if (!unit || !isNumeric) return text;
        // °F sits tight against the number; PPM and CFM read as words after a space.
        return unit.charAt(0) === '\u00b0' ? text + unit : text + ' ' + unit.trim();
      }
    }

    // Fallback for anything with no point behind it — engine strings such as
    // "DPS-2 (Supply Suction)", or a preloaded value naming no live point.
    if (typeof v === 'boolean') return v ? 'ON' : 'OFF';

    // A comma-joined list of raw camelCase state keys, which is what the
    // manual-overrides rule produces. Rendered bare it read
    // "oaTemperature,oaRelH…" — internal identifiers, truncated mid-word, in an
    // 80px right-aligned numeric column. A count fits and means something; the
    // full list, in readable point labels, goes to the tooltip.
    var text = String(v);
    if (text.indexOf(',') > 0 && /^[a-z][A-Za-z0-9]*(,[a-z][A-Za-z0-9]*)+$/.test(text)) {
      var n = text.split(',').length;
      return n + ' points';
    }
    return text;
  }

  /** Readable point labels for a comma-joined key list, for the tooltip. */
  function expandKeyList(v) {
    var BP = window.SymmetreBoardPoints;
    var text = String(v == null ? '' : v);
    if (!(text.indexOf(',') > 0) || !BP || typeof BP.meta !== 'function') return text;
    return text.split(',').map(function (k) {
      var m = BP.meta(k.trim());
      return (m && m.label) ? m.label : k.trim();
    }).join(', ');
  }

  /** True when the number shown is coming from the running model. */
  function isLiveValue(alarm) { return liveReading(alarm) !== undefined; }

  // ─── Format timestamp for display ────────────────────────────────────────────

  function formatTimestamp(date) {
    if (!date) return '—';
    var d = date instanceof Date ? date : new Date(date);
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var year = d.getFullYear();
    var hours = String(d.getHours()).padStart(2, '0');
    var minutes = String(d.getMinutes()).padStart(2, '0');
    var seconds = String(d.getSeconds()).padStart(2, '0');
    return month + '/' + day + '/' + year + ' ' + hours + ':' + minutes + ':' + seconds;
  }

  // ─── Alarm Table Header ───────────────────────────────────────────────────────

  function AlarmTableHeader({ sortColumn, sortDirection, onSort }) {
    return React.createElement('div', {
      className: 'select-none alarm-grid',
      style: { display: 'flex', alignItems: 'stretch', background: '#23272e',
               borderBottom: '1px solid #0f1319',
               position: 'sticky', top: 0, zIndex: 10 },
      role: 'row'
    },
      COLUMNS.map(function (col) {
        var isSorted = sortColumn === col.key;
        var sortIndicator = '';
        if (isSorted) {
          sortIndicator = sortDirection === 'asc' ? ' ▲' : ' ▼';
        }

        if (col.key === 'select') {
          // Plain spacer — the multi-select "acknowledge all" checkbox
          // column was removed (item B: real BMS requires one-at-a-time
          // acknowledgment). Kept as an empty cell so columns still line up
          // with each row's selection gutter.
          return React.createElement('div', {
            key: col.key,
            style: { width: SELECT_W + 'px', flexShrink: 0, padding: '8px 6px', boxSizing: 'border-box' },
            role: 'columnheader'
          });
        }

        return React.createElement('div', {
          key: col.key,
          className: col.width + ' truncate',
          style: { padding: '8px ' + CELL_PAD_X + 'px', fontSize: '11.5px', fontWeight: 700,
                   color: '#9db0c8', letterSpacing: '.3px',
                   textAlign: col.align || 'left',
                   minWidth: col.minWidth, flexShrink: col.minWidth ? 0 : undefined,
                   cursor: col.sortable ? 'pointer' : 'default' },
          role: 'columnheader',
          'aria-sort': isSorted ? sortDirection + 'ending' : 'none',
          onClick: col.sortable ? function () { onSort(col.key); } : undefined
        }, col.label + sortIndicator);
      })
    );
  }

  // ─── Alarm Table Row ──────────────────────────────────────────────────────────

  function AlarmTableRow({ alarm, isSelected, onSelect, onContextMenu, index }) {
    var priColor = alarm.priority === 'urgent' ? '#fca5a5'
      : (alarm.priority === 'low' ? '#93c5fd' : '#fcd34d');
    var acked = !!alarm.acknowledged;

    return React.createElement('div', {
      className: 'flex items-center alarm-grid',
      style: { borderBottom: '1px solid #0f1319', fontSize: '11.5px',
               color: isSelected ? '#fff' : '#c3cfdd',
               background: isSelected
                 ? 'linear-gradient(180deg,#22437f,#1b3568)'
                 : (index % 2 ? '#1b2029' : '#171c24') },
      role: 'row',
      'aria-selected': isSelected,
      onClick: function () { onSelect(alarm.id); },
      onContextMenu: function (e) { onContextMenu(e, alarm); }
    },
      // Spacer — click anywhere on the row to select it (single alarm at a
      // time); see the header's matching spacer comment for why this column
      // no longer holds a checkbox.
      React.createElement('div', {
        style: { width: SELECT_W + 'px', flexShrink: 0, padding: '6px', boxSizing: 'border-box' }
      }),
      // Action (leftmost data column)
      React.createElement('div', {
        className: 'w-24 py-1.5 truncate',
        style: { padding: '6px ' + CELL_PAD_X + 'px', color: actionColorFor(alarm),
                 fontWeight: 700 },
        title: actionTitleFor(alarm)
      }, actionLabelFor(alarm)),
      // Icon column
      React.createElement('div', { className: 'w-10 px-2 py-1.5 flex items-center justify-center' },
        React.createElement(AlarmIcon, {
          priority: alarm.priority,
          lifecycle: alarm.lifecycle,
          acknowledged: alarm.acknowledged
        })
      ),
      // Source (clickable — navigates to EBI Point Detail)
      React.createElement('div', {
        className: 'w-36 px-2 py-1.5 truncate cursor-pointer',
        style: { fontFamily: 'Consolas,Menlo,monospace', fontSize: '11px',
                 color: '#8fd0ff', textDecoration: 'underline',
                 textDecorationColor: 'rgba(143,208,255,.35)' },
        onClick: function (e) {
          e.stopPropagation();
          if (alarm.source) {
            window.location.hash = '#/ebi/' + alarm.source + '/general';
          }
        },
        title: alarm.source ? 'Navigate to point detail: ' + alarm.source : ''
      },
        alarm.source || '—'
      ),
      // Condition
      React.createElement('div', { className: 'w-24 px-2 py-1.5 truncate' },
        alarm.condition || '—'
      ),
      // Operator
      React.createElement('div', { className: 'w-28 px-2 py-1.5 truncate' },
        alarm.operator || '—'
      ),
      // Priority
      React.createElement('div', {
        className: 'w-24 px-2 py-1.5 truncate capitalize',
        style: { color: priColor, fontWeight: 700 }
      }, alarm.priority || '—'),
      // Description — the field that says what the alarm actually IS, so truncating
      // it with no way to read the rest hides the point of the row. Several
      // conditions are longer than any workable column width, so the cell wraps to a
      // second line when the text needs it rather than cutting off. Fixed width is
      // kept so the row's intrinsic width still matches the header's when scrolled
      // sideways, and the full text is also on hover for the rare third line.
      React.createElement('div', {
        className: 'w-96 px-2 py-1.5',
        title: alarm.description || '',
        style: {
          whiteSpace: 'normal',
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }
      }, alarm.description || '—'),
      // Value
      React.createElement('div', {
        className: 'w-20 truncate text-right',
        style: { padding: '6px ' + CELL_PAD_X + 'px', fontVariantNumeric: 'tabular-nums' }
      },
        React.createElement('span', {
          // A live reading is marked, because an operator needs to know whether a
          // number is the point's reading now or the value recorded at trip time.
          title: isLiveValue(alarm)
            ? 'Live reading from ' + unitIdFor(alarm) + ' \u00b7 ' + pointKeyFor(alarm)
            // The full list of overridden points, in readable labels, since the cell
            // itself only has room for the count.
            : (String(alarm.value || '').indexOf(',') > 0
                ? 'Overridden: ' + expandKeyList(alarm.value)
                : 'Value recorded when the alarm was raised'),
          style: isLiveValue(alarm) ? null : { opacity: 0.72, fontStyle: 'italic' }
        }, formatAlarmValue(alarm))
      )
    );
  }

  // ─── Context Menu Component ───────────────────────────────────────────────────

  function ContextMenu({ x, y, alarm, onAcknowledge, onClose }) {
    var menuRef = useRef(null);

    useEffect(function () {
      function handleClickOutside(e) {
        if (menuRef.current && !menuRef.current.contains(e.target)) {
          onClose();
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return function () { document.removeEventListener('mousedown', handleClickOutside); };
    }, [onClose]);

    // Any unacknowledged alarm can be acknowledged, active or returned-to-normal.
    // Acknowledging is the operator saying "I have seen this" — it is not a
    // statement that the condition is gone, so a cleared alarm still needs it.
    var canAck = alarm && !alarm.acknowledged;

    return React.createElement('div', {
      ref: menuRef,
      className: 'fixed bg-gray-800 border border-gray-600 rounded shadow-lg py-1 z-50 min-w-[160px]',
      style: { left: x + 'px', top: y + 'px' }
    },
      React.createElement('button', {
        className: [
          'w-full text-left px-4 py-1.5 text-sm',
          canAck ? 'text-gray-200 hover:bg-blue-700' : 'text-gray-500 cursor-not-allowed'
        ].join(' '),
        disabled: !canAck,
        onClick: function () {
          if (canAck) {
            onAcknowledge(alarm);
            onClose();
          }
        }
      }, 'Acknowledge Alarm'),
      React.createElement('button', {
        className: 'w-full text-left px-4 py-1.5 text-sm text-gray-200 hover:bg-blue-700',
        onClick: onClose
      }, 'Close')
    );
  }

  // ─── Acknowledge Button (toolbar action) ──────────────────────────────────────

  // Acknowledges exactly one alarm at a time — the selected/highlighted row —
  // matching real BMS practice (per Lev: no one-click "acknowledge all", so
  // an operator can't wave away active alarms unseen). A prior multi-select
  // version was removed; see item B in docs/BMS_Simulator_Issue_Checklist.md.
  function AcknowledgeButton({ alarm, canAck, onAcknowledge }) {
    var disabled = !canAck || !alarm || alarm.acknowledged;

    return React.createElement('div', { className: 'flex items-center gap-2' },
      React.createElement('button', {
        style: { padding: '5px 14px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 800,
                 letterSpacing: '.3px', fontFamily: 'inherit',
                 border: '1px solid ' + (disabled ? '#38445c' : '#2f7a52'),
                 background: disabled ? '#1b2230' : 'linear-gradient(180deg,#3f8f5a,#2d7346)',
                 color: disabled ? '#5d6b83' : '#fff',
                 cursor: disabled ? 'not-allowed' : 'pointer' },
        disabled: disabled,
        onClick: function () {
          if (!disabled) onAcknowledge(alarm);
        },
        title: disabled
          ? 'Select an unacknowledged alarm above (requires AckOnly+ security)'
          : 'Acknowledge this alarm — marks it as seen but does NOT resolve the underlying fault'
      }, '\u2713 Acknowledge'),
      React.createElement('span', {
        style: { fontSize: '10.5px', fontWeight: 700, color: '#6f9a82' }
      }, 'Acknowledged ≠ fixed')
    );
  }

  // ─── Main AlarmSummary Component ──────────────────────────────────────────────

  function AlarmSummaryComponent() {
    var auth = useContext(window.AuthContext);

    // Alarm data state
    var [alarms, setAlarms] = useState(PRELOADED_ALARMS);

    // Selection state — the single highlighted row. A ticked multi-select
    // set used to live here too; removed along with the bulk-acknowledge UI
    // (item B — real BMS requires acknowledging one alarm at a time).
    var [selectedAlarmId, setSelectedAlarmId] = useState(null);
    var [selectedNode, setSelectedNode] = useState('all');

    // Sort state (Property 14)
    // Date/Time is no longer a column, so the list opens sorted by the state an
    // operator acts on: everything awaiting acknowledgment first.
    var [sortColumn, setSortColumn] = useState('action');
    var [sortDirection, setSortDirection] = useState('asc');

    // Context menu state
    var [contextMenu, setContextMenu] = useState(null);

    // id -> { acknowledged, operator, action }. Outlives the rows themselves, so a
    // retired alarm cannot be resurrected as unacknowledged by the next poll.
    var ackStateRef = useRef({});

    // id -> { tripped } for the condition-driven rows. A condition that has never
    // been true has no alarm at all; once it has tripped, the row persists through
    // the condition clearing so the operator still has something to acknowledge.
    var trippedRef = useRef({});

    // Active alarms, or the acknowledged backlog.
    var [view, setView] = useState('active');
    var [history, setHistory] = useState(readHistory);

    // Refresh alarms from FaultEngine periodically
    useEffect(function () {
      // SCENARIO_TRACKING.md items #17, #19, #20: FaultEngine.js's F-01
      // through F-06 are legacy rules driven by static PointRegistry
      // historical playback, completely disconnected from any live
      // controller. F-01 (AHU-4-6) is fully superseded by the live
      // AHU46FaultEngine's M-01; F-02/F-03/F-04/F-06 (AHU-4-4) are each
      // fully superseded by AHU44NewFaultEngine's N-01 through N-04 (1:1
      // description match, confirmed below); F-05 (cooling tower,
      // BI801@DEV6000) has no live counterpart anywhere in the app and is
      // canned-off for virtually its entire historical dataset. Left
      // undisplayed here rather than shown alongside — and disagreeing
      // with — the live alarms these same conditions now generate.
      // FaultEngine.js itself is intentionally left untouched (rules,
      // evaluate(), and its own test suite all still work exactly as
      // before) — this filters only what reaches this screen.
      var LEGACY_RULE_IDS_SUPERSEDED_BY_LIVE_ENGINES = ['F-01', 'F-02', 'F-03', 'F-04', 'F-05', 'F-06'];

      function refreshAlarms() {
        if (window.FaultEngine && typeof window.FaultEngine.getAllAlarms === 'function') {
          var engineAlarms = window.FaultEngine.getAllAlarms().filter(function (a) {
            return LEGACY_RULE_IDS_SUPERSEDED_BY_LIVE_ENGINES.indexOf(a.condition) === -1;
          });

          // AHU-4-4 alarms come from a separate engine (its own
          // formula-driven state isn't part of PointRegistry) — merge them
          // in here so one Alarm Summary screen covers both. Each alarm
          // already carries an explicit `subsystem` field, so no source-
          // address parsing is needed for these.
          if (window.AHU44NewFaultEngine && typeof window.AHU44NewFaultEngine.getAllAlarms === 'function') {
            engineAlarms = engineAlarms.concat(window.AHU44NewFaultEngine.getAllAlarms());
          }

          // AHU-4-6 (Meeting Room) alarms — same reasoning as AHU-4-4
          // above. Previously missing entirely from this screen (see
          // SCENARIO_TRACKING.md item #19's follow-up note) — the App.jsx
          // tick loop now evaluates this engine on every tick regardless
          // of which screen is mounted, so activeAlarms stays current
          // even when nobody's viewing the AHU-4-6 screen itself.
          if (window.AHU46FaultEngine && typeof window.AHU46FaultEngine.getAllAlarms === 'function') {
            engineAlarms = engineAlarms.concat(window.AHU46FaultEngine.getAllAlarms());
          }

          // AHU-23-1. The tree node and DEV2301 routing were already here; the engine
          // was the missing piece, so this unit's conditions never reached the list.
          if (window.AHU23FaultEngine && typeof window.AHU23FaultEngine.getAllAlarms === 'function') {
            engineAlarms = engineAlarms.concat(window.AHU23FaultEngine.getAllAlarms());
          }

          // VAV-4-4-02 alarms come from a third engine, one zone at a
          // time (VAVFaultEngine is multi-instance, keyed by zoneId — see
          // VAVController.js for why two zones share one module). Each
          // alarm already carries subsystem = zoneId.
          if (window.VAVFaultEngine && window.VAVController &&
              typeof window.VAVFaultEngine.getAllAlarms === 'function' &&
              typeof window.VAVController.getZoneIds === 'function') {
            window.VAVController.getZoneIds().forEach(function (zoneId) {
              engineAlarms = engineAlarms.concat(window.VAVFaultEngine.getAllAlarms(zoneId));
            });
          }

          setAlarms(function (currentAlarms) {
            // Seed the persistent record from anything already acknowledged on
            // screen (covers alarms acknowledged before this ref existed, and the
            // preloaded records that seed as acknowledged).
            currentAlarms.forEach(function (a) {
              if (a.acknowledged && !ackStateRef.current[a.id]) {
                ackStateRef.current[a.id] = {
                  acknowledged: true, operator: a.operator, action: a.action
                };
              }
            });
            var ackMap = ackStateRef.current;

            // Start from preloaded as base
            var existingIds = new Set(PRELOADED_ALARMS.map(function (a) { return a.id; }));
            // Evaluate each preloaded condition against its unit's live state, and
            // build the row only where there is something real to report. An alarm
            // with no test at all is left as-is rather than silently dropped.
            var merged = [];
            PRELOADED_ALARMS.forEach(function (a) {
              var row = ackMap[a.id] ? Object.assign({}, a, ackMap[a.id]) : Object.assign({}, a);

              if (typeof a.test === 'function') {
                var st = stateOf(a.unitId);
                var isTrue = false;
                if (st) { try { isTrue = !!a.test(st); } catch (e) { isTrue = false; } }

                if (isTrue) {
                  if (!trippedRef.current[a.id]) {
                    trippedRef.current[a.id] = { tripped: true };
                    // A fresh trip is unacknowledged and stamped now, not at the
                    // authoring date the legacy row carried.
                    delete ackStateRef.current[a.id];
                    row = Object.assign({}, a, { timestamp: new Date() });
                  }
                  row.lifecycle = 'active';
                  row.acknowledged = !!(ackMap[a.id] && ackMap[a.id].acknowledged);
                } else if (trippedRef.current[a.id]) {
                  // Condition gone but not yet signed for: stays, cleared.
                  row.lifecycle = 'inactive';
                  row.acknowledged = !!(ackMap[a.id] && ackMap[a.id].acknowledged);
                  if (row.acknowledged) {
                    // Cleared and acknowledged — retire it and stop tracking, so it
                    // can trip cleanly again later.
                    delete trippedRef.current[a.id];
                    delete ackStateRef.current[a.id];
                    return;
                  }
                } else {
                  return;   // never tripped: not an alarm
                }
              }
              merged.push(row);
            });

            for (var i = 0; i < engineAlarms.length; i++) {
              var engineAlarm = engineAlarms[i];
              if (!existingIds.has(engineAlarm.id)) {
                // Add new alarm from engine
                var enriched = Object.assign({}, engineAlarm, {
                  subsystem: engineAlarm.subsystem || getSubsystemForSource(engineAlarm.source)
                });
                // Preserve acknowledged state if previously acknowledged
                if (ackMap[engineAlarm.id]) {
                  enriched = Object.assign(enriched, ackMap[engineAlarm.id]);
                }
                merged.push(enriched);
                existingIds.add(engineAlarm.id);
              } else {
                // Update existing alarm states from engine
                for (var j = 0; j < merged.length; j++) {
                  if (merged[j].id === engineAlarm.id) {
                    merged[j] = Object.assign({}, merged[j], {
                      lifecycle: engineAlarm.lifecycle,
                      acknowledged: ackMap[engineAlarm.id] ? true : engineAlarm.acknowledged,
                      operator: ackMap[engineAlarm.id] ? ackMap[engineAlarm.id].operator : (engineAlarm.operator || merged[j].operator),
                      action: ackMap[engineAlarm.id] ? ackMap[engineAlarm.id].action : (engineAlarm.action || merged[j].action)
                    });
                    break;
                  }
                }
              }
            }
            // An alarm that has BOTH returned to normal and been acknowledged is
            // finished with, and leaves the Summary — the operator has signed for
            // a condition that is no longer present, so there is nothing left to
            // act on. Acknowledging a still-active alarm does NOT remove it: that
            // row stays, filled and steady, because the condition persists.
            //
            // This is the SymmetrE behaviour the icon legend implies (three
            // states, no icon for cleared-and-acknowledged) and matches real
            // Station, which retires such alarms to Event history. The engines
            // keep the full record via getAllAlarms() either way.
            return merged.filter(function (a) {
              if (a.priority === 'journal') return false;
              if (a.lifecycle === 'inactive' && a.acknowledged) return false;
              return true;
            });
          });
        }
      }

      // Initial load
      refreshAlarms();

      // Poll every 2 seconds
      var interval = setInterval(refreshAlarms, 2000);
      return function () { clearInterval(interval); };
    }, []);

    // Filter alarms by selected tree node (Property 15)
    var filteredAlarms = alarms.filter(function (alarm) {
      return alarmMatchesNode(alarm, selectedNode);
    });

    // Sort filtered alarms (Property 14)
    var sortedAlarms = filteredAlarms.slice().sort(function (a, b) {
      return compareAlarms(a, b, sortColumn, sortDirection);
    });

    // Compute alarm counts per tree node
    var alarmCounts = {};
    TREE_NODES.forEach(function (node) {
      alarmCounts[node.id] = alarms.filter(function (alarm) {
        return alarmMatchesNode(alarm, node.id);
      }).length;
    });

    // Sort handler — toggles direction on re-click (Property 14)
    var handleSort = useCallback(function (column) {
      if (sortColumn === column) {
        setSortDirection(function (prev) { return prev === 'asc' ? 'desc' : 'asc'; });
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
    }, [sortColumn]);

    // Selection handler
    var handleSelect = useCallback(function (alarmId) {
      setSelectedAlarmId(alarmId);
    }, []);

    // Context menu handler
    var handleContextMenu = useCallback(function (e, alarm) {
      e.preventDefault();
      setSelectedAlarmId(alarm.id);
      setContextMenu({ x: e.clientX, y: e.clientY, alarm: alarm });
    }, []);

    // Acknowledge handler (requires AckOnly+ security)
    var handleAcknowledge = useCallback(function (alarm) {
      if (!auth || !auth.canAcknowledge || !auth.canAcknowledge()) {
        return;
      }

      // Update local alarm state. Previously gated on lifecycle === 'active',
      // which meant a cleared-but-still-unacknowledged alarm (e.g. the
      // preloaded F-03/F-05 demo records, which seed as lifecycle:
      // 'inactive') could never be acknowledged — ticking them and clicking
      // Acknowledge silently did nothing (checklist item "some alarms can't
      // be acknowledged at all"). Real BMS practice allows acknowledging an
      // alarm whether it's still active or has already cleared; only
      // "already acknowledged" should block it.
      var ackOperator = (auth && auth.operator) || 'operator';
      // Record it where the poll will find it, whether or not the row survives.
      ackStateRef.current[alarm.id] = {
        acknowledged: true,
        operator: ackOperator,
        action: 'Acknowledged'
      };
      // Acknowledging a cleared alarm finishes it, so it is written to the event
      // history on the way out. Previously it simply vanished, leaving no record of
      // what had been acknowledged or by whom.
      if (alarm.lifecycle === 'inactive') {
        retireToHistory(alarm, ackOperator);
        setHistory(readHistory());
      }
      setAlarms(function (prev) {
        return prev.map(function (a) {
          if (a.id === alarm.id && !a.acknowledged) {
            return Object.assign({}, a, {
              acknowledged: true,
              operator: auth.operator || 'operator',
              action: 'Acknowledged'
            });
          }
          return a;
        // An alarm that has cleared AND is now acknowledged is finished with, so it
        // leaves the Summary on the click rather than lingering until the next
        // 2-second poll happens to filter it.
        }).filter(function (a) {
          return !(a.lifecycle === 'inactive' && a.acknowledged);
        });
      });

      // Also acknowledge in the originating engine, if applicable.
      // AHU-4-4, AHU-4-6, and the two VAV zones each live in their own
      // engine, separate from everything else.
      if (alarm.subsystem === 'AHU-4-4') {
        if (window.AHU44NewFaultEngine && typeof window.AHU44NewFaultEngine.acknowledge === 'function') {
          window.AHU44NewFaultEngine.acknowledge(alarm.condition, auth.operator || 'operator');
        }
      } else if (alarm.subsystem === 'AHU-4-6') {
        if (window.AHU46FaultEngine && typeof window.AHU46FaultEngine.acknowledge === 'function') {
          window.AHU46FaultEngine.acknowledge(alarm.condition, auth.operator || 'operator');
        }
      } else if (alarm.subsystem === 'VAV-4-4-02') {
        if (window.VAVFaultEngine && typeof window.VAVFaultEngine.acknowledge === 'function') {
          window.VAVFaultEngine.acknowledge(alarm.subsystem, alarm.condition, auth.operator || 'operator');
        }
      } else if (window.FaultEngine && typeof window.FaultEngine.acknowledge === 'function') {
        window.FaultEngine.acknowledge(alarm.condition, auth.operator || 'operator');
      }
    }, [auth]);

    // Close context menu
    var closeContextMenu = useCallback(function () {
      setContextMenu(null);
    }, []);

    // Get selected alarm object
    var selectedAlarm = alarms.find(function (a) { return a.id === selectedAlarmId; }) || null;
    var canAck = auth && auth.canAcknowledge && auth.canAcknowledge();

    // Only the highlighted row can be acknowledged — one alarm at a time,
    // matching real BMS practice (see AcknowledgeButton above).

    // ─── Render ───────────────────────────────────────────────────────────────
    return React.createElement('div', {
      className: 'flex flex-col h-screen',
      style: { background: '#141a26', color: '#e8edf6',
               fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" },
      'data-screen-label': 'Alarm Summary'
    },
      // Title bar
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', height: '44px',
                 padding: '0 14px 0 0', background: '#0e1420',
                 borderBottom: '1px solid #232c3d', flexShrink: 0 }
      },
        // Back sits over the filter tree; the heading's left edge lines up with
        // the tick boxes below it (the box is centred in the SELECT_W column).
        React.createElement('div', {
          style: { width: TREE_W + 'px', flexShrink: 0, padding: '0 14px', boxSizing: 'border-box',
                   display: 'flex', alignItems: 'center' }
        },
        React.createElement('button', {
          style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                   borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                   background: '#1b2230', border: '1px solid #38445c', color: '#c3cfdd',
                   fontFamily: 'inherit', flexShrink: 0 },
          onClick: function () { window.location.hash = '#/symmetre'; },
          title: 'Return to SymmetrE Station'
        }, '← Back')
        ),
        React.createElement('h1', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14.5px',
                   fontWeight: 800, color: '#f2f6fd', margin: 0,
                   paddingLeft: ((SELECT_W - BOX_W) / 2) + 'px', flexShrink: 0 }
        },
          React.createElement('span', { style: { color: '#e6a23c' } }, '⚠'),
          'Alarm Summary'
        ),
        React.createElement('div', { style: { flex: 1 } }),
        React.createElement('span', {
          style: { fontSize: '10.5px', fontWeight: 700, color: '#e6a23c', flexShrink: 0 }
        }, 'Acknowledged ≠ fixed — alarms clear only when the fault clears')
      ),

      // Main content: filter tree + alarm list
      React.createElement('div', { className: 'flex flex-1 overflow-hidden' },
        // Left: Location/filter tree (Requirement 13.1)
        React.createElement(FilterTree, {
          selectedNode: selectedNode,
          onSelectNode: setSelectedNode,
          alarmCounts: alarmCounts
        }),

        // Right: Sortable alarm list (Requirement 13.2)
        React.createElement('div', { className: 'flex-1 flex flex-col overflow-hidden' },
          // Active alarms, or the acknowledged backlog. Two views rather than one
          // list, because they answer different questions: "what needs me now" and
          // "what has been signed for". Retired alarms used to disappear with no
          // record of either the acknowledgment or who made it.
          React.createElement('div', {
            className: 'flex items-center gap-1 px-3 py-2',
            style: { borderBottom: '1px solid #2b3850', flexShrink: 0 }
          },
            ['active', 'history'].map(function (v) {
              var on = view === v;
              var label = v === 'active'
                ? 'Active Alarms (' + alarms.length + ')'
                : 'Acknowledged History (' + history.length + ')';
              return React.createElement('button', {
                key: v,
                type: 'button',
                onClick: function () {
                  setView(v);
                  if (v === 'history') setHistory(readHistory());
                },
                style: {
                  padding: '5px 12px', borderRadius: '5px', fontSize: '11px',
                  fontWeight: 800, letterSpacing: '.3px', cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: on ? 'rgba(53,189,211,.16)' : 'transparent',
                  border: '1px solid ' + (on ? '#2b8fa3' : 'transparent'),
                  color: on ? '#cfe6ea' : '#9db0c8'
                }
              }, label);
            })
          ),

          view === 'history' ? React.createElement('div', {
            className: 'flex-1 overflow-auto',
            style: { padding: '10px 12px' }
          },
            history.length === 0
              ? React.createElement('div', {
                  style: { fontSize: '12px', color: '#6f7f97', padding: '14px 2px', lineHeight: 1.5 }
                }, 'Nothing here yet. An alarm arrives in this list once it has both returned to normal and been acknowledged \u2014 at that point it has left the active list, and this is the record of it.')
              : history.map(function (h) {
                  return React.createElement('div', {
                    key: h.id,
                    style: {
                      display: 'flex', alignItems: 'baseline', gap: '10px',
                      padding: '7px 9px', marginBottom: '4px', borderRadius: '5px',
                      background: '#1b2230', border: '1px solid #2b3850', fontSize: '11.5px'
                    }
                  },
                    React.createElement('span', {
                      style: { width: '92px', flexShrink: 0, color: '#7f8ea6',
                               fontVariantNumeric: 'tabular-nums' }
                    }, h.subsystem || '\u2014'),
                    React.createElement('span', {
                      style: { width: '52px', flexShrink: 0, fontWeight: 700, color: '#9db0c8' }
                    }, h.condition || ''),
                    React.createElement('span', {
                      style: { flex: 1, color: '#c3cfdd', lineHeight: 1.35 }
                    }, h.description || ''),
                    // Who signed for it and when — the whole point of keeping this.
                    React.createElement('span', {
                      style: { flexShrink: 0, color: '#8ff0b5', fontWeight: 700 }
                    }, h.acknowledgedBy || 'operator'),
                    React.createElement('span', {
                      style: { width: '132px', flexShrink: 0, textAlign: 'right',
                               color: '#6f7f97', fontVariantNumeric: 'tabular-nums' }
                    }, h.retiredAt ? new Date(h.retiredAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      }) : '')
                  );
                })
          ) : null,

          // Table scroller — ONE scroller for both axes, so the sticky header
          // scrolls sideways in lockstep with the rows and every row's
          // background spans all columns instead of stopping at the viewport.
          view === 'active' ? React.createElement('div', { className: 'flex-1 overflow-auto' },
            // Column headers
            React.createElement(AlarmTableHeader, {
              sortColumn: sortColumn,
              sortDirection: sortDirection,
              onSort: handleSort
            }),

            // Alarm rows
            React.createElement('div', {
              className: 'alarm-rows',
              role: 'grid',
              'aria-label': 'Alarm list'
            },
              sortedAlarms.length === 0
                ? React.createElement('div', {
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'center',
                             height: '128px', color: '#5d6b83', fontSize: '12.5px', fontWeight: 700 }
                  }, 'No alarms in selected group')
                : sortedAlarms.map(function (alarm, idx) {
                    return React.createElement(AlarmTableRow, {
                      key: alarm.id,
                      alarm: alarm,
                      isSelected: selectedAlarmId === alarm.id,
                      onSelect: handleSelect,
                      onContextMenu: handleContextMenu,
                      index: idx
                    });
                  })
            )
          ) : null,

          // Footer status
          // Footer ack bar — the selected alarm's acknowledge action sits with
          // the row counts, matching the design reference's footer.
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '14px', padding: '9px 14px',
                     background: '#0e1420', borderTop: '1px solid #232c3d', flexShrink: 0 }
          },
            React.createElement('span', {
              style: { fontSize: '11.5px', fontWeight: 700, color: '#8fa0b8' }
            }, selectedAlarm && !selectedAlarm.acknowledged
                 ? ('Selected: ' + (selectedAlarm.condition || 'alarm') + ' \u2014 acknowledge \u2192')
                 : 'Select an alarm above, then acknowledge \u2192'),
            React.createElement(AcknowledgeButton, {
              alarm: selectedAlarm,
              canAck: canAck,
              onAcknowledge: handleAcknowledge
            }),
            React.createElement('div', { style: { flex: 1 } }),
            React.createElement('span', {
              style: { fontSize: '11px', color: '#7f8fa6' }
            }, sortedAlarms.length + ' alarm' + (sortedAlarms.length !== 1 ? 's' : '') + ' displayed'),
            React.createElement('span', {
              style: { fontSize: '11px', color: '#e6a23c', fontWeight: 700 }
            }, 'Filter: ' + (selectedNode === 'all' ? 'All Alarms' : selectedNode))
          )
        )
      ),

      // Context menu (if open)
      contextMenu
        ? React.createElement(ContextMenu, {
            x: contextMenu.x,
            y: contextMenu.y,
            alarm: contextMenu.alarm,
            onAcknowledge: handleAcknowledge,
            onClose: closeContextMenu
          })
        : null
    );
  }

  // ─── Expose as window global ────────────────────────────────────────────────

  window.AlarmSummary = AlarmSummaryComponent;

  // Also expose helper for testing
  window.AlarmSummary._getAlarmIconStyle = getAlarmIconStyle;
  window.AlarmSummary._PRELOADED_ALARMS = PRELOADED_ALARMS;
  window.AlarmSummary._alarmMatchesNode = alarmMatchesNode;
  window.AlarmSummary._compareAlarms = compareAlarms;
})();
