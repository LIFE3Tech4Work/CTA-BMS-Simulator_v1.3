/* AppChrome.jsx — SymmetrE Station outer frame/shell
 * Title bar, menu bar, toolbar, content area, and status bar.
 * No import/export — exposes window.SymmetreAppChrome
 * Reads from: window.AuthContext, window.SimulationContext
 */

const SymmetreAppChrome = (function() {
  const { useContext, useState, useCallback } = React;

  // ─── Menu Bar Items ─────────────────────────────────────────────────────────
  const MENU_ITEMS = ['Station', 'View', 'Action', 'Schedule Manager', 'Help', 'Sign Off'];

  // ─── Toolbar Buttons ────────────────────────────────────────────────────────
  const TOOLBAR_BUTTONS = [
    { id: 'back', label: 'Back', icon: '◀' },
    { id: 'forward', label: 'Forward', icon: '▶' },
    { id: 'reload', label: 'Reload Simulation', icon: '⟳' },
    { id: 'alarms', label: 'Alarms', icon: '🔔' },
  ];

  // ─── Title Bar Decorations (cosmetic only) ──────────────────────────────────
  // ─── Title Bar ──────────────────────────────────────────────────────────────
  function TitleBar({ operatorName }) {
    const title = 'SymmetrE R410.2 — Station [' + (operatorName || 'operator') + ']';

    return React.createElement('div', {
      className: 'flex items-center justify-between px-3 py-1 bg-gradient-to-r from-blue-900 to-blue-800 border-b border-gray-700 select-none'
    },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('span', { className: 'text-xs text-blue-200' }, '🖥'),
        React.createElement('span', { className: 'text-xs font-semibold text-white tracking-wide' }, title)
      )
    );
  }

  // ─── Menu Bar ───────────────────────────────────────────────────────────────
  function MenuBar() {
    const [activeMenu, setActiveMenu] = useState(null);
    const auth = useContext(window.AuthContext);

    // Menu items with their dropdown options
    const MENU_DROPDOWNS = {
      'Station': [
        { label: '🌀 AHU-4-4 Overview', action: function() { window.location.hash = '#/symmetre/AHU-4-4'; } },
        { label: '🌀 AHU-23-1 Overview', action: function() { window.location.hash = '#/symmetre/AHU-23-1'; } },
        { label: '🌀 AHU-4-6 Overview', action: function() { window.location.hash = '#/symmetre/AHU-4-6'; } },
        { label: '🌬️ VAV-4-4-02 (Ballroom) Overview', action: function() { window.location.hash = '#/symmetre/VAV-4-4-02'; } },
      ],
      'View': [
        { label: 'Alarm Summary', action: function() { window.location.hash = '#/alarms'; } },
        { label: 'Point Attribute Report', action: function() { window.location.hash = '#/reports'; } },
        { label: 'Instructor Dashboard', action: function() { window.location.hash = '#/instructor'; } },
      ],
      'Action': [
        { label: 'Start Simulation', action: function() { if (window.SimulationEngine) window.SimulationEngine.start(); } },
        { label: 'Pause Simulation', action: function() { if (window.SimulationEngine) window.SimulationEngine.pause(); } },
        { label: 'Speed: 1×', action: function() { if (window.SimulationEngine) window.SimulationEngine.setSpeed('1x'); } },
        { label: 'Speed: 60×', action: function() { if (window.SimulationEngine) window.SimulationEngine.setSpeed('60x'); } },
        { label: 'Speed: 3600×', action: function() { if (window.SimulationEngine) window.SimulationEngine.setSpeed('3600x'); } },
      ],
      'Help': [
        { label: 'About CTA BMS Simulator', action: function() { alert('CTA BMS Simulator v2.4\nHoneywell SymmetrE / EBI Training Platform\nCTA Training Building — NYC Downtown\n\nProperty Primary Use: Multifamily Home\nProperty Secondary Use: Hotel'); } },
        { label: null, action: null },
        { label: 'SME QA: Log Observation', action: function() { if (window.SMEQAForm) window.SMEQAForm.open(); } },
      ],
    };

    const handleMenuClick = useCallback(function(item) {
      if (item === 'Sign Off') {
        // Clear auth state and navigate to auth screen
        if (window.setAuthState) {
          window.setAuthState({
            authenticated: false,
            operator: '',
            securityLevel: 'ViewOnly'
          });
        }
        window.location.hash = '#/auth';
        return;
      }
      if (item === 'Schedule Manager') {
        // Direct-action item, no dropdown — same pattern as Sign Off
        window.location.hash = '#/schedule';
        setActiveMenu(null);
        return;
      }
      // Toggle dropdown for other items
      setActiveMenu(function(prev) { return prev === item ? null : item; });
    }, []);

    // Close menu when clicking elsewhere
    useEffect(function() {
      if (!activeMenu) return;
      function handleClick() { setActiveMenu(null); }
      document.addEventListener('click', handleClick);
      return function() { document.removeEventListener('click', handleClick); };
    }, [activeMenu]);

    return React.createElement('div', {
      className: 'flex items-center bg-gray-700 border-b border-gray-600 px-1'
    },
      MENU_ITEMS.map(function(item) {
        const isActive = activeMenu === item;
        const isSignOff = item === 'Sign Off';
        const isDirectAction = isSignOff || item === 'Schedule Manager'; // no dropdown — click navigates immediately
        const dropdownItems = MENU_DROPDOWNS[item] || null;

        return React.createElement('div', {
          key: item,
          className: 'relative'
        },
          React.createElement('button', {
            className: 'px-3 py-1 text-xs text-gray-200 hover:bg-gray-600 hover:text-white transition-colors ' +
              (isActive ? 'bg-gray-600 text-white ' : '') +
              (isSignOff ? 'text-red-300 hover:text-red-200' : ''),
            onClick: function(e) { e.stopPropagation(); handleMenuClick(item); },
            'aria-label': item,
            'aria-haspopup': (dropdownItems && !isDirectAction) ? 'true' : undefined,
            'aria-expanded': isActive ? 'true' : undefined
          }, item),
          // Dropdown menu
          isActive && !isDirectAction && dropdownItems ? React.createElement('div', {
            className: 'absolute top-full left-0 z-50 bg-gray-800 border border-gray-600 rounded shadow-lg min-w-[180px] py-1'
          },
            dropdownItems.map(function(opt, idx) {
              if (!opt.action) {
                return React.createElement('div', {
                  key: idx,
                  className: 'border-t border-gray-600 my-1',
                });
              }
              return React.createElement('button', {
                key: idx,
                className: 'block w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-600 hover:text-white transition-colors',
                onClick: function() { opt.action(); setActiveMenu(null); }
              }, opt.label);
            })
          ) : null,
          // Placeholder for items without dropdowns (Edit, Configure)
          isActive && !isDirectAction && !dropdownItems ? React.createElement('div', {
            className: 'absolute top-full left-0 z-50 bg-gray-800 border border-gray-600 rounded shadow-lg min-w-[140px] py-1'
          },
            React.createElement('div', { className: 'px-3 py-1 text-xs text-gray-400 italic' }, 'No actions available')
          ) : null
        );
      })
    );
  }

  // ─── Toolbar ────────────────────────────────────────────────────────────────
  function Toolbar() {
    const handleToolbarClick = useCallback(function(id) {
      if (id === 'alarms') {
        window.location.hash = '#/alarms';
      } else if (id === 'reload') {
        // Full simulation reset: jump to row 1 and reset all Manual points to Auto
        if (window.SimulationEngine) {
          window.SimulationEngine.jumpToDate(window.SimulationEngine.BASE_DATE);
          window.SimulationEngine.pause();
        }
        // Reset PointRegistry-driven points to Auto mode
        if (window.PointRegistry && window.PointRegistry.points) {
          window.PointRegistry.points.forEach(function(point) {
            point.mode = 'Auto';
          });
          if (window.PointRegistry.interpolate) {
            window.PointRegistry.interpolate(1, 0);
          }
        }
        // Reset AHU-4-4 formula-driven controller to starting values
        (function() {
          var ctrl = window.AHU44NewController;
          if (!ctrl) return;
          var defaults = {
            runSchedule:             true,
            systemStarting:          false,
            startingTimeSetpoint:    240,
            coolingCoilSetpoint:     60.0,
            heatingCoilSetpoint:     55.0,
            plenumMinSetpoint:       40.0,
            lowOATLockout:           false,
            enthalpyOKForEconomizer: false,
            economizerMinPosition:   20,
            minPositionFanSpeedLock: 5,
            economizerTempControlSP: 58.0,
            co2Sensor:               538,
            co2Setpoint:             900,
            minOAAirflowSetpoint:    4900,
            fanSpeedSetpoint:        75,
            fireAlarmShutdown:       false,
            fireAlarmSmokePurge:     false,
            interlockOn:             true,
            exhaustFanOn:            true,
            commonDamperOpen:        true,
            freezePumpOn:            true,
            oaDamperPosition:        20,
          };
          Object.keys(defaults).forEach(function(key) {
            ctrl.setValue(key, defaults[key]);
          });
          if (ctrl.clearModes) ctrl.clearModes();
          ctrl.recalculate();
          // Also clear fault engine alarms
          var engine = window.AHU44NewFaultEngine;
          if (engine && engine.reset) engine.reset();
        })();
        // Reset VAV controller manual overrides
        (function() {
          var ctrl = window.VAVController;
          if (!ctrl) return;
          if (ctrl.clearModes) ctrl.clearModes();
          if (ctrl.resetToDefaults) ctrl.resetToDefaults();
        })();
      } else if (id === 'back') {
        window.history.back();
      } else if (id === 'forward') {
        window.history.forward();
      }
    }, []);

    return React.createElement('div', {
      className: 'flex items-center gap-1 px-2 py-1 bg-gray-750 border-b border-gray-600',
      style: { backgroundColor: '#3a3a3a' }
    },
      // Navigation toolbar buttons
      TOOLBAR_BUTTONS.map(function(btn) {
        return React.createElement('button', {
          key: btn.id,
          className: 'flex-shrink-0 flex items-center justify-center w-7 h-7 rounded border border-gray-600 bg-gray-700 hover:bg-gray-600 hover:border-gray-500 text-sm text-gray-300 hover:text-white transition-colors',
          onClick: function() { handleToolbarClick(btn.id); },
          title: btn.label,
          'aria-label': btn.label
        }, btn.icon);
      }),
      // Spacer to push mode selector to the right
      React.createElement('div', { className: 'flex-1 min-w-0' }),
      // Mode Selector (Companion / Explore / Capstone) — only for instructor level
      (function() {
        var auth = useContext(window.AuthContext);
        var isInstructor = auth && auth.securityLevel === 'Engr';
        if (isInstructor && window.ModeSelector) {
          return React.createElement('div', { className: 'flex-shrink-0' },
            React.createElement(window.ModeSelector, null)
          );
        }
        return null;
      })()
    );
  }

  // ─── Main AppChrome Component ───────────────────────────────────────────────
  function AppChrome({ children }) {
    const auth = useContext(window.AuthContext);
    const operatorName = auth.operator || 'operator';

    return React.createElement('div', {
      className: 'flex flex-col h-full w-full overflow-hidden bg-gray-900'
    },
      // Title Bar
      React.createElement(TitleBar, { operatorName: operatorName }),
      // Menu Bar
      React.createElement(MenuBar, null),
      // Toolbar
      React.createElement(Toolbar, null),
      // Content Area (renders children)
      React.createElement('div', {
        className: 'flex-1 overflow-hidden relative'
      }, children),
      // Status Bar (BottomStatusBar component, rendered separately)
      window.BottomStatusBar
        ? React.createElement(window.BottomStatusBar, null)
        : React.createElement('div', {
            className: 'h-6 bg-gray-800 border-t border-gray-700 px-3 flex items-center text-xs text-gray-400'
          }, 'Status bar loading...')
    );
  }

  return AppChrome;
})();

// Expose globally
window.SymmetreAppChrome = SymmetreAppChrome;
