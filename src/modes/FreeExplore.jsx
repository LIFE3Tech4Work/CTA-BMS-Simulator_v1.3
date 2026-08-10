/**
 * FreeExplore.jsx — Free Explore mode with scenario selector
 *
 * Full-width layout (no side panel), default 60x simulation speed,
 * 14 predefined scenarios with name + description.
 * Loading a scenario configures point overrides and jumps to start row.
 *
 * Integration:
 *   - Reads scenarios from window.SCENARIOS (src/data/reference/scenarios.js)
 *   - Uses window.SimulationEngine.setSpeed('60x') on activation
 *   - Uses window.SimulationEngine.jumpToDate() for scenario start row
 *   - Applies point overrides via window.PointRegistry.setValue()
 *
 * No import/export — exposes as window.FreeExplore.
 * Validates: Requirements 21.1, 21.2, 21.3, 21.4
 */

(function () {
  'use strict';

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;

  // ─── Constants ──────────────────────────────────────────────────────────────

  /** Speed options for the simulation clock */
  var SPEED_OPTIONS = [
    { value: 'pause', label: 'Pause', icon: '⏸' },
    { value: '1x', label: '1×', icon: '▶' },
    { value: '60x', label: '60×', icon: '⏩' },
    { value: '3600x', label: '3600×', icon: '⏭' }
  ];

  /** Base date for row-to-date conversion (May 1, 2026 00:00 EDT) */
  var BASE_DATE_MS = new Date('2026-05-01T00:00:00-04:00').getTime();
  var MS_PER_HOUR = 3600000;

  // ─── Helper Functions ───────────────────────────────────────────────────────

  /**
   * Convert a 1-based row index to a Date object.
   * Row 1 = May 1 00:00, Row 2 = May 1 01:00, etc.
   */
  function rowToDate(row) {
    return new Date(BASE_DATE_MS + (row - 1) * MS_PER_HOUR);
  }

  /**
   * Get scenarios from window.SCENARIOS with fallback.
   */
  function getScenarios() {
    if (window.SCENARIOS && Array.isArray(window.SCENARIOS)) {
      return window.SCENARIOS;
    }
    return [];
  }

  // ─── FreeExplore Component ──────────────────────────────────────────────────

  function FreeExplore() {
    var scenarios = getScenarios();
    var currentSpeed = (window.SimulationEngine && window.SimulationEngine.speed) || '60x';

    var stateSpeed = useState(currentSpeed);
    var speed = stateSpeed[0];
    var setSpeed = stateSpeed[1];

    var stateSelectedScenario = useState(null);
    var selectedScenario = stateSelectedScenario[0];
    var setSelectedScenario = stateSelectedScenario[1];

    var stateConfirmation = useState(null);
    var confirmation = stateConfirmation[0];
    var setConfirmation = stateConfirmation[1];

    var stateShowSelector = useState(false);
    var showSelector = stateShowSelector[0];
    var setShowSelector = stateShowSelector[1];

    // ─── Activate: Set 60x speed on mount ─────────────────────────────────────

    useEffect(function () {
      if (window.SimulationEngine) {
        window.SimulationEngine.setSpeed('60x');
        setSpeed('60x');
      }
    }, []);

    // ─── Speed Control Handler ────────────────────────────────────────────────

    var handleSpeedChange = useCallback(function (newSpeed) {
      if (window.SimulationEngine) {
        window.SimulationEngine.setSpeed(newSpeed);
        setSpeed(newSpeed);
      }
    }, []);

    // ─── Scenario Load Handler ────────────────────────────────────────────────

    var handleLoadScenario = useCallback(function (scenario) {
      if (!scenario) return;

      // 1. Jump to the scenario's start row
      if (window.SimulationEngine && scenario.startRow) {
        var targetDate = rowToDate(scenario.startRow);
        window.SimulationEngine.jumpToDate(targetDate);
      }

      // 2. Apply point overrides
      if (window.PointRegistry && scenario.pointOverrides) {
        var overrides = scenario.pointOverrides;
        var keys = Object.keys(overrides);
        for (var i = 0; i < keys.length; i++) {
          window.PointRegistry.setValue(keys[i], overrides[keys[i]], 'operator');
        }
      }

      // 3. Update state
      setSelectedScenario(scenario);
      setShowSelector(false);

      // 4. Show confirmation message
      setConfirmation('Scenario loaded: ' + scenario.name);

      // Clear confirmation after 4 seconds
      setTimeout(function () {
        setConfirmation(null);
      }, 4000);
    }, []);

    // ─── Render (pure overlay — no layout impact) ─────────────────────────────

    return React.createElement(React.Fragment, null,
      // ─── Floating Toolbar ─────────────────────────────────────────────────
      React.createElement('div', {
        className: 'absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-1 bg-gray-900/95 border-b border-gray-700',
        style: { pointerEvents: 'auto' }
      },
        // Left: Mode label + scenario button
        React.createElement('div', { className: 'flex items-center gap-3' },
          React.createElement('span', {
            className: 'text-sm font-semibold text-bms-cyan'
          }, '🔍 Free Explore'),
          React.createElement('button', {
            type: 'button',
            className: 'px-3 py-1 text-xs font-medium rounded bg-gray-700 text-gray-200 ' +
              'hover:bg-gray-600 hover:text-white border border-gray-600 transition-colors',
            onClick: function () { setShowSelector(!showSelector); },
            'aria-expanded': showSelector ? 'true' : 'false',
            'aria-label': 'Open scenario selector'
          }, '📋 Scenarios (' + scenarios.length + ')'),
          // Show active scenario name
          selectedScenario && React.createElement('span', {
            className: 'text-xs text-gray-400'
          }, 'Active: ' + selectedScenario.name)
        ),

        // Right: Speed controls
        React.createElement('div', {
          className: 'flex items-center gap-1',
          role: 'group',
          'aria-label': 'Simulation speed controls'
        },
          React.createElement('span', { className: 'text-xs text-gray-400 mr-2' }, 'Speed:'),
          SPEED_OPTIONS.map(function (opt) {
            var isActive = speed === opt.value;
            return React.createElement('button', {
              key: opt.value,
              type: 'button',
              className: 'px-2 py-1 text-xs font-medium rounded transition-colors ' +
                (isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'),
              onClick: function () { handleSpeedChange(opt.value); },
              title: opt.label + ' speed',
              'aria-pressed': isActive ? 'true' : 'false',
              'aria-label': opt.label + ' speed'
            },
              React.createElement('span', { 'aria-hidden': 'true' }, opt.icon),
              ' ' + opt.label
            );
          })
        )
      ),

      // ─── Confirmation Banner ──────────────────────────────────────────────
      confirmation && React.createElement('div', {
        className: 'absolute top-12 left-0 right-0 z-40 px-4 py-2 bg-green-900/95 border-b border-green-700 text-green-200 text-sm ' +
          'flex items-center gap-2',
        role: 'status',
        'aria-live': 'polite'
      },
        React.createElement('span', null, '✓'),
        React.createElement('span', null, confirmation)
      ),

      // ─── Scenario Selector Panel (overlay dropdown) ───────────────────────
      showSelector && React.createElement('div', {
        className: 'absolute top-12 left-4 right-4 z-50 max-h-96 overflow-auto ' +
          'bg-gray-900 border border-gray-600 rounded-lg shadow-2xl',
        role: 'listbox',
        'aria-label': 'Scenario list'
      },
        // Selector header
        React.createElement('div', {
          className: 'sticky top-0 px-4 py-3 bg-gray-900 border-b border-gray-700 ' +
            'flex items-center justify-between'
        },
          React.createElement('h3', { className: 'text-sm font-bold text-white' },
            'Select a Scenario (' + scenarios.length + ' available)'
          ),
          React.createElement('button', {
            type: 'button',
            className: 'text-gray-400 hover:text-white text-lg',
            onClick: function () { setShowSelector(false); },
            'aria-label': 'Close scenario selector'
          }, '✕')
        ),

        // Scenario cards grid
        React.createElement('div', {
          className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4'
        },
          scenarios.map(function (scenario) {
            var isActive = selectedScenario && selectedScenario.id === scenario.id;
            return React.createElement('div', {
              key: scenario.id,
              className: 'p-3 rounded-lg border cursor-pointer transition-all ' +
                (isActive
                  ? 'border-bms-cyan bg-gray-700'
                  : 'border-gray-600 bg-gray-800 hover:border-gray-400 hover:bg-gray-750'),
              role: 'option',
              'aria-selected': isActive ? 'true' : 'false',
              onClick: function () { handleLoadScenario(scenario); },
              tabIndex: 0,
              onKeyDown: function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleLoadScenario(scenario);
                }
              }
            },
              // Scenario number badge + name
              React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
                React.createElement('span', {
                  className: 'inline-flex items-center justify-center w-5 h-5 rounded-full ' +
                    'text-xs font-bold ' +
                    (isActive ? 'bg-bms-cyan text-gray-900' : 'bg-gray-600 text-gray-300')
                }, scenario.id),
                React.createElement('span', {
                  className: 'text-sm font-semibold ' +
                    (isActive ? 'text-bms-cyan' : 'text-white')
                }, scenario.name)
              ),
              // Description
              React.createElement('p', {
                className: 'text-xs text-gray-400 mt-1 line-clamp-2'
              }, scenario.description),
              // Active indicator
              isActive && React.createElement('div', {
                className: 'mt-2 text-xs text-bms-cyan font-medium'
              }, '● Active')
            );
          })
        )
      )
    );
  }

  // ─── Expose on window ──────────────────────────────────────────────────────

  window.FreeExplore = FreeExplore;

})();
