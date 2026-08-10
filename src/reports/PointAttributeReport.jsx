/* PointAttributeReport.jsx — Point Attribute Report screen ("Find Manual Overrides")
 * No import/export — exposes window.PointAttributeReport
 * Reads from: window.PointRegistry.getAll() to get all points
 * Route: #/reports
 *
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4
 * Property 16: OR-Logic Filtering — results show points matching at least ONE selected criterion
 */

(function () {
  'use strict';

  const { useState, useCallback, useMemo } = React;

  // ─── Filter Definitions ───────────────────────────────────────────────────────

  var FILTERS = [
    { id: 'inManual', label: 'In Manual', test: function (point) { return point.mode === 'Manual'; } },
    { id: 'outOfService', label: 'Out of service', test: function (point) { return point.outOfService === true; } },
    { id: 'alarmSuppressed', label: 'Alarm suppressed', test: function (point) { return point.alarmSuppressed === true; } }
  ];

  // ─── Get matching abnormal states for a point ─────────────────────────────────

  function getMatchingStates(point, selectedFilters) {
    var states = [];
    for (var i = 0; i < FILTERS.length; i++) {
      var filter = FILTERS[i];
      if (selectedFilters[filter.id] && filter.test(point)) {
        states.push(filter.label);
      }
    }
    return states;
  }

  // ─── Format current value for display ─────────────────────────────────────────

  function formatValue(point) {
    if (point.currentValue === undefined || point.currentValue === null) {
      return '—';
    }
    if (typeof point.currentValue === 'boolean') {
      return point.currentValue ? 'Active' : 'Inactive';
    }
    if (typeof point.currentValue === 'number') {
      // Binary points show Active/Inactive
      if (point.type === 'BI' || point.type === 'BO') {
        return point.currentValue >= 0.5 ? 'Active' : 'Inactive';
      }
      // Analog points show value with units
      return point.currentValue.toFixed(1) + (point.units ? ' ' + point.units : '');
    }
    return String(point.currentValue);
  }

  // ─── Table Header Component ───────────────────────────────────────────────────

  function TableHeader() {
    return React.createElement('div', {
      className: 'flex items-stretch bg-gray-800 border-b border-gray-600 select-none',
      role: 'row'
    },
      React.createElement('div', { className: 'w-56 px-3 py-2 text-xs font-semibold text-gray-300', role: 'columnheader' }, 'Point Name'),
      React.createElement('div', { className: 'w-40 px-3 py-2 text-xs font-semibold text-gray-300', role: 'columnheader' }, 'BACnet Address'),
      React.createElement('div', { className: 'w-24 px-3 py-2 text-xs font-semibold text-gray-300', role: 'columnheader' }, 'Point Type'),
      React.createElement('div', { className: 'w-36 px-3 py-2 text-xs font-semibold text-gray-300', role: 'columnheader' }, 'Current Value'),
      React.createElement('div', { className: 'flex-1 px-3 py-2 text-xs font-semibold text-gray-300', role: 'columnheader' }, 'Abnormal State')
    );
  }

  // ─── Table Row Component ──────────────────────────────────────────────────────

  function TableRow({ point, matchingStates }) {
    return React.createElement('div', {
      className: 'flex items-center border-b border-gray-800 text-xs text-gray-300 hover:bg-gray-800',
      role: 'row'
    },
      React.createElement('div', { className: 'w-56 px-3 py-2 truncate', title: point.name }, point.name),
      React.createElement('div', { className: 'w-40 px-3 py-2 truncate font-mono text-cyan-400' }, point.address),
      React.createElement('div', { className: 'w-24 px-3 py-2' },
        React.createElement('span', {
          className: 'px-1.5 py-0.5 rounded text-xs font-bold ' + getTypeBadgeClass(point.type)
        }, point.type)
      ),
      React.createElement('div', { className: 'w-36 px-3 py-2 truncate' }, formatValue(point)),
      React.createElement('div', { className: 'flex-1 px-3 py-2' },
        matchingStates.map(function (state, idx) {
          return React.createElement('span', {
            key: state,
            className: 'inline-block px-2 py-0.5 mr-1 rounded text-xs font-medium ' + getStateBadgeClass(state)
          }, state);
        })
      )
    );
  }

  // ─── Badge styling helpers ────────────────────────────────────────────────────

  function getTypeBadgeClass(type) {
    switch (type) {
      case 'AI': return 'bg-blue-900 text-blue-300';
      case 'AO': return 'bg-green-900 text-green-300';
      case 'BI': return 'bg-purple-900 text-purple-300';
      case 'BO': return 'bg-orange-900 text-orange-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  }

  function getStateBadgeClass(state) {
    switch (state) {
      case 'In Manual': return 'bg-amber-900 text-amber-300';
      case 'Out of service': return 'bg-gray-700 text-gray-300';
      case 'Alarm suppressed': return 'bg-red-900 text-red-300';
      default: return 'bg-gray-700 text-gray-300';
    }
  }

  // ─── Main PointAttributeReport Component ──────────────────────────────────────

  function PointAttributeReportComponent() {
    // Filter checkbox state
    var [selectedFilters, setSelectedFilters] = useState({
      inManual: false,
      outOfService: false,
      alarmSuppressed: false
    });

    // Whether the user has executed the report at least once
    var [reportExecuted, setReportExecuted] = useState(false);

    // Toggle a filter checkbox
    var handleFilterToggle = useCallback(function (filterId) {
      setSelectedFilters(function (prev) {
        var next = Object.assign({}, prev);
        next[filterId] = !prev[filterId];
        return next;
      });
    }, []);

    // Check if any filter is selected
    var anyFilterSelected = selectedFilters.inManual || selectedFilters.outOfService || selectedFilters.alarmSuppressed;

    // Compute results using OR-logic (Property 16)
    var results = useMemo(function () {
      if (!anyFilterSelected) return [];

      var allPoints = [];
      if (window.PointRegistry && typeof window.PointRegistry.getAll === 'function') {
        allPoints = window.PointRegistry.getAll();
      }

      // Filter: point matches if at least ONE selected criterion is true (OR logic)
      return allPoints.filter(function (point) {
        for (var i = 0; i < FILTERS.length; i++) {
          var filter = FILTERS[i];
          if (selectedFilters[filter.id] && filter.test(point)) {
            return true;
          }
        }
        return false;
      }).map(function (point) {
        return {
          point: point,
          matchingStates: getMatchingStates(point, selectedFilters)
        };
      });
    }, [selectedFilters, anyFilterSelected]);

    // Execute report handler
    var handleExecute = useCallback(function () {
      setReportExecuted(true);
    }, []);

    // ─── Render ───────────────────────────────────────────────────────────────

    return React.createElement('div', {
      className: 'flex flex-col h-screen bg-gray-900 text-white'
    },
      // Title bar
      React.createElement('div', {
        className: 'flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700'
      },
        React.createElement('h1', { className: 'text-sm font-semibold text-gray-200' },
          '🔍 Find Manual Overrides — Point Attribute Report'
        ),
        React.createElement('button', {
          className: 'px-3 py-1 text-xs rounded border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white',
          onClick: function () { window.location.hash = '#/symmetre'; },
          title: 'Return to SymmetrE Station'
        }, '← Back')
      ),

      // Filter panel
      React.createElement('div', {
        className: 'px-4 py-3 bg-gray-850 border-b border-gray-700',
        style: { backgroundColor: '#1a1a2e' }
      },
        React.createElement('div', { className: 'flex items-center gap-6 flex-wrap' },
          // Filter label
          React.createElement('span', { className: 'text-xs font-semibold text-gray-400 uppercase tracking-wider' },
            'Filter Criteria:'
          ),

          // Filter checkboxes
          FILTERS.map(function (filter) {
            return React.createElement('label', {
              key: filter.id,
              className: 'flex items-center gap-2 cursor-pointer select-none'
            },
              React.createElement('input', {
                type: 'checkbox',
                checked: selectedFilters[filter.id],
                onChange: function () { handleFilterToggle(filter.id); },
                className: 'w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0'
              }),
              React.createElement('span', { className: 'text-sm text-gray-300' }, filter.label)
            );
          }),

          // Execute button
          React.createElement('button', {
            className: 'ml-4 px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 transition-colors',
            onClick: handleExecute
          }, 'Run Report')
        )
      ),

      // Results area
      React.createElement('div', { className: 'flex-1 flex flex-col overflow-hidden' },
        // Show error if no filters selected and report executed
        reportExecuted && !anyFilterSelected
          ? React.createElement('div', {
              className: 'flex items-center justify-center h-32'
            },
              React.createElement('div', {
                className: 'px-4 py-3 rounded bg-amber-900/50 border border-amber-700 text-amber-300 text-sm',
                role: 'alert'
              }, '⚠ Please select at least one filter criterion before running the report.')
            )
          : reportExecuted && anyFilterSelected && results.length === 0
            ? // No matching points message
              React.createElement('div', {
                className: 'flex items-center justify-center h-32'
              },
                React.createElement('div', {
                  className: 'px-4 py-3 rounded bg-gray-800 border border-gray-700 text-gray-400 text-sm'
                }, 'No matching points found for the selected criteria.')
              )
            : reportExecuted && anyFilterSelected && results.length > 0
              ? // Results table
                React.createElement('div', { className: 'flex flex-col flex-1 overflow-hidden' },
                  // Table header
                  React.createElement(TableHeader, null),
                  // Table body
                  React.createElement('div', {
                    className: 'flex-1 overflow-y-auto',
                    role: 'grid',
                    'aria-label': 'Point attribute report results'
                  },
                    results.map(function (result) {
                      return React.createElement(TableRow, {
                        key: result.point.address,
                        point: result.point,
                        matchingStates: result.matchingStates
                      });
                    })
                  ),
                  // Footer
                  React.createElement('div', {
                    className: 'flex items-center justify-between px-3 py-1.5 bg-gray-800 border-t border-gray-700 text-xs text-gray-400'
                  },
                    React.createElement('span', null,
                      results.length + ' point' + (results.length !== 1 ? 's' : '') + ' found'
                    ),
                    React.createElement('span', null,
                      'Filters: ' + FILTERS.filter(function (f) { return selectedFilters[f.id]; }).map(function (f) { return f.label; }).join(', ')
                    )
                  )
                )
              : // Initial state — no report run yet
                React.createElement('div', {
                  className: 'flex items-center justify-center h-32'
                },
                  React.createElement('div', {
                    className: 'text-gray-500 text-sm'
                  }, 'Select filter criteria and click "Run Report" to search for points in abnormal states.')
                )
      )
    );
  }

  // ─── Expose as window global ────────────────────────────────────────────────

  window.PointAttributeReport = PointAttributeReportComponent;

  // Expose helpers for testing (Property 16 verification)
  window.PointAttributeReport._FILTERS = FILTERS;
  window.PointAttributeReport._getMatchingStates = getMatchingStates;
})();
