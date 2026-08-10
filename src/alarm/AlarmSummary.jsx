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
      className: 'w-56 bg-gray-900 border-r border-gray-700 p-2 flex flex-col gap-1 overflow-y-auto',
      role: 'tree',
      'aria-label': 'Alarm location filter'
    },
      TREE_NODES.map(function (node) {
        var isSelected = selectedNode === node.id;
        var count = alarmCounts[node.id] || 0;
        var indent = node.parent === 'all' ? 'pl-4' : 'pl-2';

        return React.createElement('button', {
          key: node.id,
          className: [
            indent,
            'flex items-center justify-between px-2 py-1.5 rounded text-sm text-left w-full',
            isSelected
              ? 'bg-blue-800 text-white'
              : 'text-gray-300 hover:bg-gray-800 hover:text-white'
          ].join(' '),
          onClick: function () { onSelectNode(node.id); },
          role: 'treeitem',
          'aria-selected': isSelected
        },
          React.createElement('span', null, node.label),
          React.createElement('span', {
            className: 'text-xs px-1.5 py-0.5 rounded ' +
              (isSelected ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400')
          }, count)
        );
      })
    );
  }

  // ─── Column Definitions ───────────────────────────────────────────────────────

  var COLUMNS = [
    { key: 'icon', label: '', sortable: false, width: 'w-10' },
    { key: 'timestamp', label: 'Date/Time', sortable: true, width: 'w-40' },
    { key: 'source', label: 'Source', sortable: true, width: 'w-36' },
    { key: 'condition', label: 'Condition', sortable: true, width: 'w-24' },
    { key: 'operator', label: 'Operator', sortable: true, width: 'w-28' },
    { key: 'action', label: 'Action', sortable: true, width: 'w-28' },
    { key: 'priority', label: 'Priority', sortable: true, width: 'w-24' },
    { key: 'description', label: 'Description', sortable: true, width: 'flex-1' },
    { key: 'value', label: 'Value', sortable: true, width: 'w-20' }
  ];

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
      className: 'flex items-stretch bg-gray-800 border-b border-gray-600 select-none',
      role: 'row'
    },
      COLUMNS.map(function (col) {
        var isSorted = sortColumn === col.key;
        var sortIndicator = '';
        if (isSorted) {
          sortIndicator = sortDirection === 'asc' ? ' ▲' : ' ▼';
        }

        return React.createElement('div', {
          key: col.key,
          className: [
            col.width,
            'px-2 py-1.5 text-xs font-semibold text-gray-300 truncate',
            col.sortable ? 'cursor-pointer hover:bg-gray-700 hover:text-white' : ''
          ].join(' '),
          role: 'columnheader',
          'aria-sort': isSorted ? sortDirection + 'ending' : 'none',
          onClick: col.sortable ? function () { onSort(col.key); } : undefined
        }, col.label + sortIndicator);
      })
    );
  }

  // ─── Alarm Table Row ──────────────────────────────────────────────────────────

  function AlarmTableRow({ alarm, isSelected, onSelect, onContextMenu }) {
    var rowClass = [
      'flex items-center border-b border-gray-800 text-xs',
      isSelected ? 'bg-blue-900 text-white' : 'text-gray-300 hover:bg-gray-800'
    ].join(' ');

    return React.createElement('div', {
      className: rowClass,
      role: 'row',
      'aria-selected': isSelected,
      onClick: function () { onSelect(alarm.id); },
      onContextMenu: function (e) { onContextMenu(e, alarm); }
    },
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
        className: 'w-36 px-2 py-1.5 truncate font-mono text-blue-300 hover:text-blue-100 hover:underline cursor-pointer',
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
      // Action
      React.createElement('div', { className: 'w-28 px-2 py-1.5 truncate' },
        alarm.action || '—'
      ),
      // Priority
      React.createElement('div', { className: 'w-24 px-2 py-1.5 truncate capitalize' },
        alarm.priority || '—'
      ),
      // Description
      React.createElement('div', { className: 'flex-1 px-2 py-1.5 truncate' },
        alarm.description || '—'
      ),
      // Value
      React.createElement('div', { className: 'w-20 px-2 py-1.5 truncate text-right' },
        alarm.value !== undefined && alarm.value !== null ? String(alarm.value) : '—'
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

    var canAck = alarm && alarm.lifecycle === 'active' && !alarm.acknowledged;

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

  function AcknowledgeButton({ selectedAlarm, canAck, onAcknowledge }) {
    var disabled = !selectedAlarm || !canAck || selectedAlarm.acknowledged || selectedAlarm.lifecycle !== 'active';

    return React.createElement('div', { className: 'flex flex-col items-end' },
      React.createElement('button', {
        className: [
          'px-3 py-1 text-xs rounded border',
          disabled
            ? 'border-gray-600 text-gray-500 cursor-not-allowed'
            : 'border-blue-500 text-blue-300 hover:bg-blue-800 hover:text-white'
        ].join(' '),
        disabled: disabled,
        onClick: function () {
          if (!disabled && selectedAlarm) {
            onAcknowledge(selectedAlarm);
          }
        },
        title: disabled
          ? 'Select an active unacknowledged alarm (requires AckOnly+ security)'
          : 'Acknowledge selected alarm — this marks it as seen but does NOT resolve the underlying fault'
      }, '✓ Acknowledge'),
      React.createElement('span', { className: 'text-[9px] text-amber-400 mt-0.5' },
        'Acknowledged ≠ fixed'
      )
    );
  }

  // ─── Main AlarmSummary Component ──────────────────────────────────────────────

  function AlarmSummaryComponent() {
    var auth = useContext(window.AuthContext);

    // Alarm data state
    var [alarms, setAlarms] = useState(PRELOADED_ALARMS);

    // Selection state
    var [selectedAlarmId, setSelectedAlarmId] = useState(null);
    var [selectedNode, setSelectedNode] = useState('all');

    // Sort state (Property 14)
    var [sortColumn, setSortColumn] = useState('timestamp');
    var [sortDirection, setSortDirection] = useState('desc');

    // Context menu state
    var [contextMenu, setContextMenu] = useState(null);

    // Refresh alarms from FaultEngine periodically
    useEffect(function () {
      function refreshAlarms() {
        if (window.FaultEngine && typeof window.FaultEngine.getAllAlarms === 'function') {
          var engineAlarms = window.FaultEngine.getAllAlarms();

          // AHU-4-4 alarms come from a separate engine (its own
          // formula-driven state isn't part of PointRegistry) — merge them
          // in here so one Alarm Summary screen covers both. Each alarm
          // already carries an explicit `subsystem` field, so no source-
          // address parsing is needed for these.
          if (window.AHU44NewFaultEngine && typeof window.AHU44NewFaultEngine.getAllAlarms === 'function') {
            engineAlarms = engineAlarms.concat(window.AHU44NewFaultEngine.getAllAlarms());
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
            // Per the SymmetrE Operator Manual's alarm-icon legend, only 3
            // lifecycle×ack combinations are ever shown: active+unack,
            // inactive+unack, and active+ack. There is no inactive+ack icon —
            // once an alarm both clears AND is acknowledged, real Station
            // drops it from the Alarm Summary (it remains in Event history,
            // which this simulator doesn't separately model). The engines
            // keep full history via getAllAlarms() for Property 21 testing;
            // this filter only governs what the visible Summary displays.
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

      // Update local alarm state
      setAlarms(function (prev) {
        return prev.map(function (a) {
          if (a.id === alarm.id && a.lifecycle === 'active' && !a.acknowledged) {
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
      // AHU-4-4 and the two VAV zones each live in their own engine,
      // separate from everything else.
      if (alarm.subsystem === 'AHU-4-4') {
        if (window.AHU44NewFaultEngine && typeof window.AHU44NewFaultEngine.acknowledge === 'function') {
          window.AHU44NewFaultEngine.acknowledge(alarm.condition, auth.operator || 'operator');
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

    // ─── Render ───────────────────────────────────────────────────────────────
    return React.createElement('div', {
      className: 'flex flex-col h-screen bg-gray-900 text-white'
    },
      // Title bar
      React.createElement('div', {
        className: 'flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700'
      },
        React.createElement('h1', { className: 'text-sm font-semibold text-gray-200' },
          '⚠ Alarm Summary'
        ),
        React.createElement('div', { className: 'flex items-center gap-3' },
          React.createElement(AcknowledgeButton, {
            selectedAlarm: selectedAlarm,
            canAck: canAck,
            onAcknowledge: handleAcknowledge
          }),
          React.createElement('button', {
            className: 'px-3 py-1 text-xs rounded border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white',
            onClick: function () { window.location.hash = '#/symmetre'; },
            title: 'Return to SymmetrE Station'
          }, '← Back')
        )
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
          // Column headers
          React.createElement(AlarmTableHeader, {
            sortColumn: sortColumn,
            sortDirection: sortDirection,
            onSort: handleSort
          }),

          // Alarm rows
          React.createElement('div', {
            className: 'flex-1 overflow-y-auto',
            role: 'grid',
            'aria-label': 'Alarm list'
          },
            sortedAlarms.length === 0
              ? React.createElement('div', {
                  className: 'flex items-center justify-center h-32 text-gray-500 text-sm'
                }, 'No alarms in selected group')
              : sortedAlarms.map(function (alarm) {
                  return React.createElement(AlarmTableRow, {
                    key: alarm.id,
                    alarm: alarm,
                    isSelected: selectedAlarmId === alarm.id,
                    onSelect: handleSelect,
                    onContextMenu: handleContextMenu
                  });
                })
          ),

          // Footer status
          React.createElement('div', {
            className: 'flex items-center justify-between px-3 py-1.5 bg-gray-800 border-t border-gray-700 text-xs text-gray-400'
          },
            React.createElement('span', null,
              sortedAlarms.length + ' alarm' + (sortedAlarms.length !== 1 ? 's' : '') + ' displayed'
            ),
            React.createElement('span', null,
              'Filter: ' + (selectedNode === 'all' ? 'All Alarms' : selectedNode)
            )
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
