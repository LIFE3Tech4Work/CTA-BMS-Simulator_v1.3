/* RecentEventsTab.jsx — EBI Point Detail Recent Events Tab
 * Displays a chronological event log for a BACnet point sorted newest-first.
 * Events tracked: value changes (COV), mode transitions, alarm state changes.
 *
 * Props: { pointId } — BACnet address of the point
 * Subscribes to window.PointRegistry for live value/mode/alarm changes.
 * Stores events in memory (max 200 entries). Vertical scroll when overflow.
 *
 * No import/export — exposes as window.EBIRecentEventsTab
 */

(function() {
  'use strict';

  const { useState, useEffect, useRef, useCallback } = React;

  const MAX_EVENTS = 200;

  /**
   * Format a Date object to a readable timestamp string.
   */
  function formatTimestamp(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '—';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
  }

  /**
   * Format a value for display. Numbers get 1 decimal place, booleans show On/Off.
   */
  function formatValue(value, units) {
    if (value === undefined || value === null) return '—';
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    if (typeof value === 'number') {
      var formatted = value.toFixed(1);
      return units ? formatted + ' ' + units : formatted;
    }
    return String(value);
  }

  /**
   * Get a badge color for event type.
   */
  function getEventTypeColor(eventType) {
    switch (eventType) {
      case 'Value Change': return 'bg-cyan-900 text-cyan-300';
      case 'Mode Transition': return 'bg-amber-900 text-amber-300';
      case 'Alarm State Change': return 'bg-red-900 text-red-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  }

  /**
   * EBIRecentEventsTab — Recent Events tab content for EBI Point Detail.
   * Tracks and displays state-change events for the selected point.
   */
  function EBIRecentEventsTab({ pointId }) {
    const [events, setEvents] = useState([]);
    const prevStateRef = useRef(null);

    // Reset events when pointId changes
    useEffect(function() {
      setEvents([]);
      prevStateRef.current = null;
    }, [pointId]);

    // Subscribe to point updates and track state changes
    useEffect(function() {
      if (!pointId || !window.PointRegistry) return;

      // Capture initial state so we can detect changes
      var point = window.PointRegistry.points.get(pointId);
      if (point) {
        prevStateRef.current = {
          value: point.currentValue,
          mode: point.mode,
          alarmLifecycle: point.alarmState ? point.alarmState.lifecycle : 'inactive'
        };

        // Seed initial events for non-default states present when the tab mounts
        var seedEvents = [];
        var now = new Date();
        if (window.SimulationEngine && typeof window.SimulationEngine.getCurrentTimestamp === 'function') {
          var simTime = window.SimulationEngine.getCurrentTimestamp();
          if (simTime instanceof Date && !isNaN(simTime.getTime())) {
            now = simTime;
          }
        }

        // If point is currently in Manual, show that transition
        if (point.mode === 'Manual') {
          seedEvents.push({
            id: 'seed_mode_' + Math.random().toString(36).substr(2, 6),
            timestamp: new Date(now.getTime() - 1000), // 1 second ago
            eventType: 'Mode Transition',
            previousValue: 'Auto',
            newValue: 'Manual'
          });
        }

        // If point has an active alarm, show that
        if (point.alarmState && point.alarmState.lifecycle === 'active') {
          seedEvents.push({
            id: 'seed_alarm_' + Math.random().toString(36).substr(2, 6),
            timestamp: new Date(now.getTime() - 500),
            eventType: 'Alarm State Change',
            previousValue: 'inactive',
            newValue: 'active'
          });
        }

        if (seedEvents.length > 0) {
          setEvents(seedEvents);
        }
      }

      function handlePointUpdate(updatedPoint) {
        var prev = prevStateRef.current;
        if (!prev) {
          // First notification — just capture state, no event
          prevStateRef.current = {
            value: updatedPoint.currentValue,
            mode: updatedPoint.mode,
            alarmLifecycle: updatedPoint.alarmState ? updatedPoint.alarmState.lifecycle : 'inactive'
          };
          return;
        }

        var newEvents = [];
        var now = new Date();

        // Try to use simulation clock timestamp if available
        if (window.SimulationEngine && typeof window.SimulationEngine.getCurrentTimestamp === 'function') {
          var simTime = window.SimulationEngine.getCurrentTimestamp();
          if (simTime instanceof Date && !isNaN(simTime.getTime())) {
            now = simTime;
          }
        }

        var units = '';
        var metadata = window.PointRegistry.getMetadata(pointId);
        if (metadata) {
          units = metadata.units || '';
        }

        // Check for value change (COV threshold already handled by PointRegistry)
        if (updatedPoint.currentValue !== prev.value) {
          newEvents.push({
            id: Date.now() + '_val_' + Math.random().toString(36).substr(2, 6),
            timestamp: new Date(now.getTime()),
            eventType: 'Value Change',
            previousValue: formatValue(prev.value, units),
            newValue: formatValue(updatedPoint.currentValue, units)
          });
        }

        // Check for mode transition (Auto <-> Manual)
        if (updatedPoint.mode !== prev.mode) {
          newEvents.push({
            id: Date.now() + '_mode_' + Math.random().toString(36).substr(2, 6),
            timestamp: new Date(now.getTime() + 1), // +1ms to ensure unique ordering
            eventType: 'Mode Transition',
            previousValue: prev.mode,
            newValue: updatedPoint.mode
          });
        }

        // Check for alarm state change
        var currentAlarmLifecycle = updatedPoint.alarmState ? updatedPoint.alarmState.lifecycle : 'inactive';
        if (currentAlarmLifecycle !== prev.alarmLifecycle) {
          newEvents.push({
            id: Date.now() + '_alarm_' + Math.random().toString(36).substr(2, 6),
            timestamp: new Date(now.getTime() + 2), // +2ms to ensure unique ordering
            eventType: 'Alarm State Change',
            previousValue: prev.alarmLifecycle,
            newValue: currentAlarmLifecycle
          });
        }

        // Update previous state
        prevStateRef.current = {
          value: updatedPoint.currentValue,
          mode: updatedPoint.mode,
          alarmLifecycle: currentAlarmLifecycle
        };

        // Append new events (if any), maintaining max 200
        if (newEvents.length > 0) {
          setEvents(function(current) {
            var updated = newEvents.concat(current);
            if (updated.length > MAX_EVENTS) {
              updated = updated.slice(0, MAX_EVENTS);
            }
            return updated;
          });
        }
      }

      window.PointRegistry.subscribe(pointId, handlePointUpdate);

      return function() {
        window.PointRegistry.unsubscribe(pointId, handlePointUpdate);
      };
    }, [pointId]);

    // Empty state
    if (events.length === 0) {
      return React.createElement('div', {
        className: 'flex items-center justify-center h-full bg-gray-900 text-gray-400 p-8'
      },
        React.createElement('div', { className: 'text-center' },
          React.createElement('p', { className: 'text-sm' }, 'No recent events'),
          React.createElement('p', { className: 'text-xs text-gray-500 mt-2' },
            'Events will appear when point values, modes, or alarm states change.'
          )
        )
      );
    }

    // Event log table — sorted newest-first (events already prepended in order)
    return React.createElement('div', {
      className: 'bg-gray-900 h-full flex flex-col'
    },
      // Header
      React.createElement('div', {
        className: 'px-4 py-3 border-b border-gray-700 flex-shrink-0 flex items-center justify-between'
      },
        React.createElement('h3', {
          className: 'text-cyan-400 text-sm font-semibold uppercase tracking-wide'
        }, 'Recent Events'),
        React.createElement('span', {
          className: 'text-gray-500 text-xs'
        }, events.length + ' / ' + MAX_EVENTS + ' entries')
      ),

      // Table header
      React.createElement('div', {
        className: 'flex items-center px-4 py-2 border-b border-gray-600 bg-gray-850 text-gray-400 text-xs uppercase tracking-wider flex-shrink-0'
      },
        React.createElement('span', { className: 'w-44 flex-shrink-0' }, 'Timestamp'),
        React.createElement('span', { className: 'w-36 flex-shrink-0' }, 'Event Type'),
        React.createElement('span', { className: 'flex-1 min-w-0' }, 'Previous'),
        React.createElement('span', { className: 'flex-1 min-w-0' }, 'New')
      ),

      // Scrollable event list
      React.createElement('div', {
        className: 'flex-1 overflow-y-auto'
      },
        events.map(function(event) {
          return React.createElement('div', {
            key: event.id,
            className: 'flex items-center px-4 py-2 border-b border-gray-800 hover:bg-gray-800 transition-colors'
          },
            // Timestamp
            React.createElement('span', {
              className: 'w-44 flex-shrink-0 text-gray-300 text-xs font-mono'
            }, formatTimestamp(event.timestamp)),

            // Event type badge
            React.createElement('span', {
              className: 'w-36 flex-shrink-0'
            },
              React.createElement('span', {
                className: 'inline-block px-2 py-0.5 rounded text-xs font-medium ' + getEventTypeColor(event.eventType)
              }, event.eventType)
            ),

            // Previous value
            React.createElement('span', {
              className: 'flex-1 min-w-0 text-gray-400 text-sm font-mono truncate pr-2'
            }, event.previousValue),

            // New value
            React.createElement('span', {
              className: 'flex-1 min-w-0 text-white text-sm font-mono truncate'
            }, event.newValue)
          );
        })
      )
    );
  }

  // Expose globally — no import/export
  window.EBIRecentEventsTab = EBIRecentEventsTab;

})();
