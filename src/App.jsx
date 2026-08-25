/* App.jsx — Root application component
 * Sets up 5 React Context providers and hash-based routing.
 * Loaded by index.html via <script type="text/babel" src="src/App.jsx">
 * No import/export — uses globals (React, ReactDOM) and attaches contexts to window.
 */

const { useState, useEffect, useContext, useCallback, createContext } = React;

// ─── Context Definitions ────────────────────────────────────────────────────────

const AuthContext = createContext({
  authenticated: false,
  operator: '',
  securityLevel: 'ViewOnly'
});

const PointRegistryContext = createContext({
  points: new Map(),
  getValue: () => null,
  setValue: () => {},
  subscribe: () => {},
  unsubscribe: () => {}
});

const SimulationContext = createContext({
  currentRow: 1,
  speed: 'pause',
  interpolationFraction: 0
});

const ModeContext = createContext({
  currentMode: 'explore'
});

const AlarmContext = createContext({
  alarms: []
});

// Expose contexts on window so other script files can access them
window.AuthContext = AuthContext;
window.PointRegistryContext = PointRegistryContext;
window.SimulationContext = SimulationContext;
window.ModeContext = ModeContext;
window.AlarmContext = AlarmContext;

// ─── Route Parsing ──────────────────────────────────────────────────────────────

// Every unit App.jsx actually knows how to render. Anything else (a typo, a
// stale/garbage id like the breadcrumb's "Unknown" fallback, a query string
// stuck onto the segment) used to fall through every specific dispatch
// branch in SymmetreScreen and land on the old generic AHUGraphic/
// ControlsSidebar "Unknown — Air Handling Unit Schematic" screen — a
// legacy, pre-SymmetreBoard view that's no longer part of the product.
// Normalizing here means every consumer of params.ahuId always gets a real,
// known unit; that screen can no longer be reached at all.
var KNOWN_AHU_IDS = { 'AHU-4-6': true, 'AHU-4-4': true, 'AHU-4-3': true, 'AHU-23-1': true,
                      'VAV-4-4-02': true, 'VAV-02-03': true };

