/* AppChrome.jsx — SymmetrE Station outer frame/shell
 * Title bar, menu bar, toolbar, content area, and status bar.
 * No import/export — exposes window.SymmetreAppChrome
 * Reads from: window.AuthContext, window.SimulationContext
 *
 * Visual treatment matches the CTA BMS design reference (station title bar,
 * menu bar, toolbar). Content, labels, menu structure, routes and behaviour are
 * unchanged from v1.3 — this is a styling pass only.
 */

const SymmetreAppChrome = (function() {
  const { useContext, useState, useEffect, useCallback } = React;

  // ─── Menu Bar Items ─────────────────────────────────────────────────────────
  const MENU_ITEMS = ['Station', 'View', 'Action', 'Schedule Manager', 'Help', 'Sign Off'];

  // ─── Toolbar Buttons ────────────────────────────────────────────────────────
  const TOOLBAR_BUTTONS = [
    { id: 'back', label: 'Back', icon: '◀' },
    { id: 'forward', label: 'Forward', icon: '▶' },
    { id: 'reload', label: 'Reload Simulation', icon: '↻' },
  ];

  // ─── Shared style tokens (design reference) ─────────────────────────────────
  const TITLE_BAR = {
    height: '26px', background: 'linear-gradient(180deg,#243044,#1b2536)',
    display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px', flexShrink: 0,
  };
  const MENU_BAR = {
    height: '34px', background: '#26334a', display: 'flex', alignItems: 'center',
    gap: '26px', padding: '0 16px', borderBottom: '1px solid #171f2d', flexShrink: 0,
  };
  const TOOLBAR = {
    height: '42px', background: 'linear-gradient(180deg,#33425d,#2b3850)',
    display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px',
    borderBottom: '1px solid #1b2434', flexShrink: 0,
  };
  const NAV_BTN = {
    width: '30px', height: '26px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', borderRadius: '5px', background: 'rgba(255,255,255,.08)',
    color: '#c7d4e6', fontSize: '14px', cursor: 'pointer',
    border: '1px solid rgba(255,255,255,.12)', flexShrink: 0,
  };

  // ─── Title Bar ──────────────────────────────────────────────────────────────
  function TitleBar({ operatorName }) {
    const title = 'SymmetrE R410.2 — Station';

    return React.createElement('div', { style: TITLE_BAR, className: 'select-none' },
      React.createElement('img', {
        src: 'assets/LIFE3_White_Logo.png',
        alt: 'LIFE3',
        style: { height: '14px', width: 'auto', flexShrink: 0 },
        className: 'select-none',
        draggable: false,
      }),
      React.createElement('span', {
        style: { color: '#c7d4e6', fontSize: '12px', fontWeight: 700, letterSpacing: '.2px' },
      }, title),
      React.createElement('span', { style: { color: '#7d8ba3', fontSize: '12px' } },
        '[' + (operatorName || 'operator') + ']')
    );
  }

  // ─── Menu Bar ───────────────────────────────────────────────────────────────
  function MenuBar() {
    const [activeMenu, setActiveMenu] = useState(null);
    const auth = useContext(window.AuthContext);
    const isInstructorOp = !!(auth && auth.securityLevel && window.AuthHelpers &&
      window.AuthHelpers.hasPrivilege(auth.securityLevel, 'Engr'));

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
        // Student-facing: their own assignment list. Hidden from instructors, who
        // are never assigned exercises and would land on an empty screen.
        isInstructorOp ? null : { label: 'My Exercises', action: function() { window.location.hash = '#/exercises'; } },
        { label: 'Point Attribute Report', action: function() { window.location.hash = '#/reports'; } },
        // Instructor-facing: the exercises they authored plus every student's
        // progress. Named alongside "Point Attribute Report" rather than
        // "Dashboard", which said nothing about what is in it.
        isInstructorOp ? { label: 'Exercise Report', action: function() { window.location.hash = '#/instructor'; } } : null,
      ].filter(Boolean),
      'Action': [
        { label: 'Start Simulation', action: function() { if (window.SimulationEngine) window.SimulationEngine.start(); } },
        { label: 'Pause Simulation', action: function() { if (window.SimulationEngine) window.SimulationEngine.pause(); } },
        { label: 'Speed: 1×', action: function() { if (window.SimulationEngine) window.SimulationEngine.setSpeed('1x'); } },
        { label: 'Speed: 60×', action: function() { if (window.SimulationEngine) window.SimulationEngine.setSpeed('60x'); } },
        { label: 'Speed: 3600×', action: function() { if (window.SimulationEngine) window.SimulationEngine.setSpeed('3600x'); } },
      ],
      'Help': [
        { label: 'About CTA BMS Simulator', action: function() { alert('CTA BMS Simulator v2.4\nLIFE3 SymmetrE / EBI Training Platform\nCTA Training Building — NYC Downtown\n\nProperty Primary Use: Multifamily Home\nProperty Secondary Use: Hotel'); } },
        { label: null, action: null },
        { label: 'SME QA: Log Observation', action: function() { if (window.SMEQAForm) window.SMEQAForm.open(); } },
        // Flagged points are a QA concern, not a teaching one, so they sit under Help
        // rather than inside the Exercise Report where they competed with student
        // results. Instructor-only, like the Flag for Review tab that feeds it.
        isInstructorOp ? { label: 'Review Queue', action: function() { window.location.hash = '#/review'; } } : null,
      ].filter(Boolean),
    };

    const handleMenuClick = useCallback(function(item) {
      if (item === 'Sign Off') {
        // Clear the Supabase session too, not just the app's own auth state. Without
        // this a student's session token stays on the machine after they sign off —
        // on a shared classroom computer that leaves their account reachable to
        // whoever sits down next, and a later syncDown would pull their rows.
        if (window.SupabaseBackend && window.SupabaseBackend.isConfigured()) {
          try { window.SupabaseBackend.signOut(); } catch (e) {}
        }
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

    const panelSt = {
      position: 'absolute', left: '-6px', top: '100%', marginTop: '-1px', minWidth: '200px',
      background: 'linear-gradient(180deg,#f6f8fc,#e9eef6)', border: '1px solid #6f7f97',
      borderRadius: '6px', boxShadow: '0 12px 30px rgba(8,14,28,.45)', padding: '4px',
      zIndex: 80, display: 'flex', flexDirection: 'column',
    };

    return React.createElement('div', { style: MENU_BAR, className: 'select-none' },
      MENU_ITEMS.map(function(item) {
        const isActive = activeMenu === item;
        const isSignOff = item === 'Sign Off';
        const isDirectAction = isSignOff || item === 'Schedule Manager'; // no dropdown — click navigates immediately
        const dropdownItems = MENU_DROPDOWNS[item] || null;

        return React.createElement('div', {
          key: item,
          style: { position: 'relative', padding: '9px 0' },
        },
          React.createElement('button', {
            style: { background: 'none', border: 'none', padding: 0,
                     color: isSignOff ? '#e08a8a' : (isActive ? '#eaf3ff' : '#c7d4e6'),
                     fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                     fontFamily: 'inherit' },
            onClick: function(e) { e.stopPropagation(); handleMenuClick(item); },
            'aria-label': item,
            'aria-haspopup': (dropdownItems && !isDirectAction) ? 'true' : undefined,
            'aria-expanded': isActive ? 'true' : undefined
          }, item),
          // Dropdown menu
          isActive && !isDirectAction && dropdownItems ? React.createElement('div', { style: panelSt },
            dropdownItems.map(function(opt, idx) {
              if (!opt.action) {
                return React.createElement('div', {
                  key: idx,
                  style: { borderTop: '1px solid #d6dde9', margin: '4px 0' },
                });
              }
              return React.createElement('button', {
                key: idx,
                style: { display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px',
                         fontSize: '12px', fontWeight: 700, color: '#20324e', borderRadius: '4px',
                         cursor: 'pointer', whiteSpace: 'nowrap', background: 'none',
                         border: 'none', fontFamily: 'inherit' },
                onMouseEnter: function(e) { e.currentTarget.style.background = '#dbe5f1'; },
                onMouseLeave: function(e) { e.currentTarget.style.background = 'none'; },
                onClick: function() { opt.action(); setActiveMenu(null); }
              }, opt.label);
            })
          ) : null,
          // Placeholder for items without dropdowns
          isActive && !isDirectAction && !dropdownItems ? React.createElement('div', { style: panelSt },
            React.createElement('div', { style: { padding: '6px 12px', fontSize: '12px', color: '#8a97ab', fontStyle: 'italic' } }, 'No actions available')
          ) : null
        );
      })
    );
  }

  // ─── Toolbar ────────────────────────────────────────────────────────────────
  function Toolbar() {
    const auth = useContext(window.AuthContext);
    const [alarmCount, setAlarmCount] = useState(0);

    // Unacknowledged alarm count for the bell badge — read from the same
    // aggregation the Alarm Summary screen uses. Display only.
    useEffect(function () {
      function read() {
        var list = (window.AlarmSummary && window.AlarmSummary.getActiveAlarms)
          ? window.AlarmSummary.getActiveAlarms()
          : (window.ACTIVE_ALARMS || []);
        setAlarmCount((list || []).length);
      }
      read();
      var iv = setInterval(read, 1500);
      return function () { clearInterval(iv); };
    }, []);

    const handleToolbarClick = useCallback(function(id) {
      if (id === 'alarms') {
        window.location.hash = '#/alarms';
      } else if (id === 'reload') {
        // For a student mid-exercise this clears the authored fault across every unit
        // and solves the exercise in one click — more than the panel button that is
        // already locked, and with no confirm step. Routed to the exercise's own
        // starting state instead, which is what RESTART in the banner does.
        var RC = window.ResetControls;
        if (RC && RC.studentInExercise && RC.studentInExercise()) {
          var ES = window.ExerciseStore;
          var activeId = null;
          try { activeId = localStorage.getItem('cta_exercise_active'); } catch (e) {}
          var activeEx = (ES && activeId) ? ES.getExercise(activeId) : null;
          if (activeEx && ES.applySetup) ES.applySetup(activeEx);
          return;
        }
        // ─── Full simulation reset ───────────────────────────────────────────
        // Previously this only reset AHU-4-4: the block hardcoded that unit's
        // defaults and named its controller directly, so pressing ↻ while looking
        // at AHU-4-6, 4-3 or 23-1 left every override on that unit untouched and
        // the button appeared to do nothing. It also called a VAV method that does
        // not exist (resetToDefaults — the real one is reset), and left an active
        // weather override in place, so a "reset" simulator could still be sitting
        // in hand-set January.
        //
        // Now driven by each controller's own clearModes(), which restores every
        // point's pre-override value. Nothing is hardcoded per unit, so adding a
        // unit does not silently fall out of the reset again.
        if (window.SimulationEngine) {
          // Reset to the seasonally-current moment rather than the fiscal-year
          // start, so a reset does not silently jump the class to July.
          window.SimulationEngine.jumpToDate(
            window.SimulationEngine.SEASONAL_START_DATE || window.SimulationEngine.BASE_DATE);
          window.SimulationEngine.pause();
        }

        // Hand outdoor conditions back to the weather file before the units
        // recalculate, so they settle against live weather rather than a held one.
        if (window.WeatherOverride && window.WeatherOverride.release) {
          window.WeatherOverride.release();
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

        // Every AHU, plus every fault engine that carries latched alarms.
        ['AHU46Controller', 'AHU44NewController', 'AHU43Controller', 'AHU23Controller']
          .forEach(function(name) {
            var ctrl = window[name];
            if (!ctrl) return;
            if (ctrl.clearModes) ctrl.clearModes();
            if (ctrl.recalculate) ctrl.recalculate();
          });

        ['AHU46FaultEngine', 'AHU44NewFaultEngine', 'AHU23FaultEngine', 'VAVFaultEngine', 'FaultEngine']
          .forEach(function(name) {
            var engine = window[name];
            if (engine && engine.reset) engine.reset();
          });

        // VAV zones: clear overrides, restore seeded state, then re-pull discharge
        // air from each zone's own upstream AHU now that the AHUs have settled.
        (function() {
          var ctrl = window.VAVController;
          if (!ctrl) return;
          if (ctrl.clearModes) ctrl.clearModes();
          if (ctrl.reset) ctrl.reset();
          if (ctrl.syncFromUpstream) ctrl.syncFromUpstream();
        })();
      } else if (id === 'back') {
        window.history.back();
      } else if (id === 'forward') {
        window.history.forward();
      }
    }, []);

    const bellActive = alarmCount > 0;

    return React.createElement('div', { style: TOOLBAR, className: 'select-none' },
      // Navigation toolbar buttons
      TOOLBAR_BUTTONS.map(function(btn) {
        return React.createElement('button', {
          key: btn.id,
          style: Object.assign({}, NAV_BTN, { fontFamily: 'inherit' }),
          onClick: function() { handleToolbarClick(btn.id); },
          title: btn.label,
          'aria-label': btn.label
        }, btn.icon);
      }),
      React.createElement('div', {
        style: { width: '1px', height: '24px', background: '#4a5b78', margin: '0 4px', flexShrink: 0 },
      }),
      // Alarms — same '#/alarms' route as before, now the reference bell
      React.createElement('button', {
        style: { position: 'relative', width: '34px', height: '28px', display: 'flex',
                 alignItems: 'center', justifyContent: 'center', borderRadius: '6px',
                 background: bellActive ? 'rgba(224,52,43,.22)' : 'rgba(255,255,255,.08)',
                 border: '1px solid ' + (bellActive ? '#e0342b' : 'rgba(255,255,255,.12)'),
                 cursor: 'pointer', flexShrink: 0, padding: 0 },
        onClick: function() { handleToolbarClick('alarms'); },
        title: 'Alarms',
        'aria-label': 'Alarms'
      },
        React.createElement('svg', {
          width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none',
          stroke: bellActive ? '#ff8a7d' : '#c7d4e6', strokeWidth: 2,
          strokeLinecap: 'round', strokeLinejoin: 'round',
        },
          React.createElement('path', { d: 'M6 9a6 6 0 1112 0c0 4.5 1.8 6 1.8 6H4.2S6 13.5 6 9' }),
          React.createElement('path', { d: 'M10 20a2 2 0 004 0' })
        ),
        bellActive ? React.createElement('span', {
          style: { position: 'absolute', top: '-6px', right: '-6px', minWidth: '16px',
                   height: '16px', padding: '0 3px', borderRadius: '8px', background: '#e0342b',
                   color: '#fff', fontSize: '10px', fontWeight: 800, display: 'flex',
                   alignItems: 'center', justifyContent: 'center', border: '1.5px solid #2b3850' },
        }, alarmCount) : null
      ),
      // Spacer to push mode selector to the right
      React.createElement('div', { style: { flex: 1, minWidth: 0 } }),
      // Mode Selector (Companion / Explore / Capstone) — only for instructor level
      (function() {
        var isInstructor = auth && auth.securityLevel === 'Engr';
        if (isInstructor && window.ModeSelector) {
          return React.createElement('div', { style: { flexShrink: 0 } },
            React.createElement(window.ModeSelector, null)
          );
        }
        return null;
      })()
    );
  }

  // ─── Main AppChrome Component ───────────────────────────────────────────────
  // Which unit the station is showing. Read from the route rather than passed in,
// because this shell is shared by every screen and only the station screens have
// a unit at all.
function unitFromHash() {
  var h = window.location.hash || '';
  var m = h.match(/#\/symmetre\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function AppChrome({ children }) {
    const auth = useContext(window.AuthContext);
    const operatorName = auth.operator || 'operator';

    return React.createElement('div', {
      className: 'flex flex-col h-full w-full overflow-hidden',
      style: { background: '#1a2230', fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" },
    },
      // Title Bar
      React.createElement(TitleBar, { operatorName: operatorName }),
      // Menu Bar
      React.createElement(MenuBar, null),
      // Toolbar
      React.createElement(Toolbar, null),
      // Content Area (renders children)
      // data-station-content marks the region the Companion / Capstone side
      // panels dock into, so they overlay the diagram without covering the
      // title bar, menu bar or toolbar above it (ModeController.js measures it).
      window.ExerciseAuthorBanner
        ? React.createElement(window.ExerciseAuthorBanner, { unitId: unitFromHash() })
        : null,
      window.ExerciseRunBanner ? React.createElement(window.ExerciseRunBanner, null) : null,
      React.createElement('div', {
        className: 'flex-1 overflow-hidden relative',
        'data-station-content': 'true'
      }, children),
      // Status Bar (BottomStatusBar component, rendered separately)
      window.BottomStatusBar
        ? React.createElement(window.BottomStatusBar, null)
        : React.createElement('div', {
            style: { height: '24px', background: '#26334a', borderTop: '1px solid #171f2d',
                     padding: '0 12px', display: 'flex', alignItems: 'center',
                     fontSize: '11px', color: '#7d8ba3' },
          }, 'Status bar loading...')
    );
  }

  return AppChrome;
})();

// Expose globally
window.SymmetreAppChrome = SymmetreAppChrome;
