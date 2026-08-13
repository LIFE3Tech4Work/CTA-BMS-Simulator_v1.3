/* AlarmsTab.jsx — EBI Point Detail Alarms Tab
 * Displays alarm configuration and current alarm state for the selected point.
 *
 * Alarm configuration includes: alarm type, limit threshold, deadband, priority, enable state.
 * Current alarm state uses 9-state classification:
 *   - Lifecycle: active or inactive
 *   - Acknowledgment: acknowledged or unacknowledged
 *   - Combined with priority for distinct 9-state icon
 *
 * Shows "No alarms configured" when point has no alarm config.
 *
 * Props: { pointId } — BACnet address of the point
 * Reads from: window.PointRegistry.getMetadata(pointId)
 *             window.FaultEngine.rules, window.FaultEngine.activeAlarms
 *
 * No import/export — exposes as window.EBIAlarmsTab
 *
 * Validates: Requirements 12.1, 12.2, 12.3
 */

(function () {
  'use strict';

  const { useState, useEffect, useMemo, useRef } = React;

  // ─── Constants ──────────────────────────────────────────────────────────────

  // 9-state alarm icon colors
  const ICON_COLORS = {
    urgent: '#FF0000',   // Red
    high: '#FFBF00',     // Amber
    low: '#3B82F6',      // Blue
    journal: '#9CA3AF'   // Gray — journal alarms are logged, not summary-displayed
  };

  // Alarm types derived from fault rules for analog/binary points.
  // NOTE: F-02 and F-05 were previously mislabeled here — 'Deviation' and
  // 'Rate of Change' are real Honeywell alarm types, but neither actually
  // describes what FaultEngine.js's F-02/F-05 conditions check. Relabeled
  // to match the real logic rather than the aspirational original framing.
  const ALARM_CONFIGS_BY_RULE = {
    'F-01': {
      alarmType: 'PV High',
      description: 'Simultaneous heating and cooling',
      deadband: 5,
      enabled: true
    },
    'F-02': {
      alarmType: 'PV High / PV Low',
      description: 'Supply air temperature outside fixed 52–58°F design band (not a deviation from a live setpoint)',
      deadband: 2,
      enabled: true
    },
    'F-03': {
      alarmType: 'PV High',
      description: 'AHU running during unoccupied hours',
      deadband: 0,
      enabled: true
    },
    'F-04': {
      alarmType: 'PV Low',
      description: 'OA damper fully closed during occupied hours',
      deadband: 2,
      enabled: true
    },
    'F-05': {
      alarmType: 'Composite (multi-point)',
      description: 'Mechanical cooling running while free-cooling conditions are available and OA damper is not fully open — a compound AND across CT status, OAT, and damper position, not a single-point rate-of-change calculation',
      deadband: 5,
      enabled: true
    },
    'F-06': {
      alarmType: 'PV High',
      description: 'CO2 exceeds ventilation threshold (>1,100 ppm)',
      deadband: 50,
      enabled: true
    }
  };

  // Threshold values from fault rule conditions
  const ALARM_THRESHOLDS = {
    'F-01': 20,                  // PHT/CHW > 20%
    'F-02': '52–58°F (band)',    // outside fixed band, not setpoint-relative
    'F-03': 1,                   // Fan running (binary)
    'F-04': 5,                   // OA damper < 5%
    'F-05': 80,                  // OA damper < 80% (was incorrectly listed as 50)
    'F-06': 1100                 // CO2 > 1,100 ppm (ASHRAE 62.1 upper guideline)
  };

  // ─── 9-State Alarm Icon Component ──────────────────────────────────────────

  /**
   * Renders a 9-state alarm icon based on priority + lifecycle + acknowledgment.
   *
   * Priority (urgent, high, low) × State (active-unack, active-ack, inactive-unack) = 9 icons
   *
   * Active + Unacknowledged: filled + flashing
   * Active + Acknowledged: filled solid
   * Inactive + Unacknowledged: outline only
   */
  function AlarmStateIcon({ priority, lifecycle, acknowledged }) {
    var color = ICON_COLORS[priority] || ICON_COLORS.low;
    var isActive = lifecycle === 'active';
    var isAcked = acknowledged;

    // Determine icon state
    var iconState;
    if (isActive && !isAcked) {
      iconState = 'active-unacknowledged'; // flashing filled
    } else if (isActive && isAcked) {
      iconState = 'active-acknowledged';   // solid filled
    } else {
      iconState = 'inactive-unacknowledged'; // outline
    }

    var size = 20;
    var cx = size / 2;
    var cy = size / 2;
    var radius = 7;

    var stateLabel = priority + ' / ' + lifecycle + ' / ' + (isAcked ? 'ack' : 'unack');

    // Flashing animation for active-unacknowledged
    var animateElement = null;
    if (iconState === 'active-unacknowledged') {
      animateElement = React.createElement('animate', {
        attributeName: 'opacity',
        values: '1;0.3;1',
        dur: '1s',
        repeatCount: 'indefinite'
      });
    }

    var circleProps;
    if (iconState === 'active-unacknowledged' || iconState === 'active-acknowledged') {
      // Filled circle
      circleProps = {
        cx: cx,
        cy: cy,
        r: radius,
        fill: color,
        stroke: color,
        strokeWidth: 1.5
      };
    } else {
      // Outline only (inactive-unacknowledged)
      circleProps = {
        cx: cx,
        cy: cy,
        r: radius,
        fill: 'none',
        stroke: color,
        strokeWidth: 2
      };
    }

    return React.createElement('div', {
      className: 'flex items-center gap-2',
      title: stateLabel
    },
      React.createElement('svg', {
        width: size,
        height: size,
        'aria-label': 'Alarm state: ' + stateLabel
      },
        React.createElement('circle', circleProps, animateElement)
      ),
      React.createElement('span', {
        className: 'text-xs text-gray-400 capitalize'
      }, iconState.replace(/-/g, ' '))
    );
  }

  // ─── Alarm Config Row ──────────────────────────────────────────────────────

  function ConfigField({ label, value }) {
    return React.createElement('div', {
      className: 'flex items-center py-2 px-4 border-b border-gray-700'
    },
      React.createElement('span', {
        className: 'text-gray-400 text-sm w-40 flex-shrink-0'
      }, label),
      React.createElement('span', {
        className: 'text-white text-sm font-mono bg-gray-800 px-3 py-1 rounded border border-gray-600 flex-1'
      }, value !== undefined && value !== null ? String(value) : '—')
    );
  }

  // ─── Alarm Config Section ──────────────────────────────────────────────────

  function AlarmConfigSection({ config, rule }) {
    return React.createElement('div', {
      className: 'mb-4 border border-gray-700 rounded'
    },
      // Section header
      React.createElement('div', {
        className: 'px-4 py-2 bg-gray-800 border-b border-gray-700'
      },
        React.createElement('span', {
          className: 'text-sm text-cyan-400 font-semibold'
        }, rule.id + ': ' + rule.description)
      ),
      // Config fields
      React.createElement(ConfigField, {
        label: 'Alarm Type',
        value: config.alarmType
      }),
      React.createElement(ConfigField, {
        label: 'Limit Threshold',
        value: ALARM_THRESHOLDS[rule.id]
      }),
      React.createElement(ConfigField, {
        label: 'Deadband',
        value: config.deadband
      }),
      React.createElement(ConfigField, {
        label: 'Priority',
        value: rule.priority.charAt(0).toUpperCase() + rule.priority.slice(1)
      }),
      React.createElement(ConfigField, {
        label: 'Enable State',
        value: config.enabled ? 'Enabled' : 'Disabled'
      })
    );
  }

  // ─── Current Alarm State Section ───────────────────────────────────────────

  function CurrentAlarmState({ alarm, rule }) {
    if (!alarm) {
      return React.createElement('div', {
        className: 'flex items-center gap-2 px-4 py-2 text-sm text-gray-500'
      },
        React.createElement('span', null, 'No active alarm for this rule')
      );
    }

    return React.createElement('div', {
      className: 'px-4 py-3 bg-gray-800 rounded border border-gray-600 mb-2'
    },
      React.createElement('div', {
        className: 'flex items-center justify-between mb-2'
      },
        React.createElement('span', {
          className: 'text-sm text-gray-300'
        }, 'Current State'),
        React.createElement(AlarmStateIcon, {
          priority: alarm.priority || rule.priority,
          lifecycle: alarm.lifecycle,
          acknowledged: alarm.acknowledged
        })
      ),
      React.createElement('div', {
        className: 'grid grid-cols-2 gap-2 text-xs'
      },
        React.createElement('div', { className: 'text-gray-400' }, 'Lifecycle:'),
        React.createElement('div', {
          className: alarm.lifecycle === 'active' ? 'text-red-400 font-semibold' : 'text-green-400'
        }, alarm.lifecycle),
        React.createElement('div', { className: 'text-gray-400' }, 'Acknowledgment:'),
        React.createElement('div', {
          className: alarm.acknowledged ? 'text-green-400' : 'text-yellow-400 font-semibold'
        }, alarm.acknowledged ? 'Acknowledged' : 'Unacknowledged'),
        React.createElement('div', { className: 'text-gray-400' }, 'Triggered:'),
        React.createElement('div', { className: 'text-gray-300' },
          alarm.timestamp ? new Date(alarm.timestamp).toLocaleString() : '—'
        )
      )
    );
  }

  // ─── Main AlarmsTab Component ──────────────────────────────────────────────

  function EBIAlarmsTab({ pointId }) {
    const [refreshKey, setRefreshKey] = useState(0);
    const mountedRef = useRef(true);

    // Refresh periodically to catch alarm state changes
    useEffect(function () {
      mountedRef.current = true;
      var interval = setInterval(function () {
        if (mountedRef.current) {
          setRefreshKey(function (k) { return k + 1; });
        }
      }, 2000);

      return function () {
        mountedRef.current = false;
        clearInterval(interval);
      };
    }, []);

    // Get point metadata
    var metadata = useMemo(function () {
      if (!pointId || !window.PointRegistry) return null;
      return window.PointRegistry.getMetadata(pointId);
    }, [pointId]);

    // Determine which fault rules apply to this point
    var applicableRules = useMemo(function () {
      if (!pointId || !window.FaultEngine) return [];

      var rules = window.FaultEngine.rules || [];
      var matching = [];

      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        // A rule applies to this point if it's the source point
        // or if the rule's condition references this point's address
        if (rule.sourcePoint === pointId) {
          matching.push(rule);
        }
      }

      return matching;
    }, [pointId]);

    // Get current alarm state for applicable rules
    var alarmStates = useMemo(function () {
      if (!window.FaultEngine) return {};

      var states = {};
      var allAlarms = window.FaultEngine.getAllAlarms ? window.FaultEngine.getAllAlarms() : [];

      for (var i = 0; i < allAlarms.length; i++) {
        var alarm = allAlarms[i];
        if (alarm.source === pointId) {
          states[alarm.condition] = alarm;
        }
      }

      return states;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pointId, refreshKey]);

    // Also check the point's own alarmState from PointRegistry
    var pointAlarmState = useMemo(function () {
      if (!pointId || !window.PointRegistry) return null;
      var point = window.PointRegistry.points.get(pointId);
      if (!point) return null;
      return point.alarmState || null;
    }, [pointId, refreshKey]);

    // No point found
    if (!metadata) {
      return React.createElement('div', {
        className: 'flex items-center justify-center h-full bg-gray-900 text-gray-400 p-8'
      },
        React.createElement('p', { className: 'text-sm' },
          pointId ? 'Point not found: ' + pointId : 'No point selected'
        )
      );
    }

    // No alarms configured for this point
    if (applicableRules.length === 0) {
      return React.createElement('div', {
        className: 'bg-gray-900 h-full flex flex-col'
      },
        // Header
        React.createElement('div', {
          className: 'px-4 py-3 border-b border-gray-700'
        },
          React.createElement('h3', {
            className: 'text-cyan-400 text-sm font-semibold uppercase tracking-wide'
          }, 'Alarm Configuration')
        ),
        // No alarms message
        React.createElement('div', {
          className: 'flex-1 flex items-center justify-center'
        },
          React.createElement('div', {
            className: 'text-center text-gray-500 p-8'
          },
            React.createElement('svg', {
              className: 'mx-auto mb-3',
              width: 48,
              height: 48,
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.5
            },
              React.createElement('path', {
                d: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V4a1 1 0 10-2 0v1.083A6 6 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'
              })
            ),
            React.createElement('p', {
              className: 'text-sm'
            }, 'No alarms configured for this point')
          )
        )
      );
    }

    // Render alarm configuration and state
    return React.createElement('div', {
      className: 'bg-gray-900 h-full overflow-y-auto'
    },
      // Section: Alarm Configuration
      React.createElement('div', {
        className: 'px-4 py-3 border-b border-gray-700'
      },
        React.createElement('h3', {
          className: 'text-cyan-400 text-sm font-semibold uppercase tracking-wide'
        }, 'Alarm Configuration')
      ),
      React.createElement('div', { className: 'p-4' },
        applicableRules.map(function (rule) {
          var config = ALARM_CONFIGS_BY_RULE[rule.id] || {
            alarmType: 'Unknown',
            deadband: 0,
            enabled: true
          };

          return React.createElement(AlarmConfigSection, {
            key: rule.id,
            config: config,
            rule: rule
          });
        })
      ),

      // Section: Current Alarm State
      React.createElement('div', {
        className: 'px-4 py-3 border-b border-gray-700 border-t'
      },
        React.createElement('h3', {
          className: 'text-cyan-400 text-sm font-semibold uppercase tracking-wide'
        }, 'Current Alarm State')
      ),
      React.createElement('div', { className: 'p-4' },
        // Show point-level alarm state with 9-state icon
        pointAlarmState && pointAlarmState.lifecycle === 'active'
          ? React.createElement('div', {
              className: 'mb-4 px-4 py-3 bg-gray-800 rounded border border-red-900'
            },
              React.createElement('div', {
                className: 'flex items-center gap-3'
              },
                React.createElement(AlarmStateIcon, {
                  priority: 'high', // Default to high for point-level alarm
                  lifecycle: pointAlarmState.lifecycle,
                  acknowledged: pointAlarmState.acknowledged
                }),
                React.createElement('span', {
                  className: 'text-sm text-red-300 font-semibold'
                }, 'Point has active alarm')
              )
            )
          : null,

        // Per-rule alarm states
        applicableRules.map(function (rule) {
          var alarm = alarmStates[rule.id] || null;

          return React.createElement('div', {
            key: rule.id,
            className: 'mb-3'
          },
            React.createElement('div', {
              className: 'text-xs text-gray-500 mb-1 px-4'
            }, rule.id + ' — ' + rule.description),
            React.createElement(CurrentAlarmState, {
              alarm: alarm,
              rule: rule
            })
          );
        })
      )
    );
  }

  // Expose globally — no import/export
  window.EBIAlarmsTab = EBIAlarmsTab;

})();
