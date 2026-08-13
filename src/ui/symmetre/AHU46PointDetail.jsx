/* AHU46PointDetail.jsx — Live point-detail modal for AHU-4-6
 *
 * Found missing when comparing the app against real BMS training videos
 * (08-13-26 conversation): clicking a value on the real SymmetrE AHU-4-6
 * screen opens a detail modal (General/Command Priorities/Alarms/History/
 * Recent Events tabs, vertical bar gauge, 4 status dots). AHU46VectorOverlay's
 * hotspots had no click handler at all.
 *
 * This is a NEW component, not a reuse of EBIPointSidebar/GeneralTab/etc —
 * those are all built entirely around window.PointRegistry.getMetadata(),
 * the same static/canned historical dataset flagged as disconnected from
 * live state throughout this project (see SCENARIO_TRACKING.md items #17,
 * #19, #20). Wiring AHU-4-6 hotspots into that system would show stale
 * canned data instead of the live value the user just clicked. This
 * component replicates the SAME visual design (verified against the real
 * BMS video frames) but reads exclusively from window.AHU46Controller /
 * window.AHU46FaultEngine — the live, SOO-compliant backend. Does not
 * modify AHU46Controller.js, AHU46FaultEngine.js, or any existing EBI file.
 *
 * Scope note: the real General/Alarms/History/Recent Events tabs
 * (GeneralTab.jsx, AlarmsTab.jsx — 477 lines, HistoryTab.jsx — 615 lines,
 * RecentEventsTab.jsx — 292 lines) are each substantial standalone
 * features built for the PointRegistry data model. Rebuilding all of that
 * depth for 20 live points was out of scope here — General and Alarms are
 * fully live and real; History and Recent Events use a lightweight
 * in-memory rolling buffer (see PointHistoryBuffer below) that starts
 * empty on page load, rather than the full trending infrastructure those
 * files have. Command Priorities is a simple live Manual/Auto control,
 * not the full priority-array editor the real tab implements.
 *
 * No import/export — exposes window.AHU46PointDetail
 */

