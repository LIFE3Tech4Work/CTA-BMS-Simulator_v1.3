/**
 * SymmetreBoard.jsx — SymmetrE vector graphic board for AHU-4-6 / AHU-4-4 /
 * AHU-23-1.
 *
 * Replaces the PNG-screenshot + percentage-hotspot overlays with the hand-built
 * vector artwork and the fixed-coordinate value chips from the CTA BMS Design
 * project. The data layer is unchanged v1.3: every chip reads its value from the
 * unit's existing controller via subscribe(), commands write back through
 * setValue(), and alarm state comes from the unit's existing fault engine.
 *
 *   artwork      → window.SymmetreBoardArt   (assets/vector/boardArt.js)
 *   chip schema  → window.SymmetreBoardPoints (boardPoints.js)
 *   modal        → window.PointDialog        (ui/ebi/PointDialog.jsx)
 *
 * The board is a fixed 1613×878 stage scaled to fit its container, so every
 * chip coordinate is exact rather than a re-calibrated percentage.
 *
 * No import/export — exposed as window.SymmetreBoard
 */

const SymmetreBoard = (function () {
  'use strict';

  const { useState, useEffect, useRef, useLayoutEffect } = React;

  const BOARD_W = 1613, BOARD_H = 878;

  const BG_STORE_KEY = 'cta_board_bg';

  function currentBg() {
    try {
      var q = (window.location.hash || '').match(/[?&]bg=([a-z]+)/);
      if (q) { localStorage.setItem(BG_STORE_KEY, q[1]); return q[1]; }
      var saved = localStorage.getItem(BG_STORE_KEY);
      // 'slate' was the previous default and has been retired in favour of
      // 'glacier'; migrate anyone still holding it so they get the new board.
      if (!saved || saved === 'slate') {
        localStorage.setItem(BG_STORE_KEY, 'glacier');
        return 'glacier';
      }
      return saved;
    } catch (e) { return 'glacier'; }
  }

  // Operator action log, shared across board mounts so the modal's Recent
  // Events tab survives navigating between unit views.
  const eventLog = [];

  function stamp() {
    const d = new Date();
    const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const hh = d.getHours() % 12 || 12;
    const ap = d.getHours() < 12 ? 'AM' : 'PM';
    return String(d.getDate()).padStart(2, '0') + '-' + MO[d.getMonth()] + '-' + String(d.getFullYear()).slice(2) +
      ' ' + String(hh).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') +
      ':' + String(d.getSeconds()).padStart(2, '0') + ' ' + ap;
  }

  // ─── Stage scaler ───────────────────────────────────────────────────────────
  // Two-phase sizing, so a narrow window doesn't shrink the schematic into
  // illegibility:
  //
  //   1. RESPONSIVE band — the board scales to fit the pane on both axes
  //      (never above 1:1, so the artwork is never upscaled soft), and is
  //      centred in whatever space is left over.
  //   2. FLOOR — once fitting would push the board below MIN_SCALE, scaling
  //      stops and the pane scrolls instead. Values, units and device tags stay
  //      readable; the operator pans to the section they need.
  //
  // MIN_SCALE 0.58 keeps the smallest board type (10.5px device tags) at ~6px
  // on screen, which is the practical floor for reading a tag at a glance.

  const MIN_SCALE = 0.58;

  function useFitScale(ref) {
    const [fit, setFit] = useState({ scale: 1, pinned: false });
    useLayoutEffect(function () {
      const el = ref.current;
      if (!el) return;
      function measure() {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        const raw = Math.min(w / BOARD_W, h / BOARD_H);
        const capped = Math.min(raw, 1);
        const pinned = capped < MIN_SCALE;
        const next = { scale: pinned ? MIN_SCALE : capped, pinned: pinned };
        setFit(function (prev) {
          return (Math.abs(prev.scale - next.scale) < 0.0005 && prev.pinned === next.pinned) ? prev : next;
        });
      }
      measure();
      let ro = null;
      if (window.ResizeObserver) { ro = new ResizeObserver(measure); ro.observe(el); }
      window.addEventListener('resize', measure);
      return function () {
        if (ro) ro.disconnect();
        window.removeEventListener('resize', measure);
      };
    }, [ref]);
    return fit;
  }

  // ─── Chip ───────────────────────────────────────────────────────────────────

  function Chip({ row, value, manual, faulted, alarm, onOpen, label, unitId }) {
    const BP = window.SymmetreBoardPoints;
    const key = row[0], type = row[1], x = row[2], y = row[3], w = row[4];
    const align = row[5] || 'left', fs = row[6] || 13;
    const m = BP.meta(key, unitId) || {};
    const [hover, setHover] = useState(false);
    // Alarm and override colours. Faults are handled per chip type below rather than here:
    // this value feeds only the box branch, so putting a fault colour in it would look
    // wired while doing nothing for the pills, which is what every zone reading is.
    const color = alarm ? '#c21f14' : (manual ? '#c81fae' : null);
    const display = BP.format(key, value);
    const unit = m.unit || '';

    let st, vst, ust, boxSt = null;
    if (type === 'box') {
      st = { position: 'absolute', left: x + 'px', top: y + 'px', display: 'flex',
             alignItems: 'center', gap: '3px', whiteSpace: 'nowrap', cursor: 'pointer',
             lineHeight: 1, zIndex: 5 };
      boxSt = { minWidth: w + 'px', width: 'max-content', height: '21px', display: 'flex',
                alignItems: 'center', justifyContent: 'flex-end', padding: '0 6px',
                boxSizing: 'border-box', background: '#fff',
                border: '1.5px solid ' + (alarm ? '#e0342b' : '#8496b4'), borderRadius: '4px',
                boxShadow: 'inset 0 1px 2px rgba(30,50,90,.1)',
                animation: alarm ? 'bms-ring 1.1s infinite' : 'none' };
      vst = { fontSize: '14px', fontWeight: 700, color: color || '#12294f', flexShrink: 0 };
      ust = { fontSize: '11px', fontWeight: 800, color: '#12294f', flexShrink: 0 };
      if ((manual || m.kind === 'ao' || m.kind === 'bi' || m.kind === 'bo') && !alarm) {
        boxSt.background = '#e3e8f0';
        boxSt.border = '1.5px solid #a9b6c9';
        boxSt.boxShadow = 'none';
      }
      // Economizer Signal previously read identically to every other plain
      // ON/OFF box — no visual cue distinguished "free cooling active" from
      // any other calculated status (checklist item: "No visual indication
      // when the economizer turns on/off"). A distinct green highlight when
      // ON makes it scannable on the board itself, not just readable text.
      if (key === 'economizerActive' && value === true && !alarm) {
        boxSt.background = '#dcf5e3';
        boxSt.border = '1.5px solid #2f9e56';
        boxSt.boxShadow = '0 0 0 1px rgba(47,158,86,.25)';
        if (!manual) vst.color = '#1a7a3d';
      }
    } else {
      st = { position: 'absolute', top: (y - 16) + 'px', display: 'flex', alignItems: 'baseline',
             gap: '2px', padding: '2px 7px', borderRadius: '5px',
             background: alarm ? 'linear-gradient(180deg,#8a2018,#5f1410)'
               // A broken device reads BLACK, distinct from both a healthy pill and the
               // magenta of a deliberate override. The `color` value above is only
               // consumed by the box branch, so the pill needs its own fill — without
               // this, a faulted pill was pixel-identical to a healthy one and grey text
               // was the only cue, which reads as "dimmed" rather than "do not trust".
               : (faulted ? 'linear-gradient(180deg,#22262e,#0e1116)'
                          : 'linear-gradient(180deg,#43556f,#2c3a51)'),
             border: '1px solid ' + (alarm ? '#ff5a49' : (faulted ? '#4a5364' : '#1c2636')),
             boxShadow: '0 1px 2px rgba(0,0,0,.28)', cursor: 'pointer', whiteSpace: 'nowrap',
             lineHeight: 1, zIndex: 5, animation: alarm ? 'bms-ring 1.1s infinite' : 'none' };
      if (align === 'right') st.right = (BOARD_W - x) + 'px';
      else if (align === 'center') { st.left = x + 'px'; st.transform = 'translateX(-50%)'; }
      else st.left = x + 'px';
      vst = { fontSize: fs + 'px', fontWeight: 800,
              // Near-white on the dark fault fill: grey-on-slate read as "dimmed", which
              // is the wrong signal for a reading that is actively wrong.
              color: alarm ? '#fff' : (faulted ? '#e6e9ef' : (manual ? '#ff9bec' : '#eef3fb')) };
      ust = { fontSize: '10px', fontWeight: 800, color: alarm ? '#ffd0c9' : '#9db0c8' };
    }

    if (hover) {
      st = Object.assign({}, st, { filter: 'brightness(1.06)' });
      if (boxSt) boxSt = Object.assign({}, boxSt, { boxShadow: '0 0 0 2px #2d6fd0' });
      else st.boxShadow = '0 0 0 2px #2d6fd0';
    }

    const inner = boxSt || { display: 'flex', alignItems: 'baseline', gap: '2px' };

    return React.createElement('div', {
      style: st,
      onClick: onOpen,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      title: label + ': ' + display + (unit ? ' ' + unit : '') +
        (faulted ? ' \u2014 SENSOR FAULT, reading not trustworthy'
                 : (manual ? ' \u2014 MANUAL override' : '')) +
        (alarm ? ' \u2014 ALARM ACTIVE' : '') + ' (click for point detail)',
      role: 'button',
      tabIndex: 0,
      'aria-label': label + ' ' + display + ' ' + unit + ', activate to open point detail',
      onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
    },
      React.createElement('div', { style: inner },
        React.createElement('span', { style: vst }, display)
      ),
      unit ? React.createElement('span', { style: ust }, unit) : null,
      (faulted || manual) ? React.createElement('span', {
        style: { position: 'absolute', top: '-8px', right: '-6px', minWidth: '14px', height: '14px',
                 padding: '0 2px', borderRadius: '4px', fontSize: '10px', fontWeight: 800,
                 display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                 background: faulted ? '#2a2f38' : '#c81fae', border: '1px solid #fff',
                 boxShadow: '0 1px 2px rgba(0,0,0,.3)', zIndex: 6 },
        title: faulted ? 'Sensor fault \u2014 this reading is not trustworthy'
                       : 'Manual override active',
      }, faulted ? 'F' : 'M') : null
    );
  }

  // ─── Fan command block ──────────────────────────────────────────────────────

  // Flip a point in whatever shape it holds, so an 'ON'/'OFF' status point
  // doesn't come back as a boolean and stop matching its own display.
  function invertOf(v) {
    if (typeof v === 'boolean') return !v;
    if (typeof v === 'number') return v ? 0 : 1;
    const s = String(v).toUpperCase();
    if (s === 'ON') return 'OFF';
    if (s === 'OFF') return 'ON';
    if (s === 'START') return 'STOP';
    if (s === 'STOP') return 'START';
    if (s === 'OPEN') return 'CLOSED';
    if (s === 'CLOSED') return 'OPEN';
    return !v;
  }

  function FanBlock({ cfg, on, cmdOn, interlock, showInterlock, onOpen, onToggle, starting, secsLeft, overridden }) {
    const bg = starting
      ? 'linear-gradient(180deg,#f5c46a,#d18b16)'
      : (on ? 'linear-gradient(180deg,#5fd694,#22a35d)' : 'linear-gradient(180deg,#e88f88,#c0332b)');
    const seg = (active) => ({
      position: 'absolute', top: 0, height: '100%', width: '50%', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800,
      letterSpacing: '0.4px', color: active ? (on ? '#157a41' : '#ab2018') : 'rgba(255,255,255,0.82)',
      textShadow: active ? 'none' : '0 1px 2px rgba(10,25,50,0.3)', transition: 'color 0.22s', zIndex: 1,
    });

    return React.createElement('div', {
      style: { position: 'absolute', left: cfg.x + 'px', top: cfg.y + 'px', width: '205px',
               height: '64px', borderRadius: '12px', background: bg,
               border: '1.4px solid ' + (starting ? '#ffe0a0' : (on ? '#9ff0c2' : '#eeaba4')),
               cursor: 'pointer',
               color: '#fff', textAlign: 'center', boxShadow: '0 3px 8px rgba(20,60,40,.22)', zIndex: 4 },
      onClick: onOpen,
      title: 'Open point detail',
    },
      React.createElement('div', {
        style: { position: 'absolute', left: '27px', top: '6px', width: '151px', height: '22px',
                 borderRadius: '11px', background: 'rgba(10,24,18,0.30)',
                 border: '1px solid rgba(255,255,255,0.38)',
                 boxShadow: 'inset 0 1.5px 4px rgba(0,0,0,0.35)', cursor: 'pointer',
                 zIndex: 5, overflow: 'hidden' },
        title: overridden
          ? ('Manual override \u2014 click to command ' + (cmdOn ? 'Shutdown' : 'Start'))
          : (cmdOn
            ? 'Click to command Shutdown (Run Schedule Off)'
            : 'Click to command Start (Run Schedule On)'),
        onClick: (e) => { e.stopPropagation(); onToggle(); },
      },
        React.createElement('div', {
          style: { position: 'absolute', top: '2px', bottom: '2px', width: 'calc(50% - 3px)',
                   left: cmdOn ? '2px' : 'calc(50% + 1px)', borderRadius: '10px',
                   background: 'linear-gradient(180deg,#ffffff,#e9eff7)',
                   boxShadow: '0 1px 3px rgba(10,20,40,0.45)', transition: 'left 0.22s ease' },
        }),
        React.createElement('div', { style: Object.assign(seg(cmdOn), { left: 0 }) }, 'START'),
        React.createElement('div', { style: Object.assign(seg(!cmdOn), { right: 0 }) }, 'SHUTDOWN')
      ),
      starting
        ? React.createElement('div', {
            style: { position: 'absolute', left: 0, top: '30px', width: '205px', lineHeight: 1 },
          },
            React.createElement('span', { style: { fontSize: '14px', fontWeight: 800, letterSpacing: '.4px' } }, 'STARTING'),
            React.createElement('span', { style: { fontSize: '13px', fontWeight: 800, marginLeft: '6px', opacity: .95 } },
              Math.max(0, Math.round(secsLeft || 0)) + 's')
          )
        : React.createElement('div', {
            style: { position: 'absolute', left: 0, top: '31px', width: '205px', fontSize: '20px',
                     fontWeight: 800, lineHeight: 1 },
          }, (on ? 'ON' : 'OFF') + (overridden ? ' \u00b7 MANUAL' : ''))
    );
  }

  // ─── Alarm pill stacks ──────────────────────────────────────────────────────

  const STACK_DEFS = [
    ['interlock_tamper', 'INTERLOCK TAMPER', 0, 0, 205, 16],
    ['interlock_fail', 'INTERLOCK FAIL', 0, 17, 205, 16],
    ['fail', 'FAIL', 0, 34, 205, 16],
    ['hi_suction', 'HI SUCTION', 0, 51, 100, 16],
    ['hi_pressure', 'HI PRESSURE', 102, 51, 103, 16],
    ['tamper', 'TAMPER', 0, 68, 100, 16],
    ['vfd_fault', 'VFD FAULT', 102, 68, 103, 16],
  ];

  const STACK_DEFS_U23 = [
    ['', 'FAN SHUTDOWN: AUTO', 0, 0, 205, 16],
    ['', 'FAN START: AUTO', 0, 17, 205, 16],
    ['low_air', 'LOW AIRFLOW', 0, 34, 205, 16],
    ['', 'SUCTION PRES', 0, 51, 100, 16],
    ['', 'STATIC PRES', 102, 51, 103, 16],
    ['tamper', 'TAMPER', 0, 68, 100, 16],
    ['fail', 'FAIL', 102, 68, 103, 16],
  ];

  function pill(label, x, y, w, h, lit, key) {
    return React.createElement('div', {
      key: key,
      style: { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px',
               borderRadius: '8px',
               background: lit ? 'linear-gradient(180deg,#ff6a5a,#d21f1f)' : 'rgba(203,221,244,0.6)',
               border: '1px solid ' + (lit ? '#ffb3aa' : 'rgba(233,241,252,0.85)'),
               // Unlit pills sat at #8299b7 on this fill — about 2.5:1, which read as
               // mush. The fill stays close to its original tone; the label carries
               // the legibility instead.
               color: lit ? '#fff' : '#486080', fontWeight: 800, fontSize: '10.5px',
               letterSpacing: '.2px', display: 'flex', alignItems: 'center', justifyContent: 'center',
               zIndex: 2, animation: lit ? 'bms-blink 1s infinite' : 'none' },
    }, label);
  }

  // ─── Main component ─────────────────────────────────────────────────────────

  function SymmetreBoardComponent({ ahuId }) {
    const BP = window.SymmetreBoardPoints;
    const ART = window.SymmetreBoardArt;
    const unitId = (BP && BP.UNITS[ahuId]) ? ahuId : 'AHU-4-6';
    const cfg = BP.UNITS[unitId];

    const wrapRef = useRef(null);
    const fit = useFitScale(wrapRef);
    const scale = fit.scale;
    const [state, setState] = useState(function () {
      const c = window[cfg.controller];
      return c ? c.getState() : {};
    });
    const [modes, setModes] = useState({});
    const [alarms, setAlarms] = useState([]);
    const [openKey, setOpenKey] = useState(null);
    const [, bump] = useState(0);

    // live controller subscription
    useEffect(function () {
      const c = window[cfg.controller];
      if (!c) return;
      const unsub = c.subscribe(function (s) {
        setState(Object.assign({}, s));
        if (c.getModes) setModes(c.getModes());
      });
      return unsub;
    }, [cfg.controller]);

    // TMY3 weather driver — same wiring the previous overlays used
    const simCtx = React.useContext(window.SimulationContext);
    useEffect(function () {
      const c = window[cfg.controller];
      if (!c || !c.updateFromTMY3 || !simCtx) return;
      c.updateFromTMY3(simCtx.currentRow || 1, simCtx.interpolationFraction || 0);
    }, [cfg.controller, simCtx && simCtx.currentRow, simCtx && simCtx.interpolationFraction]);

    // fault engine polling — unchanged cadence from the previous overlays
    useEffect(function () {
      if (!cfg.faultEngine) return;
      const iv = setInterval(function () {
        const eng = window[cfg.faultEngine], c = window[cfg.controller];
        if (!eng || !c) return;
        // Pass the UNIT, not the modes. This call passed c.getModes() in the second slot,
        // which the old single-parameter evaluate() ignored — harmless until that slot
        // became unitId, at which point the modes object became the alarm's subsystem and
        // every alarm stopped matching its own unit in the summary and the overview.
        const list = eng.evaluate ? eng.evaluate(c.getState(), unitId)
                                  : (eng.getActiveAlarms ? eng.getActiveAlarms() : []);
        setAlarms((list || []).map(function (a) { return a.condition; }));
      }, 500);
      return function () { clearInterval(iv); };
    }, [cfg.faultEngine, cfg.controller]);

    // Staged-start clock. The controllers compute startingTimeLeft from a
    // wall-clock stamp taken when the run command was given, but only ever
    // recompute it inside recalculate() — which nothing called on a timer, so a
    // commanded start froze at its initial countdown and the fan never came on.
    // Ticking here (only while a start is actually in progress) advances the
    // sequence to completion without altering any control logic.
    useEffect(function () {
      if (!state.systemStarting) return;
      const c = window[cfg.controller];
      if (!c || !c.recalculate) return;
      const iv = setInterval(function () {
        c.recalculate();
        setState(Object.assign({}, c.getState()));
      }, 500);
      return function () { clearInterval(iv); };
    }, [cfg.controller, state.systemStarting]);

    // which state keys the active alarms point at
    const alarmKeys = {};
    (function () {
      const eng = window[cfg.faultEngine];
      if (!eng || !eng.rules) return;
      eng.rules.forEach(function (rule) {
        if (alarms.indexOf(rule.id) === -1) return;
        (rule.relatedStateKeys || []).forEach(function (k) { alarmKeys[k] = true; });
      });
    })();

    const bg = currentBg();
    const bgTheme = (ART.BG_THEMES && ART.BG_THEMES[bg]) || (ART.BG_THEMES && ART.BG_THEMES.glacier) || { flat: '#d9e4f1' };

    const artCtx = Object.assign(
      ART.contextFor(unitId, {
        fanRunning: !!state.fanRunning,
        // A VAV box reports its own primary airflow rather than the AHU's cfm.
        airflow: (state.cfm || state.airflowCFM || 0) > 200,
        riserFlow: (state.cfm || 0) > 200,
        showCommon: !!(cfg.art && cfg.art.showCommon),
        bg: bg,
        damper: state.damperPosition,
        // VAV identity and equipment, straight from the unit's own config so one
        // board serves every terminal box.
        vavTag: cfg.art && cfg.art.vavTag,
        vavService: cfg.art && cfg.art.vavService,
        vavLocation: cfg.art && cfg.art.vavLocation,
        vavBoxLabel: cfg.art && cfg.art.vavBoxLabel,
        vavReheat: !!(cfg.art && cfg.art.vavReheat),
        // Live valve position, so the coil in the drawing changes when the valve does.
        vavReheatValve: state.reheatValvePosition,
      }),
      { airStyle: state.fanRunning ? 'display:block' : 'display:none' }
    );
    const svg = ART.resolve(ART[cfg.board] || ART.MAIN, artCtx);

    function commandPoint(key, value, mode) {
      const c = window[cfg.controller];
      if (!c) return;
      const m = BP.meta(key, unitId) || {};
      const prev = BP.format(key, BP.valueOf(state, key));
      if (mode === 'auto') {
        if (c.clearMode) c.clearMode(key);
        else if (c.clearModes) c.clearModes();
        if (c.recalculate) c.recalculate();
        eventLog.unshift({ t: stamp(), key: key, src: BP.bacnetFor(unitId, key).name,
                           etype: 'Mode Transition', prev: 'Manual', val: 'Auto',
                           by: window.CTAAuthOperator || 'operator' });
      } else {
        c.setValue(key, value);
        eventLog.unshift({ t: stamp(), key: key, src: BP.bacnetFor(unitId, key).name,
                           etype: 'Value Change',
                           prev: prev + (m.unit ? ' ' + m.unit : ''),
                           val: BP.format(key, value) + (m.unit ? ' ' + m.unit : ''),
                           // Whose credentials made the change.
                           by: window.CTAAuthOperator || 'operator' });
      }
      if (eventLog.length > 120) eventLog.length = 120;
      // An exercise attempt records what the student actually changed, so the
      // instructor can see the route taken to the answer and not just whether it
      // was reached. Every command on this board already funnels through here.
      if (window.ExerciseStore && window.CTAAuthOperator) {
        try {
          window.ExerciseStore.logAction(
            window.CTAAuthOperator, unitId, m.label || key,
            prev + (m.unit ? ' ' + m.unit : ''),
            mode === 'auto' ? 'Auto' : BP.format(key, value) + (m.unit ? ' ' + m.unit : '')
          );
        } catch (e) {}
      }
      if (c.getModes) setModes(c.getModes());
      setState(Object.assign({}, c.getState()));
      bump(function (n) { return n + 1; });
    }

    const pillSrc = window.SymmetreBoardPoints.PILL_SOURCES;
    const stackFor = (which, ox, oy) => {
      const defs = which === 'u23' ? STACK_DEFS_U23 : STACK_DEFS;
      const src = pillSrc[which] || {};
      return defs.map(function (d, i) {
        const lit = d[0] && src[d[0]] ? !!state[src[d[0]]] : false;
        return pill(d[1], ox + d[2], oy + d[3], d[4], d[5], lit, which + '-' + i);
      });
    };

    const children = [];

    // Simultaneous heating and cooling. A board-level banner, not an overlay chip —
    // which is why it is kept OUT of `children`: for units with artView, children are
    // wrapped in a scale+translate that pins chips to artwork coordinates, and a
    // banner caught in that wrapper is scaled 18% larger and dragged off centre.
    // Rendered as a sibling of artChild for the same reason artwork is.
    //
    // The curriculum teaches this fault explicitly (companionSlides slide 29 tells
    // students to look for the amber warning), and the board previously showed no
    // indication of it at all.
    //
    // Dehumidification is the legitimate exception: both coils open together is
    // correct on a cold humid day. A unit that does not report the flag falls back to
    // its return-air humidity rather than assuming the exception does not apply.
    const dryEnoughToBeAFault = (function () {
      if (typeof state.dehumidifying === 'boolean') return !state.dehumidifying;
      if (typeof state.returnAirRH === 'number') return state.returnAirRH <= 52;
      return true;
    })();
    const simulBanner = (state.phtValvePosition > 20 && state.chwValvePosition > 20 &&
                         dryEnoughToBeAFault)
      ? React.createElement('div', {
          key: 'simul-heat-cool',
          role: 'alert',
          style: {
            // Pinned to the TOP of the pane in screen coordinates. Bottom-anchoring
            // put it at y 615 in a 540px viewport — the board pane is taller than the
            // visible area, so the pane's bottom edge is below the fold. The pane's
            // top edge is always visible, and sits well clear of the pill band (screen
            // y 257+ on every unit).
            //
            // Screen coordinates rather than a board coordinate because every fixed y
            // inside the drawing collided with some unit's pills: 236px on AHU-23-1,
            // 150px on AHU-4-6 and 4-4. The boards place pills in different bands, and
            // the zoomed unit shifts them again.
            // Anchored to the pane's top-LEFT, not centred. Centring at any vertical
            // position put it over some unit's pill stack: the pills sit centre-right
            // on every board and a centred banner is wide enough to reach them. The
            // left gutter is empty on all four units.
            position: 'absolute', left: '14px', top: '14px',
            display: 'flex',
            pointerEvents: 'none', zIndex: 40
          }
        },
          React.createElement('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: '11px',
              padding: '13px 26px', borderRadius: '8px',
              background: 'linear-gradient(180deg,#e8912a,#d4761b)',
              border: '1px solid #a8560f',
              boxShadow: '0 6px 18px rgba(0,0,0,.34)',
              color: '#fff', whiteSpace: 'nowrap',
              // bms-blink, not bms-flash: that one is a steps(1) square wave to .15
              // opacity tuned for a 16px icon, which reads as strobing at this size.
              animation: 'bms-blink 1.6s ease-in-out infinite'
            }
          },
            React.createElement('span', { style: { fontSize: '19px', lineHeight: 1 } }, '\u26a0'),
            React.createElement('span', {
              style: { fontSize: '15px', fontWeight: 800, letterSpacing: '.7px' }
            }, 'SIMULTANEOUS HEATING AND COOLING')
          )
        )
      : null;

    // Artwork is rendered outside `children` so a unit's artView wrapper scales
    // only the overlay — the SVG already carries that zoom in its own viewBox.
    const artChild = React.createElement('div', {
      key: 'art',
      style: { position: 'absolute', left: 0, top: 0, width: BOARD_W + 'px', height: BOARD_H + 'px' },
      dangerouslySetInnerHTML: { __html: svg },
    });

    // pill stacks + fan blocks
    (cfg.fans || []).forEach(function (fan, i) {
      children.push.apply(children, stackFor(fan.pills, fan.x, fan.pillY));
      const rawOn = state[fan.key];
      const on = (typeof rawOn === 'boolean') ? rawOn : (rawOn === 'ON' || rawOn === 'On' || rawOn === 'Start');
      const cmdKey = fan.cmdKey || fan.key;
      const rawCmd = state[cmdKey];
      const runCmdOn = (typeof rawCmd === 'boolean') ? rawCmd : (rawCmd === 'ON' || rawCmd === 'On' || rawCmd === 'Start');
      // With the status point under a manual override, the run command is no
      // longer what the fan reports — showing the toggle on START next to a
      // forced OFF made the block contradict itself. While overridden the
      // toggle follows the status it is displaying, and flips that same point.
      const statusManual = modes[fan.key] === 'Manual';
      const toggleKey = statusManual ? fan.key : cmdKey;
      const cmdOn = statusManual ? on : runCmdOn;
      // Staged start (SOO System Start): the unit is commanded on but the fan
      // is still held off while dampers travel. Surfaced so a commanded START
      // doesn't just read OFF for minutes with no explanation. A forced status
      // isn't a staged start, so it never shows the countdown.
      const starting = !statusManual && !on && runCmdOn && !!state.systemStarting;
      children.push(React.createElement(FanBlock, {
        key: 'fan' + i, cfg: fan, on: on, cmdOn: cmdOn, overridden: statusManual,
        starting: starting, secsLeft: state.startingTimeLeft,
        interlock: !!state[fan.interlockKey], showInterlock: !!fan.interlockKey,
        onOpen: () => setOpenKey(fan.key),
        onToggle: () => commandPoint(toggleKey, invertOf(state[toggleKey]), 'man'),
      }));
    });

    // freeze pump
    if (cfg.freeze) {
      const fon = !!state[cfg.freeze.key];
      children.push(pill('FAIL', 622, 666, 60, 16, !!state.freezestatShutdown, 'frz-fail'));
      children.push(pill('TAMPER', 616, 683, 72, 16, !!state.freezestatTripped, 'frz-tamper'));
      children.push(React.createElement('div', {
        key: 'freeze',
        style: { position: 'absolute', left: cfg.freeze.x + 'px', top: cfg.freeze.y + 'px',
                 width: '56px', height: '40px', cursor: 'pointer', zIndex: 4 },
        onClick: () => setOpenKey(cfg.freeze.key),
        title: 'Freeze Protection Pump — click for point detail',
      },
        React.createElement('div', {
          style: { position: 'absolute', left: 0, top: 0, width: '56px', textAlign: 'center',
                   fontSize: '13px', fontWeight: 800, color: '#20324f' },
        }, 'START'),
        React.createElement('div', {
          style: { position: 'absolute', left: 0, top: '16px', width: '56px', textAlign: 'center',
                   fontSize: '17px', fontWeight: 800, color: fon ? '#1f8f4d' : '#20324f' },
        }, fon ? 'ON' : 'OFF')
      ));
    }

    // value chips
    cfg.chips.forEach(function (row) {
      const key = row[0];
      const m = BP.meta(key, unitId);
      if (!m) return;
      const value = BP.valueOf(state, key);
      if (value === undefined) return;
      children.push(React.createElement(Chip, {
        key: key, row: row, value: value, label: m.label, unitId: unitId,
        manual: modes[key] === 'Manual',
        // A failed device, read from the controller rather than inferred from modes: a
        // sensor fault is not an override and must not be drawn as one.
        faulted: !!(window[cfg.controller] &&
                    typeof window[cfg.controller].getSensorFaults === 'function' &&
                    window[cfg.controller].getSensorFaults()[key] !== undefined),
        alarm: !!alarmKeys[key],
        onOpen: () => setOpenKey(key),
      }));
    });

    return React.createElement('div', {
      ref: wrapRef,
      className: 'relative w-full h-full',
      // Responsive band: whole board visible, centred. Pinned (below MIN_SCALE):
      // the board holds its readable size and this pane scrolls.
      //
      // Pinned used `display: block`, which pressed the oversized board against the pane's
      // left edge and made every diagram read as shifted left. flex-end over-corrected the
      // other way, so it centres instead: equal margins, and the overflow splits between
      // both sides rather than hiding one whole edge.
      style: { background: bgTheme.flat,
               overflow: fit.pinned ? 'auto' : 'hidden',
               display: 'flex',
               alignItems: 'center',
               // `safe center` rather than plain `center`. Centring an overflowing flex item
               // places it at a NEGATIVE offset, and scrollLeft cannot go below zero — so
               // 272 units of the board's left edge became unreachable, taking the whole
               // outside-air plenum with it: the TS-OA sensor, AFMS-3, the DA-1 damper tag
               // and the outdoor air chips. `safe` falls back to flex-start only while
               // overflowing, so one value centres when the board fits and keeps every
               // pixel scrollable when it does not.
               justifyContent: 'safe center' },
      'data-testid': 'symmetre-board-' + unitId,
      'data-screen-label': unitId,
    },
      React.createElement('div', {
        // Reserve the scaled footprint so the scroll extent is correct when
        // pinned, and so the centring margins are computed off real geometry.
        style: { position: 'relative', flexShrink: 0,
                 width: Math.round(BOARD_W * scale) + 'px',
                 height: Math.round(BOARD_H * scale) + 'px' },
      },
        React.createElement('div', {
          style: { position: 'absolute', left: 0, top: 0, width: BOARD_W + 'px', height: BOARD_H + 'px',
                   transformOrigin: 'top left', transform: 'scale(' + scale + ')',
                   fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif", userSelect: 'none' },
        },
          artChild,
          // Units whose artwork is zoomed through its viewBox map the overlay by
          // the same transform, so every chip stays registered to its device and
          // scales with it. Units without artView render the overlay untouched.
          cfg.artView
            ? React.createElement('div', {
                key: 'overlay',
                style: { position: 'absolute', left: 0, top: 0,
                         width: BOARD_W + 'px', height: BOARD_H + 'px',
                         transformOrigin: 'top left',
                         transform: 'translate(' + (-cfg.artView.vx * cfg.artView.s) + 'px,'
                                    + (-cfg.artView.vy * cfg.artView.s) + 'px) scale('
                                    + cfg.artView.s + ')' },
              }, children)
            : children
        ),
        // Outside the scale transform: chrome over the board rather than part of the
        // drawing, so it cannot collide with pills and does not shrink with the fit.
        simulBanner
      ),
      openKey && window.PointDialog ? React.createElement(window.PointDialog, {
        unitId: unitId,
        stateKey: openKey,
        state: state,
        modes: modes,
        alarm: !!alarmKeys[openKey],
        events: eventLog,
        onSet: (v, mode) => commandPoint(openKey, v, mode),
        onClose: () => setOpenKey(null),
      }) : null
    );
  }

  return SymmetreBoardComponent;
})();

window.SymmetreBoard = SymmetreBoard;
