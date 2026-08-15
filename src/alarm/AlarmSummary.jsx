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
    } else if (lifecycle === 'inactive' && acknowledged) {
      // Inactive + Acknowledged → outline with a muted centre. v1.3 had no icon
      // for this because such alarms were filtered off the Summary; they now
      // stay on the list, so they need to read differently from a cleared alarm
      // still awaiting acknowledgment.
      return { background: colors.fill, border: '2px solid ' + colors.outline,
               flashing: false, opacity: 0.45 };
    } else {
      // Inactive + Unacknowledged → outline only
      return { background: 'transparent', border: '2px solid ' + colors.outline, flashing: false };
    }
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
      id: 'preload-F03-1',
      timestamp: new Date('2026-05-18T02:00:00'),
      source: 'BI601@DEV4004',
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

  var TREE_NODES = [
    { id: 'all', label: 'All Alarms', parent: null },
    { id: 'AHU-4-4', label: 'AHU-4-4', parent: 'all' },
    { id: 'AHU-4-6', label: 'AHU-4-6', parent: 'all' },
    { id: 'VAV-4-4-02', label: 'VAV-4-4-02 (Ballroom)', parent: 'all' },
    { id: 'Outdoor', label: 'Outdoor', parent: 'all' }
  ];

  // Map source BACnet addresses to subsystems
  function getSubsystemForSource(source) {
    if (!source) return 'all';
    if (source.indexOf('DEV4004') !== -1) return 'AHU-4-4';
    if (source.indexOf('DEV4006') !== -1) return 'AHU-4-6';
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
    { key: 'timestamp', label: 'Date/Time', sortable: true, width: 'w-40' },
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

    switch (sortColumn) {
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
        valA = typeof a.value === 'number' ? a.value : 0;
        valB = typeof b.value === 'number' ? b.value : 0;
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
        style: { padding: '6px ' + CELL_PAD_X + 'px', color: acked ? '#6ee7a8' : '#e6a23c',
                 fontWeight: 700 },
        title: alarm.action || 'Awaiting acknowledgment'
      }, alarm.action || 'Awaiting'),
      // Icon column
      React.createElement('div', { className: 'w-10 px-2 py-1.5 flex items-center justify-center' },
        React.createElement(AlarmIcon, {
          priority: alarm.priority,
          lifecycle: alarm.lifecycle,
          acknowledged: alarm.acknowledged
        })
      ),
      // Date/Time
      React.createElement('div', { className: 'w-40 px-2 py-1.5 truncate' },
        formatTimestamp(alarm.timestamp)
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
      // Description — fixed width + truncate, same as every other column, so the
      // row's intrinsic width matches the header's exactly when scrolled.
      React.createElement('div', {
        className: 'w-96 px-2 py-1.5 truncate'
      }, alarm.description || '—'),
      // Value
      React.createElement('div', {
        className: 'w-20 truncate text-right',
        style: { padding: '6px ' + CELL_PAD_X + 'px', fontVariantNumeric: 'tabular-nums' }
      }, alarm.value !== undefined && alarm.value !== null ? String(alarm.value) : '—')
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
    var [sortColumn, setSortColumn] = useState('timestamp');
    var [sortDirection, setSortDirection] = useState('desc');

    // Context menu state
    var [contextMenu, setContextMenu] = useState(null);

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
            // Build a map of current acknowledged/operator/action states to preserve them
            var ackMap = {};
            currentAlarms.forEach(function (a) {
              if (a.acknowledged) {
                ackMap[a.id] = { acknowledged: a.acknowledged, operator: a.operator, action: a.action };
              }
            });

            // Start from preloaded as base
            var existingIds = new Set(PRELOADED_ALARMS.map(function (a) { return a.id; }));
            var merged = PRELOADED_ALARMS.map(function (a) {
              // Preserve acknowledged state from current alarms
              if (ackMap[a.id]) {
                return Object.assign({}, a, ackMap[a.id]);
              }
              return Object.assign({}, a);
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
            // Acknowledging is the operator recording "I have seen this" — it is
            // not a claim the condition is fixed, so an acknowledged alarm stays
            // on the Summary and reads Acknowledged rather than disappearing.
            // (Real Station retires a cleared+acknowledged alarm to Event
            // history; here the row is the teaching artifact, so it remains.)
            // The engines keep full history via getAllAlarms() regardless.
            return merged.filter(function (a) {
              if (a.priority === 'journal') return false;
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
          // Table scroller — ONE scroller for both axes, so the sticky header
          // scrolls sideways in lockstep with the rows and every row's
          // background spans all columns instead of stopping at the viewport.
          React.createElement('div', { className: 'flex-1 overflow-auto' },
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
          ),

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