const AHU46PointDetail = (function() {
  const { useState, useEffect, useRef, useContext } = React;

  // ─── Point metadata ─────────────────────────────────────────────────────────
  // address: real tag from the AHU-4-6 Points List document where confirmed
  // (TS-1, DA-1, V-A16/17, AFMS-1/3, CO2-1, CS-3 — see AHU_4_3_4_6_SOO
  // Points List image); a synthetic AV/BV-style address otherwise, since
  // these are software-calculated values (mixedAirTemp, mode flags, etc.)
  // with no physical BACnet point of their own in the real system.
  const POINT_METADATA = {
    oaCFM:                  { type: 'AI', address: 'AFMS-3',       name: 'Outside Air Flow',              min: 0,    max: 10000 },
    oaDamperPosition:       { type: 'AO', address: 'DA-1',         name: 'Variable Outside Air Damper',   min: 0,    max: 100   },
    mixedAirTemp:           { type: 'AV', address: 'TS-1',         name: 'Mixed Air Temp. Sensor',        min: 0,    max: 120   },
    preheatTemp:            { type: 'AV', address: 'AV1@AHU46',    name: 'Preheat Coil Discharge Temp',   min: 0,    max: 120   },
    phtValvePosition:       { type: 'AO', address: 'V-A16',        name: 'Preheat Coil Control Valve',    min: 0,    max: 100   },
    chwValvePosition:       { type: 'AO', address: 'V-A17',        name: 'Cooling Coil Control Valve',    min: 0,    max: 100   },
    cfm:                    { type: 'AI', address: 'AFMS-1',       name: 'Supply Air Flow',               min: 0,    max: 12000 },
    fanRunning:             { type: 'BV', address: 'BV1@AHU46',    name: 'Supply Fan Run Status',          min: 0,    max: 1     },
    interlockOn:            { type: 'BV', address: 'BV2@AHU46',    name: 'Fan Interlock Status',           min: 0,    max: 1     },
    supplyAirRH:            { type: 'AI', address: 'THS-3',        name: 'Supply Fan Discharge Humidity',  min: 0,    max: 100   },
    supplyAirTemp:          { type: 'AV', address: 'AV2@AHU46',    name: 'Supply Air Temperature',         min: 0,    max: 120   },
    returnAirTemp:          { type: 'AI', address: 'THS-4',        name: 'Return Air Temp. Sensor',        min: 0,    max: 120   },
    returnAirRH:            { type: 'AI', address: 'THS-4',        name: 'Return Air Humidity Sensor',     min: 0,    max: 100   },
    co2Sensor:               { type: 'AI', address: 'CO2-1',        name: 'Return Air CO2 Sensor to VAVs', min: 0,    max: 2000  },
    freezePumpOn:            { type: 'BV', address: 'CS-3',         name: 'Freeze Protection Pump Status', min: 0,    max: 1     },
    exhaustDamperPct:        { type: 'AO', address: 'DA-3',         name: 'Spill Air Damper',              min: 0,    max: 100   },
    commonDamperOpen:        { type: 'BV', address: 'BV3@AHU46',    name: 'Common Damper Open Status',     min: 0,    max: 1     },
    ductStaticPressure:      { type: 'AI', address: 'SPS-AN',       name: 'Supply Air Remote Static Pressure', min: 0, max: 5   },
    returnFanCFM:            { type: 'AI', address: 'AFMS-2',       name: 'Return Air Flow',               min: 0,    max: 10000 },
    returnAirDamperPosition: { type: 'AO', address: 'DA-2',         name: 'Variable Return Air Damper',    min: 0,    max: 100   },
    spillDamperPosition:     { type: 'AO', address: 'DA-3',         name: 'Spill Air Damper',              min: 0,    max: 100   },
  };

  const SETTABLE_TYPES = { AO: true, AV: true }; // AI/BV are field readings — no Manual mode of their own

  const TABS = ['General', 'Command Priorities', 'Alarms', 'History', 'Recent Events'];

  const RED_COLOR = '#FF0000';
  const PURPLE_COLOR = '#9333EA';
  const GRAY_COLOR = '#9CA3AF';
  const HOLLOW_GRAY = '#6B7280';
  const BAR_FILL_COLOR = '#00BFFF';

  // ─── Lightweight live history buffer ───────────────────────────────────────
  // Not a full trending system (see file header) — a capped in-memory ring
  // buffer per stateKey, recorded from whatever tick rate AHU46Controller
  // subscribers already get. Starts empty each page load; this is a
  // simulator, not a historian with disk-backed storage.
  //
  // Seeded on load with REAL historical data where available — Lev's BMS
  // exports (BMS_Exports.zip), already converted into src/data/points/*.js
  // and loaded into window.PointRegistry at boot via POINT_CATALOG (see
  // index.html). PointRegistry.getMetadata() deliberately strips the raw
  // `data` array, but getAll()/query() return the full point object
  // including it — no new loading mechanism needed, this data was already
  // sitting in memory. 9 of AHU-4-6's 10 exported points map cleanly onto
  // an existing hotspot/stateKey; AHU04_06SAFanSpeed (AO101@DEV4006, a %
  // VFD speed command) has no home here — this modal's closest point,
  // `cfm`, is AFMS-1, a physically different flow-meter reading with
  // different units. Forcing that mapping would silently misrepresent one
  // real point as another, so it's left unseeded rather than guessed at.
  const HISTORY_MAX_LIVE_POINTS = 120;   // live, on-change recording cap (unchanged from before)
  const HISTORY_MAX_REAL_POINTS = 1017;  // full real dataset — this IS the point of seeding it
  const historyBuffers = {}; // stateKey -> [{t, v, real}, ...], oldest first
  var historyRecorderStarted = false;
  var historySeeded = false;

  const STATE_KEY_TO_BACNET_ADDRESS = {
    ductStaticPressure:      'AI501@DEV4006', // AHU04_06BranchStaticPress
    chwValvePosition:        'AO102@DEV4006', // AHU04_06CHWCoilValve
    oaDamperPosition:        'AO104@DEV4006', // AHU04_06OADamper
    phtValvePosition:        'AO103@DEV4006', // AHU04_06PHTCoil01Valve
    co2Sensor:                'AI401@DEV4006', // AHU04_06RACO2
    returnAirRH:              'AI402@DEV4006', // AHU04_06RAHumid
    returnAirTemp:            'AI201@DEV4006', // AHU04_06RATemp
    fanRunning:                'BI601@DEV4006', // AHU04_06RunSchedule
    supplyAirTemp:            'AI301@DEV4006', // AHU04_06SATemp
  };

  function seedHistoryFromRealData() {
    if (historySeeded) return;
    historySeeded = true;
    var registry = window.PointRegistry;
    if (!registry || !registry.getAll) return;
    var allPoints = registry.getAll();
    var sessionStart = Date.now();

    Object.keys(STATE_KEY_TO_BACNET_ADDRESS).forEach(function(stateKey) {
      var address = STATE_KEY_TO_BACNET_ADDRESS[stateKey];
      var point = allPoints.find(function(p) { return p.address === address; });
      if (!point || !point.data || point.data.length === 0) return;

      // point.data is a raw 1017-hourly-value array with no stored
      // timestamps (dropped during the xlsx->js conversion — see
      // scripts/convert-bms-data.js). Rather than fabricate specific
      // calendar dates the converted file doesn't actually contain,
      // timestamps here are reconstructed as "N hours before this
      // session started" — an honest approximation, not a claim to know
      // the real dates, clearly labeled as such in the History tab.
      var n = point.data.length;
      var seeded = point.data.map(function(v, i) {
        return { t: sessionStart - (n - i) * 3600 * 1000, v: v, real: true };
      });
      historyBuffers[stateKey] = seeded;
    });
  }

  function startHistoryRecorder() {
    if (historyRecorderStarted) return;
    historyRecorderStarted = true;
    seedHistoryFromRealData();
    var ctrl = window.AHU46Controller;
    if (!ctrl || !ctrl.subscribe) return;
    ctrl.subscribe(function(s) {
      var now = Date.now();
      Object.keys(POINT_METADATA).forEach(function(key) {
        var v = s[key];
        if (typeof v !== 'number' && typeof v !== 'boolean') return;
        var numeric = typeof v === 'boolean' ? (v ? 1 : 0) : v;
        if (!historyBuffers[key]) historyBuffers[key] = [];
        var buf = historyBuffers[key];
        var last = buf[buf.length - 1];
        // Only record on actual change, not every tick — keeps Recent
        // Events meaningful (a log of transitions) rather than noise.
        if (!last || last.v !== numeric) {
          buf.push({ t: now, v: numeric, real: false });
          // Cap only the LIVE portion of the buffer — never trim real
          // seeded data. Without this distinction, buf.length would
          // already exceed a flat 120-point cap right after seeding
          // ~1000 real points, and the very first few live changes would
          // silently start deleting real historical data instead of
          // capping themselves.
          var liveCount = buf.reduce(function(n, p) { return p.real ? n : n + 1; }, 0);
          if (liveCount > HISTORY_MAX_LIVE_POINTS) {
            var idx = buf.findIndex(function(p) { return !p.real; });
            if (idx !== -1) buf.splice(idx, 1);
          }
        }
      });
    });
  }

  // ─── Shared visual pieces (styled to match PointSidebar.jsx) ──────────────

  function BarChart({ value, min, max }) {
    var range = max - min;
    var fillPercent = 0;
    if (range > 0) fillPercent = Math.max(0, Math.min(100, ((value - min) / range) * 100));
    return React.createElement('div', { className: 'w-full flex justify-center mb-4' },
      React.createElement('div', {
        className: 'relative w-10 h-40 border border-gray-600 rounded-sm',
        style: { backgroundColor: '#000' }
      },
        React.createElement('div', {
          className: 'absolute bottom-0 left-0 right-0 rounded-b-sm transition-all duration-300',
          style: { backgroundColor: BAR_FILL_COLOR, height: fillPercent + '%' },
          role: 'meter', 'aria-valuenow': value, 'aria-valuemin': min, 'aria-valuemax': max,
        }),
        React.createElement('span', { className: 'absolute -right-8 top-0 text-xs text-gray-400' }, max),
        React.createElement('span', { className: 'absolute -right-8 bottom-0 text-xs text-gray-400' }, min)
      )
    );
  }

  function StatusDot({ label, active, activeColor }) {
    return React.createElement('div', { className: 'flex flex-col items-center gap-1', title: label + ': ' + (active ? 'Active' : 'Inactive') },
      React.createElement('svg', { width: 14, height: 14 },
        active
          ? React.createElement('circle', { cx: 7, cy: 7, r: 5, fill: activeColor, stroke: activeColor, strokeWidth: 1 })
          : React.createElement('circle', { cx: 7, cy: 7, r: 5, fill: 'none', stroke: HOLLOW_GRAY, strokeWidth: 1.5 })
      ),
      React.createElement('span', { className: 'text-xs text-gray-500 leading-none' }, label)
    );
  }

  // ─── General tab ────────────────────────────────────────────────────────────

  function GeneralTabContent({ stateKey, meta, value, units }) {
    function Row({ label, val }) {
      return React.createElement('div', { className: 'flex items-center py-2 px-4 border-b border-gray-700' },
        React.createElement('span', { className: 'text-gray-400 text-sm w-44 flex-shrink-0' }, label),
        React.createElement('span', { className: 'text-white text-sm font-mono bg-gray-800 px-3 py-1 rounded border border-gray-600 flex-1' },
          val !== undefined && val !== null && val !== '' ? String(val) : '—')
      );
    }
    return React.createElement('div', { className: 'bg-gray-900 h-full overflow-y-auto' },
      React.createElement('div', { className: 'px-4 py-3 border-b border-gray-700' },
        React.createElement('h3', { className: 'text-cyan-400 text-sm font-semibold uppercase tracking-wide' }, 'Point Configuration')),
      React.createElement('div', { className: 'py-2' },
        React.createElement(Row, { label: 'Name', val: meta.name }),
        React.createElement(Row, { label: 'Technical Address', val: meta.address }),
        React.createElement(Row, { label: 'Point Type', val: meta.type }),
        React.createElement(Row, { label: 'Engineering Units', val: units || '—' }),
        React.createElement(Row, { label: 'Range', val: meta.min + ' – ' + meta.max + (units ? ' ' + units : '') }),
      ),
      React.createElement('div', { className: 'px-4 py-3 mt-4 border-t border-gray-700' },
        React.createElement('span', { className: 'text-gray-500 text-xs uppercase tracking-wide' }, 'Subsystem: AHU-4-6'))
    );
  }

  // ─── Command Priorities tab ─────────────────────────────────────────────────
  // Simplified — real EBI shows a 16-level BACnet priority array. This shows
  // the same live Manual/Auto state ControlsSidebar already exposes via
  // setValue()/getModes(), which is the actual mechanism this simulator uses.

  function CommandPrioritiesContent({ stateKey, meta, isManual }) {
    var auth = useContext(window.AuthContext);
    var canWrite = window.AuthHelpers ? window.AuthHelpers.hasPrivilege((auth && auth.securityLevel) || 'ViewOnly', 'Oper') : false;
    var settable = SETTABLE_TYPES[meta.type];

    if (!settable) {
      return React.createElement('div', { className: 'p-6 text-gray-400 text-sm' },
        meta.type + ' points are field readings — they have no command priority array of their own (nothing writes to them; they only report what the field device measures).');
    }

    return React.createElement('div', { className: 'p-6 space-y-4' },
      React.createElement('div', { className: 'text-sm text-gray-300' },
        'Current control authority: ',
        React.createElement('span', { className: isManual ? 'text-purple-400 font-semibold' : 'text-gray-400' },
          isManual ? 'Manual (operator override active)' : 'Auto (program-controlled)')
      ),
      isManual && React.createElement('div', { className: 'text-xs text-amber-500' },
        'Note: this simulator has no mechanism yet to release a point back to Auto once set to Manual (AHU46Controller.js\'s setValue() latches modes[key] permanently) — a real, separate backend gap, not something this modal can fix without touching the controller. Real EBI supports 16 priority levels (Manual Operator is priority 8); releasing that priority level restores whatever the next-highest active priority commands.'),
      React.createElement('div', { className: 'text-xs text-gray-500' },
        'This simulator models a simpler two-state Auto/Manual, matching what ControlsSidebar.jsx actually implements — not the full 16-level priority array.'),
    );
  }

  // ─── Alarms tab — fully live, from AHU46FaultEngine ────────────────────────

  function AlarmsTabContent({ stateKey }) {
    var [alarms, setAlarms] = useState([]);
    useEffect(function() {
      function refresh() {
        var engine = window.AHU46FaultEngine;
        if (!engine || !engine.rules || !engine.getAllAlarms) return;
        var relatedRuleIds = engine.rules
          .filter(function(r) { return (r.relatedStateKeys || []).indexOf(stateKey) !== -1; })
          .map(function(r) { return r.id; });
        var all = engine.getAllAlarms();
        setAlarms(all.filter(function(a) { return relatedRuleIds.indexOf(a.condition) !== -1; }));
      }
      refresh();
      var interval = setInterval(refresh, 1000);
      return function() { clearInterval(interval); };
    }, [stateKey]);

    if (alarms.length === 0) {
      return React.createElement('div', { className: 'p-6 text-gray-500 text-sm' }, 'No active or acknowledged alarms reference this point right now.');
    }

    return React.createElement('div', { className: 'divide-y divide-gray-700' },
      alarms.map(function(a) {
        return React.createElement('div', { key: a.condition, className: 'p-4' },
          React.createElement('div', { className: 'flex items-center gap-2' },
            React.createElement('span', { className: 'text-xs font-mono px-2 py-0.5 rounded bg-gray-800 text-cyan-400' }, a.condition),
            React.createElement('span', { className: 'text-xs uppercase text-gray-500' }, a.priority),
            a.acknowledged
              ? React.createElement('span', { className: 'text-xs text-gray-500' }, '(acknowledged' + (a.operator ? ' — ' + a.operator : '') + ')')
              : React.createElement('span', { className: 'text-xs text-red-400 animate-pulse' }, '● unacknowledged')
          ),
          React.createElement('div', { className: 'text-sm text-gray-300 mt-1' }, a.description),
          React.createElement('div', { className: 'text-xs text-gray-500 mt-1' }, new Date(a.timestamp).toLocaleString())
        );
      })
    );
  }

  // ─── History tab — lightweight live rolling buffer ─────────────────────────

  function HistoryTabContent({ stateKey, units }) {
    var [, forceTick] = useState(0);
    useEffect(function() {
      var interval = setInterval(function() { forceTick(function(n) { return n + 1; }); }, 2000);
      return function() { clearInterval(interval); };
    }, []);

    var points = historyBuffers[stateKey] || [];
    if (points.length === 0) {
      return React.createElement('div', { className: 'p-6 text-gray-500 text-sm' },
        'No history recorded yet this session. This simulator keeps a short live rolling buffer (not disk-backed trending) — values start appearing here once they change. ',
        React.createElement('span', { className: 'block mt-2 text-xs text-gray-600' },
          'Real BMS point history is a paid, per-point subscription — a blank trend here mirrors that "not everything is trended" reality, per the BMS training material.'));
    }

    var realCount = points.filter(function(p) { return p.real; }).length;
    var liveCount = points.length - realCount;

    var vals = points.map(function(p) { return p.v; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var range = (max - min) || 1;
    var w = 560, h = 160, pad = 8;

    function xOf(i) { return pad + (i / Math.max(1, points.length - 1)) * (w - 2 * pad); }
    function yOf(v) { return h - pad - ((v - min) / range) * (h - 2 * pad); }

    function pathFor(slice, offset) {
      return slice.map(function(p, i) {
        var x = xOf(i + offset);
        var y = yOf(p.v);
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
    }

    var realPoints = points.slice(0, realCount);
    var livePoints = points.slice(realCount);
    // Draw one extra shared point at the boundary so the two segments connect visually
    var realPath = pathFor(realCount > 0 ? realPoints : [], 0);
    var livePath = livePoints.length > 0
      ? pathFor(realCount > 0 ? [realPoints[realPoints.length - 1]].concat(livePoints) : livePoints, realCount > 0 ? realCount - 1 : 0)
      : '';

    return React.createElement('div', { className: 'p-4' },
      React.createElement('div', { className: 'text-xs text-gray-500 mb-2' },
        realCount > 0
          ? realCount + ' real hourly readings (Lev\'s BMS export, ending when this session started) + ' + liveCount + ' recorded this session'
          : points.length + ' recorded change' + (points.length === 1 ? '' : 's') + ' this session',
        ' — range ' + min.toFixed(1) + ' to ' + max.toFixed(1) + (units ? ' ' + units : '')),
      React.createElement('svg', { width: w, height: h, className: 'bg-gray-950 border border-gray-700 rounded' },
        realCount > 0 && React.createElement('path', { d: realPath, fill: 'none', stroke: BAR_FILL_COLOR, strokeWidth: 1.5, opacity: 0.75 }),
        livePath && React.createElement('path', { d: livePath, fill: 'none', stroke: '#FBBF24', strokeWidth: 2 }),
      ),
      realCount > 0 && React.createElement('div', { className: 'flex items-center gap-4 mt-2 text-xs text-gray-500' },
        React.createElement('span', { className: 'flex items-center gap-1' },
          React.createElement('span', { className: 'inline-block w-3 h-0.5', style: { backgroundColor: BAR_FILL_COLOR, opacity: 0.75 } }), 'Real export'),
        liveCount > 0 && React.createElement('span', { className: 'flex items-center gap-1' },
          React.createElement('span', { className: 'inline-block w-3 h-0.5', style: { backgroundColor: '#FBBF24' } }), 'This session')
      )
    );
  }

  // ─── Recent Events tab — same buffer, shown as a transition log ───────────

  function RecentEventsContent({ stateKey, units }) {
    var [, forceTick] = useState(0);
    useEffect(function() {
      var interval = setInterval(function() { forceTick(function(n) { return n + 1; }); }, 2000);
      return function() { clearInterval(interval); };
    }, []);

    var points = (historyBuffers[stateKey] || []).slice().reverse();
    if (points.length === 0) {
      return React.createElement('div', { className: 'p-6 text-gray-500 text-sm' }, 'No transitions recorded yet this session.');
    }
    return React.createElement('div', { className: 'divide-y divide-gray-800' },
      points.slice(0, 30).map(function(p, i) {
        // Real entries use a reconstructed timestamp (see seedHistoryFromRealData)
        // that isn't the actual recorded time — showing it as a clock time would
        // misrepresent an approximation as fact. Live entries have a real Date.now().
        var whenLabel = p.real
          ? Math.round((Date.now() - p.t) / 3600000) + 'h before session start (real export)'
          : new Date(p.t).toLocaleTimeString();
        return React.createElement('div', { key: i, className: 'flex justify-between px-4 py-2 text-sm' },
          React.createElement('span', { className: 'text-gray-500 text-xs' }, whenLabel),
          React.createElement('span', { className: 'text-white font-mono' }, p.v + (units ? ' ' + units : ''))
        );
      })
    );
  }

  // ─── Main modal ─────────────────────────────────────────────────────────────

  function AHU46PointDetail({ stateKey, onClose }) {
    var [activeTab, setActiveTab] = useState('General');
    var [state, setState] = useState(function() {
      return window.AHU46Controller ? window.AHU46Controller.getState() : {};
    });
    var [isManual, setIsManual] = useState(function() {
      var ctrl = window.AHU46Controller;
      return !!(ctrl && ctrl.getModes && ctrl.getModes()[stateKey] === 'Manual');
    });

    useEffect(function() {
      startHistoryRecorder();
      var ctrl = window.AHU46Controller;
      if (!ctrl || !ctrl.subscribe) return;
      var unsub = ctrl.subscribe(function(s) {
        setState(s);
        if (ctrl.getModes) setIsManual(ctrl.getModes()[stateKey] === 'Manual');
      });
      return unsub;
    }, [stateKey]);

    // Escape key closes the modal — standard modal affordance
    useEffect(function() {
      function onKey(e) { if (e.key === 'Escape') onClose(); }
      window.addEventListener('keydown', onKey);
      return function() { window.removeEventListener('keydown', onKey); };
    }, [onClose]);

    var meta = POINT_METADATA[stateKey];
    if (!meta) return null; // defensively — every hotspot's stateKey should have metadata

    var rawValue = state[stateKey];
    var numericValue = typeof rawValue === 'boolean' ? (rawValue ? 1 : 0) : (typeof rawValue === 'number' ? rawValue : 0);
    var displayValue = typeof rawValue === 'boolean' ? (rawValue ? 'ON' : 'OFF') : (typeof rawValue === 'number' ? rawValue.toFixed(1) : String(rawValue));
    var units = (function() {
      // Reuse the same units strings AHU46VectorOverlay's HOTSPOTS array uses,
      // duplicated here since there's no shared module system in this app.
      var unitsMap = {
        oaCFM: 'CFM', oaDamperPosition: '%', mixedAirTemp: '°F', preheatTemp: '°F',
        phtValvePosition: '%', chwValvePosition: '%', cfm: 'CFM', fanRunning: '', interlockOn: '',
        supplyAirRH: '%RH', supplyAirTemp: '°F', returnAirTemp: '°F', returnAirRH: '%RH',
        co2Sensor: 'PPM', freezePumpOn: '', exhaustDamperPct: '%', commonDamperOpen: '',
        ductStaticPressure: 'IWC', returnFanCFM: 'CFM', returnAirDamperPosition: '%', spillDamperPosition: '%',
      };
      return unitsMap[stateKey] || '';
    })();

    // Alarm/fault dots — same relatedStateKeys lookup the Alarms tab uses
    var alarmActive = false;
    var engine = window.AHU46FaultEngine;
    if (engine && engine.rules && engine.getActiveAlarms) {
      var relatedRuleIds = engine.rules.filter(function(r) { return (r.relatedStateKeys || []).indexOf(stateKey) !== -1; }).map(function(r) { return r.id; });
      alarmActive = engine.getActiveAlarms().some(function(a) { return relatedRuleIds.indexOf(a.condition) !== -1; });
    }

    return React.createElement('div', {
      className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60',
      onClick: onClose,
      role: 'dialog', 'aria-modal': 'true', 'aria-label': meta.name + ' point detail',
    },
      React.createElement('div', {
        className: 'bg-gray-900 border border-gray-600 rounded shadow-2xl flex',
        style: { width: '900px', maxWidth: '95vw', height: '600px', maxHeight: '90vh' },
        onClick: function(e) { e.stopPropagation(); },
      },
        // Left sidebar — mirrors PointSidebar.jsx's visual design
        React.createElement('div', { className: 'w-48 bg-gray-900 border-r border-gray-700 p-4 flex flex-col items-center flex-shrink-0' },
          React.createElement(BarChart, { value: numericValue, min: meta.min, max: meta.max }),
          React.createElement('div', { className: 'flex items-center justify-center gap-4 mb-4 py-2' },
            React.createElement(StatusDot, { label: 'Alarm', active: alarmActive, activeColor: RED_COLOR }),
            React.createElement(StatusDot, { label: 'Fault', active: false, activeColor: PURPLE_COLOR }),
            React.createElement(StatusDot, { label: 'Ovrd', active: isManual, activeColor: PURPLE_COLOR }),
            React.createElement(StatusDot, { label: 'OOS', active: false, activeColor: GRAY_COLOR }),
          ),
          React.createElement('div', { className: 'text-center mb-4' },
            React.createElement('div', { className: 'text-2xl font-bold text-white' }, displayValue),
            React.createElement('div', { className: 'text-sm text-gray-400' }, units)
          ),
          React.createElement('div', { className: 'text-center' },
            React.createElement('span', {
              className: isManual ? 'inline-block px-3 py-1 text-sm font-semibold text-white rounded' : 'inline-block px-3 py-1 text-sm text-gray-300',
              style: isManual ? { backgroundColor: PURPLE_COLOR } : {}
            }, isManual ? 'Manual' : 'Auto')
          )
        ),
        // Right — header, tabs, content
        React.createElement('div', { className: 'flex-1 flex flex-col min-w-0' },
          React.createElement('div', { className: 'flex items-center justify-between px-4 py-3 border-b border-gray-700' },
            React.createElement('div', null,
              React.createElement('div', { className: 'text-xs text-gray-500' }, 'AHU-4-6 / ' + meta.address),
              React.createElement('div', { className: 'text-white font-semibold' }, meta.name)
            ),
            React.createElement('button', {
              className: 'text-gray-400 hover:text-white text-xl leading-none px-2',
              onClick: onClose, 'aria-label': 'Close',
            }, '\u00D7')
          ),
          React.createElement('div', { className: 'flex border-b border-gray-700 flex-shrink-0 overflow-x-auto' },
            TABS.map(function(tab) {
              return React.createElement('button', {
                key: tab,
                className: 'px-4 py-2 text-sm whitespace-nowrap ' + (activeTab === tab ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-gray-200'),
                onClick: function() { setActiveTab(tab); },
              }, tab);
            })
          ),
          React.createElement('div', { className: 'flex-1 overflow-y-auto' },
            activeTab === 'General' && React.createElement(GeneralTabContent, { stateKey: stateKey, meta: meta, value: rawValue, units: units }),
            activeTab === 'Command Priorities' && React.createElement(CommandPrioritiesContent, { stateKey: stateKey, meta: meta, isManual: isManual }),
            activeTab === 'Alarms' && React.createElement(AlarmsTabContent, { stateKey: stateKey }),
            activeTab === 'History' && React.createElement(HistoryTabContent, { stateKey: stateKey, units: units }),
            activeTab === 'Recent Events' && React.createElement(RecentEventsContent, { stateKey: stateKey, units: units }),
          )
        )
      )
    );
  }

  AHU46PointDetail.POINT_METADATA = POINT_METADATA;
  return AHU46PointDetail;
})();

window.AHU46PointDetail = AHU46PointDetail;