function parseRoute(hash) {
  const cleaned = hash.replace(/^#\/?/, '');
  const parts = cleaned.split('/');

  if (parts[0] === 'symmetre') {
    var rawAhuId = (parts[1] || 'AHU-4-4').split('?')[0];
    var ahuId = KNOWN_AHU_IDS[rawAhuId] ? rawAhuId : 'AHU-4-4';
    return { screen: 'symmetre', params: { ahuId: ahuId } };
  }
  if (parts[0] === 'ebi') {
    return { screen: 'ebi', params: { pointId: decodeURIComponent(parts[1] || ''), tab: parts[2] || 'general' } };
  }
  if (parts[0] === 'alarms') {
    return { screen: 'alarms', params: {} };
  }
  if (parts[0] === 'schedule') {
    return { screen: 'schedule', params: {} };
  }
  if (parts[0] === 'reports') {
    return { screen: 'reports', params: {} };
  }
  if (parts[0] === 'instructor') {
    return { screen: 'instructor', params: {} };
  }
  // The route an emailed password-reset link lands on. Supabase puts the recovery
  // token in the URL and the SDK exchanges it for a session, so this page only has
  // to collect the new password. Reachable without being signed in, by definition.
  if (parts[0] === 'reset') {
    return { screen: 'reset', params: {} };
  }
  if (parts[0] === 'exercises') {
    return { screen: 'exercises', params: {} };
  }
  if (parts[0] === 'review') {
    return { screen: 'review', params: {} };
  }
  if (parts[0] === 'overview') {
    return { screen: 'overview', params: {} };
  }
  return { screen: 'auth', params: {} };
}

// Expose parseRoute globally for testing / other scripts
window.parseRoute = parseRoute;

// ─── Placeholder Screen Components ─────────────────────────────────────────────

function AuthScreen() {
  // Use the SignOn component if available (loaded from auth/SignOn.jsx)
  if (window.SignOn) {
    return React.createElement(window.SignOn, null);
  }
  // Fallback placeholder
  return React.createElement('div', { className: 'flex items-center justify-center h-screen bg-gray-900 text-white' },
    React.createElement('div', { className: 'text-center' },
      React.createElement('h1', { className: 'text-2xl font-bold' }, 'Sign On'),
      React.createElement('p', { className: 'text-gray-400 mt-2' }, 'LIFE3 BMS Simulator — Auth Screen')
    )
  );
}

function SymmetreScreen({ params }) {
  var modeCtx = useContext(ModeContext);
  var currentMode = (modeCtx && modeCtx.currentMode) || 'companion';

  // Build the core BMS content
  var bmsContent = null;

  if (window.SymmetreAppChrome) {
    bmsContent = React.createElement(window.SymmetreAppChrome, null,
      React.createElement('div', { className: 'flex flex-col h-full bg-gray-800' },
        // Zone Tabs and Outside Air data strip
        window.ZoneTabs
          ? React.createElement(window.ZoneTabs, null)
          : null,
        // Main content area (AHU graphic + controls sidebar)
        React.createElement('div', { className: 'flex flex-1 min-h-0' },
          // Controls Sidebar (scrollable column)
          React.createElement('div', {
            className: 'sym-panel h-full flex-shrink-0 overflow-y-auto',
            style: { width: '304px' }
          },
            (params.ahuId === 'AHU-4-4' && window.AHU44NewControlsSidebar)
              ? React.createElement(window.AHU44NewControlsSidebar, { controller: 'AHU44NewController', unitId: 'AHU-4-4' })
              // AHU-4-3 shares AHU-4-4's panel, pointed at its own controller.
              : (params.ahuId === 'AHU-4-3' && window.AHU44NewControlsSidebar)
              ? React.createElement(window.AHU44NewControlsSidebar, { controller: 'AHU43Controller', unitId: 'AHU-4-3' })
              : (params.ahuId === 'AHU-23-1' && window.AHU23ControlsSidebar)
              ? React.createElement(window.AHU23ControlsSidebar, null)
              : (params.ahuId === 'AHU-4-6' && window.AHU46ControlsSidebar)
              ? React.createElement(window.AHU46ControlsSidebar, null)
              // Every VAV tab uses the zone panel, keyed by its own zone id.
              : (params.ahuId.indexOf('VAV') === 0 && window.VAVControlsSidebar)
              ? React.createElement(window.VAVControlsSidebar, { zoneId: params.ahuId })
              : (window.ControlsSidebar
                ? React.createElement(window.ControlsSidebar, { ahuId: params.ahuId || 'AHU-4-4' })
                : null),
            // LL97 panel, last in every sidebar. AHU-4-6 used to render it inside its
            // own sidebar instead, which put it above that panel's reset sections while
            // every other tab had it at the bottom. Injected here for all units so the
            // placement is the same on every tab.
            // LL97 panel commented out — it was visible to every user type, and the
            // penalty exposure figures are building-owner data rather than something a
            // student working a unit should be reading. Restore by uncommenting.
            // window.LL97Panel
            //   ? React.createElement(window.LL97Panel, null)
            //   : null
            null
          ),
          // AHU Graphic area — the three AHU views render the SymmetrE vector
          // board (fixed 1613x878 stage, scaled to fit); VAV keeps its own graphic.
          React.createElement('div', { className: 'flex-1 relative overflow-hidden bg-gray-900' },
            (window.SymmetreBoard && window.SymmetreBoardPoints &&
             window.SymmetreBoardPoints.UNITS[params.ahuId])
              ? React.createElement(window.SymmetreBoard, { ahuId: params.ahuId })
              : (params.ahuId === 'AHU-4-4' && window.AHU44NewImageOverlay)
              ? React.createElement(window.AHU44NewImageOverlay, null)
              : (params.ahuId === 'AHU-23-1' && window.AHUImageOverlay)
              ? React.createElement(window.AHUImageOverlay, { ahuId: 'AHU-23-1' })
              : (params.ahuId === 'AHU-4-6' && window.AHU46VectorOverlay)
              ? React.createElement(window.AHU46VectorOverlay, null)
              : (params.ahuId === 'AHU-4-6' && window.AHU46ImageOverlay)
              ? React.createElement(window.AHU46ImageOverlay, null)
              : (params.ahuId === 'VAV-4-4-02' && window.VAVGraphic)
              ? React.createElement(window.VAVGraphic, { zoneId: params.ahuId })
              : (window.AHUGraphic
                ? React.createElement(window.AHUGraphic, { ahuId: params.ahuId || 'AHU-4-4' })
                : React.createElement('div', { className: 'text-center' },
                    React.createElement('h1', { className: 'text-2xl font-bold' }, 'SymmetrE Station'),
                    React.createElement('p', { className: 'text-gray-400 mt-2' }, 'AHU: ' + (params.ahuId || 'AHU-4-4'))
                  ))
            // The simultaneous heating/cooling banner used to be mounted here, from
            // the legacy overlay era — and excluded on AHU-4-6, so the unit the
            // curriculum teaches this fault on could never show it. SymmetreBoard now
            // renders it for every unit from live controller state.
          )
        )
      )
    );
  } else {
    bmsContent = React.createElement('div', { className: 'flex items-center justify-center h-screen bg-gray-800 text-white' },
      React.createElement('div', { className: 'text-center' },
        React.createElement('h1', { className: 'text-2xl font-bold' }, 'SymmetrE Station'),
        React.createElement('p', { className: 'text-gray-400 mt-2' }, 'AHU: ' + (params.ahuId || 'AHU-4-4'))
      )
    );
  }

  // Determine side panel content based on current mode
  var panelContent = null;
  if (currentMode === 'companion' && window.CompanionMode) {
    panelContent = React.createElement(window.CompanionMode, null);
  } else if (currentMode === 'capstone' && window.CapstoneModeShell) {
    panelContent = React.createElement(window.CapstoneModeShell, null);
  }

  // Wrap with ModeLayoutWrapper when a side panel is active
  if (panelContent && window.ModeLayoutWrapper) {
    return React.createElement(window.ModeLayoutWrapper, {
      mainContent: bmsContent,
      panelContent: panelContent
    });
  }

  return bmsContent;
}

function EBIScreen({ params }) {
  // Use EBIAppChrome if available (loaded from ui/ebi/AppChrome.jsx)
  if (window.EBIAppChrome) {
    return React.createElement(window.EBIAppChrome, {
      pointId: params.pointId
    });
  }
  // Fallback placeholder
  return React.createElement('div', { className: 'flex items-center justify-center h-screen bg-gray-800 text-white' },
    React.createElement('div', { className: 'text-center' },
      React.createElement('h1', { className: 'text-2xl font-bold' }, 'EBI Point Detail'),
      React.createElement('p', { className: 'text-gray-400 mt-2' }, 'Point: ' + (params.pointId || '—') + ' | Tab: ' + (params.tab || 'general'))
    )
  );
}

function AlarmsScreen() {
  // Use the AlarmSummary component if available (loaded from alarm/AlarmSummary.jsx)
  if (window.AlarmSummary) {
    return React.createElement(window.AlarmSummary, null);
  }
  // Fallback placeholder
  return React.createElement('div', { className: 'flex items-center justify-center h-screen bg-gray-800 text-white' },
    React.createElement('h1', { className: 'text-2xl font-bold' }, 'Alarm Summary')
  );
}

function ScheduleScreen() {
  const [selectedSchedule, setSelectedSchedule] = useState('AHU-4-4');
  const [activeTab, setActiveTab] = useState('weekly');

  // System Configuration tree data (schedulable objects) — matches the two
  // current Station tabs (AHU-4-4, AHU-23-1). Legacy AHU-4-4/AHU-4-6 and
  // the demo-only AHU-9-2 fault schedule have been removed.
  // One entry per Station tab. VAV boxes carry their own schedule in a real system —
  // a terminal unit can be occupied when its air handler is not — so they are listed
  // rather than assumed to follow the AHU.
  const scheduleTree = [
    { id: 'AHU-4-6', label: 'AHU-4-6 Schedule', parent: null },
    { id: 'AHU-4-4', label: 'AHU-4-4 Schedule', parent: null },
    { id: 'AHU-4-3', label: 'AHU-4-3 Schedule', parent: null },
    { id: 'AHU-23-1', label: 'AHU-23-1 Schedule', parent: null },
    { id: 'VAV-4-4-02', label: 'VAV-4-4 Schedule', parent: null }
    // VAV-02-03 is hidden here for the same reason it is hidden from the Station tab
    // bar — a schedule object for a unit an operator cannot open is just clutter.
  ];

  // Tree item renderer
  function renderTreeItem(item) {
    const isActive = selectedSchedule === item.id;
    return React.createElement('div', {
      key: item.id,
      style: { display: 'flex', alignItems: 'center', gap: '8px',
               padding: '7px 10px', borderRadius: '5px', cursor: 'pointer',
               fontSize: '12.5px', fontWeight: isActive ? 800 : 600,
               fontFamily: 'inherit',
               background: isActive ? 'linear-gradient(180deg,#2f6fd0,#1f57c8)' : 'transparent',
               color: isActive ? '#fff' : '#c3cfdd' },
      onMouseEnter: function (e) { if (!isActive) e.currentTarget.style.background = '#18202e'; },
      onMouseLeave: function (e) { if (!isActive) e.currentTarget.style.background = 'transparent'; },
      onClick: function() { setSelectedSchedule(item.id); }
    },
      React.createElement('span', null, item.label)
    );
  }

  // Tab button renderer
  function renderTab(tabId, label) {
    const isActive = activeTab === tabId;
    return React.createElement('button', {
      key: tabId,
      style: { padding: '8px 15px', fontSize: '12px', fontWeight: 800,
               letterSpacing: '.2px', cursor: 'pointer', fontFamily: 'inherit',
               background: isActive ? 'rgba(53,189,211,.12)' : 'transparent',
               border: 'none',
               borderBottom: '2px solid ' + (isActive ? '#35bdd3' : 'transparent'),
               color: isActive ? '#cfe6ea' : '#9db0c8' },
      onClick: function() { setActiveTab(tabId); }
    }, label);
  }

  return React.createElement('div', {
    className: 'flex h-screen',
    style: { background: '#141a26', color: '#e8edf6',
             fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" },
    'data-screen-label': 'Schedule Manager'
  },
    // Left sidebar: System Configuration tree — same width and palette as the
    // Alarm Summary filter tree, which is the same kind of navigation.
    React.createElement('div', {
      style: { width: '230px', background: '#0e1420', borderRight: '1px solid #232c3d',
               display: 'flex', flexDirection: 'column', flexShrink: 0 }
    },
      React.createElement('div', {
        style: { padding: '11px 12px', borderBottom: '1px solid #232c3d' }
      },
        React.createElement('h2', {
          style: { fontSize: '12.5px', fontWeight: 800, color: '#e8edf6', letterSpacing: '.2px' }
        }, 'System Configuration'),
        React.createElement('p', {
          style: { fontSize: '10.5px', color: '#7f8fa6', marginTop: '3px' }
        }, 'Schedule Objects')
      ),
      React.createElement('div', {
        style: { flex: 1, overflowY: 'auto', padding: '8px', display: 'flex',
                 flexDirection: 'column', gap: '2px' }
      },
        scheduleTree.map(renderTreeItem)
      )
    ),

    // Right content area: selected schedule
    React.createElement('div', { className: 'flex-1 flex flex-col overflow-hidden' },
      // Title bar
      React.createElement('div', {
        style: { padding: '10px 14px', background: '#0e1420',
                 borderBottom: '1px solid #232c3d', flexShrink: 0 }
      },
        React.createElement('button', {
          style: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                   borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                   background: '#1b2230', border: '1px solid #38445c', color: '#c3cfdd',
                   fontFamily: 'inherit', marginBottom: '8px' },
          onClick: function() { window.location.hash = '#/symmetre'; },
          title: 'Return to SymmetrE Station'
        }, '\u2190 Back'),
        React.createElement('h2', {
          style: { fontSize: '15px', fontWeight: 800, color: '#fff' }
        }, selectedSchedule + ' Schedule'),
        React.createElement('p', {
          style: { fontSize: '11px', color: '#9db0c8', marginTop: '2px' }
        }, (selectedSchedule && selectedSchedule.indexOf('VAV') === 0)
            ? 'Terminal unit occupancy pattern'
            : 'Normal operating pattern')
      ),

      // Tab bar
      React.createElement('div', {
        style: { display: 'flex', borderBottom: '1px solid #232c3d',
                 background: '#141a26', flexShrink: 0 }
      },
        renderTab('weekly', 'Weekly Schedule'),
        renderTab('exception', 'Exception Schedule')
      ),

      // Tab content
      React.createElement('div', { className: 'flex-1 overflow-hidden' },
        activeTab === 'weekly'
          ? (window.WeeklySchedule
              ? React.createElement(window.WeeklySchedule, { scheduleId: selectedSchedule })
              : React.createElement('div', { style: { padding: '16px', color: '#9db0c8', fontSize: '12px' } }, 'Loading Weekly Schedule\u2026'))
          : (window.ExceptionSchedule
              ? React.createElement(window.ExceptionSchedule, { scheduleId: selectedSchedule })
              : React.createElement('div', { style: { padding: '16px', color: '#9db0c8', fontSize: '12px' } }, 'Loading Exception Schedule\u2026'))
      )
    )
  );
}

function ReportsScreen() {
  // Use the PointAttributeReport component if available (loaded from reports/PointAttributeReport.jsx)
  if (window.PointAttributeReport) {
    return React.createElement(window.PointAttributeReport, null);
  }
  // Fallback placeholder
  return React.createElement('div', { className: 'flex items-center justify-center h-screen bg-gray-800 text-white' },
    React.createElement('h1', { className: 'text-2xl font-bold' }, 'Point Attribute Report')
  );
}

function InstructorScreen() {
  // Use InstructorDashboard if available (loaded from instructor/Dashboard.jsx)
  if (window.InstructorDashboard) {
    return React.createElement(window.InstructorDashboard, null);
  }
  // Fallback placeholder
  return React.createElement('div', { className: 'flex items-center justify-center h-screen bg-gray-800 text-white' },
    React.createElement('h1', { className: 'text-2xl font-bold' }, 'Instructor Dashboard')
  );
}

// ─── Router Component ───────────────────────────────────────────────────────────

function Router() {
  const auth = useContext(AuthContext);
  const [route, setRoute] = useState(() => {
    const hash = window.location.hash || '#/auth';
    return parseRoute(hash);
  });

  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash || '#/auth';
      setRoute(parseRoute(hash));
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Screens reachable without signing in. The reset route is the reason this is a
  // list rather than a single comparison: an emailed password-reset link is only ever
  // clicked by someone who CANNOT sign in, so bouncing them to the sign-on screen is
  // the exact dead end the route exists to avoid.
  //
  // Note this guard runs as an effect, independent of the render switch below —
  // ordering the switch cases does not exempt anything from it.
  const PUBLIC_SCREENS = { auth: true, reset: true };

  // If not authenticated and trying to access a gated route, redirect to auth
  useEffect(() => {
    if (!auth.authenticated && !PUBLIC_SCREENS[route.screen]) {
      window.location.hash = '#/auth';
    }
  }, [auth.authenticated, route.screen]);

  // Render the appropriate screen based on the current route
  switch (route.screen) {
    // Before the auth gate on purpose: the whole point of a reset link is that it
    // works for someone who cannot sign in.
    case 'reset':
      return window.ResetPassword
        ? React.createElement(window.ResetPassword, null)
        : React.createElement('div', { className: 'p-6 text-gray-300' }, 'Password reset unavailable.');
    case 'review':
      return window.ReviewQueueScreen
        ? React.createElement(window.ReviewQueueScreen, null)
        : React.createElement('div', { className: 'p-6 text-gray-300' }, 'Review queue unavailable.');
    case 'overview':
      return window.SystemOverview
        ? React.createElement(window.SystemOverview, null)
        : React.createElement('div', { className: 'p-6 text-gray-300' }, 'System overview unavailable.');
    case 'symmetre':
      return React.createElement(SymmetreScreen, { params: route.params });
    case 'ebi':
      return React.createElement(EBIScreen, { params: route.params });
    case 'alarms':
      return React.createElement(AlarmsScreen, null);
    case 'schedule':
      return React.createElement(ScheduleScreen, null);
    case 'reports':
      return React.createElement(ReportsScreen, null);
    case 'instructor':
      return React.createElement(InstructorScreen, null);
    case 'exercises':
      return window.ExerciseList
        ? React.createElement(window.ExerciseList, null)
        : React.createElement('div', { className: 'p-6 text-gray-300' }, 'Exercises unavailable.');
    case 'auth':
    default:
      return React.createElement(AuthScreen, null);
  }
}

// ─── App Component (Root with Context Providers) ────────────────────────────────

function App() {
  // Auth state — use AuthHelpers for full privilege methods if available
  const [authState, setAuthState] = useState(function() {
    if (window.AuthHelpers) {
      return window.AuthHelpers.createUnauthenticatedState();
    }
    return {
      authenticated: false,
      operator: '',
      securityLevel: 'ViewOnly',
      canWrite: function() { return false; },
      canAcknowledge: function() { return false; },
      canModifySchedules: function() { return false; },
      canConfigurePoints: function() { return false; },
      canManageAccounts: function() { return false; }
    };
  });

  // Mode state
  const [modeState, setModeState] = useState({
    currentMode: 'explore'
  });

  // Simulation state
  const [simulationState, setSimulationState] = useState({
    currentRow: 1,
    speed: 'pause',
    interpolationFraction: 0
  });

  // Point Registry state
  const [pointRegistryState, setPointRegistryState] = useState({
    points: new Map(),
    getValue: () => null,
    setValue: () => {},
    subscribe: () => {},
    unsubscribe: () => {}
  });

  // Alarm state
  const [alarmState, setAlarmState] = useState({
    alarms: []
  });

  // Expose state setters on window for other scripts to use
  // Plain-JS modules (the exercise store, the board's action log) need the signed-in
  // operator but sit outside React's context, so the current name is mirrored here.
  window.CTAAuthOperator = (authState && authState.operator) || null;
  // Same reason: the point-detail dialog gates its instructor-only tab on privilege
  // level, and it is opened from the board, the panels and the alarm list — threading
  // a prop through all three would leave whichever one forgot it showing the tab.
  window.CTAAuthLevel = (authState && authState.securityLevel) || null;
  window.setAuthState = setAuthState;
  window.setModeState = setModeState;
  window.setSimulationState = setSimulationState;
  window.setPointRegistryState = setPointRegistryState;
  window.setAlarmState = setAlarmState;

  // ─── Master tick driver ──────────────────────────────────────────────────
  // Connects SimulationEngine's clock to PointRegistry interpolation and
  // FaultEngine evaluation. Without this, the simulation clock advances but
  // point values never progress through the dataset and faults never fire.
  useEffect(function () {
    function handleTick(event) {
      // Advance every point's interpolated value to match the current row
      if (window.PointRegistry && typeof window.PointRegistry.interpolate === 'function') {
        window.PointRegistry.interpolate(event.rowIndex, event.interpolationFraction);
      }

      // Evaluate fault rules against the freshly interpolated values
      if (window.FaultEngine && window.PointRegistry && typeof window.FaultEngine.evaluate === 'function') {
        var valuesMap = new Map();
        var allPoints = window.PointRegistry.getAll();
        for (var i = 0; i < allPoints.length; i++) {
          valuesMap.set(allPoints[i].address, allPoints[i].currentValue);
        }
        var simHour = event.timestamp instanceof Date ? event.timestamp.getHours() : null;
        window.FaultEngine.evaluate(valuesMap, { simHour: simHour });
      }

      // AHU-4-4 has its own formula-driven state (not PointRegistry/BACnet
      // addressed), so it needs its own fault evaluation — the legacy
      // FaultEngine above never sees it. See AHU44NewFaultEngine.js for why
      // F-03/F-04-style rules aren't ported 1:1.
      if (window.AHU44NewFaultEngine && window.AHU44NewController &&
          typeof window.AHU44NewFaultEngine.evaluate === 'function') {
        window.AHU44NewFaultEngine.evaluate(window.AHU44NewController.getState());
      }

      // VAV-4-4-02 (Conference Room) is downstream of AHU-4-4: push the AHU's current
      // discharge air temp into each zone (this is what makes "Excessive
      // Reheat" a real, connected fault rather than an isolated number —
      // see VAVController.js's header), then evaluate each zone's fault
      // rules against its freshly-recalculated state.
      // Each zone pulls from its own upstream AHU — VAV-4-4-02 from AHU-4-4,
      // VAV-02-03 from AHU-4-6. This used to push AHU-4-4's supply air into every
      // zone, which was right when there was one zone and wrong once there were two.
      if (window.VAVController && typeof window.VAVController.syncFromUpstream === 'function') {
        window.VAVController.syncFromUpstream();
      }

      // Push TMY3 weather into every unit controller on each tick. AHU-4-4's
      // updateFromTMY3() existed but was only ever called from the retired
      // AHU44NewImageOverlay.jsx (dead code since SymmetreBoard.jsx became
      // the live renderer) — its oaTemperature/oaEnthalpy were silently
      // stuck at their static seed values. AHU-23-1 had no TMY3 wiring at
      // all until this pass. Fixed as part of Section C (manual weather
      // control) — a "release to live TMY" control is meaningless if the
      // unit was never actually following TMY3 to begin with.
      if (window.AHU46Controller && typeof window.AHU46Controller.updateFromTMY3 === 'function') {
        window.AHU46Controller.updateFromTMY3(event.rowIndex, event.interpolationFraction || 0);
      }
      if (window.AHU44NewController && typeof window.AHU44NewController.updateFromTMY3 === 'function') {
        window.AHU44NewController.updateFromTMY3(event.rowIndex, event.interpolationFraction || 0);
      }
      if (window.AHU23Controller && typeof window.AHU23Controller.updateFromTMY3 === 'function') {
        window.AHU23Controller.updateFromTMY3(event.rowIndex, event.interpolationFraction || 0);
      }

      // AHU-4-6 fault evaluation — was previously ONLY evaluated inside
      // AHU46VectorOverlay.jsx / AHU46ImageOverlay.jsx's own polling
      // interval, meaning activeAlarms never populated (and the Alarm
      // Summary screen's aggregation had nothing to show) unless a user
      // happened to currently be on the AHU-4-6 screen. Evaluating here,
      // on every tick regardless of which screen is mounted, matches how
      // AHU-4-4 and VAV already work above. SCENARIO_TRACKING.md item #19
      // follow-up (found while retiring the legacy FaultEngine.js
      // duplicates).
      if (window.AHU46FaultEngine && window.AHU46Controller &&
          typeof window.AHU46FaultEngine.evaluate === 'function') {
        window.AHU46FaultEngine.evaluate(window.AHU46Controller.getState(), window.AHU46Controller.getModes());
      }

      // LL97 energy/GHG accumulation — was never wired to the clock before
      // (pre-existing gap, not introduced here): LL97Accumulator.tick()
      // existed and was fully tested but nothing ever called it, so the
      // LL97 panel always showed zero. AHU-4-4's TMY3-driven outdoor
      // air temp is reused here as the seasonal-factor input — it's
      // already live weather data, no second weather source needed.
      if (window.LL97Accumulator && window.AHU44NewController &&
          typeof window.LL97Accumulator.tick === 'function') {
        var llOaTemp = window.AHU44NewController.getState().oaTemperature;
        window.LL97Accumulator.tick({ outdoorTemp: llOaTemp });
      }

      // Broadcast updated clock state to React tree
      setSimulationState({
        currentRow: event.rowIndex,
        speed: window.SimulationEngine ? window.SimulationEngine.speed : 'pause',
        interpolationFraction: event.interpolationFraction,
        timestamp: event.timestamp
      });
    }

    if (window.SimulationEngine && typeof window.SimulationEngine.onTick === 'function') {
      window.SimulationEngine.onTick(handleTick);
    }

    return function () {
      if (window.SimulationEngine && typeof window.SimulationEngine.offTick === 'function') {
        window.SimulationEngine.offTick(handleTick);
      }
    };
  }, []);

  // Provider order (outer to inner):
  // AuthContext → ModeContext → SimulationContext → PointRegistryContext → AlarmContext → Router
  return React.createElement(AuthContext.Provider, { value: authState },
    React.createElement(ModeContext.Provider, { value: modeState },
      React.createElement(SimulationContext.Provider, { value: simulationState },
        React.createElement(PointRegistryContext.Provider, { value: pointRegistryState },
          React.createElement(AlarmContext.Provider, { value: alarmState },
            React.createElement(Router, null)
          )
        )
      )
    )
  );
}

// Expose App and Router globally
window.App = App;
window.Router = Router;

// ─── Mount ──────────────────────────────────────────────────────────────────────

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
