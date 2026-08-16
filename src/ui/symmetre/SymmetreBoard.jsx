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

  function Chip({ row, value, manual, alarm, onOpen, label }) {
    const BP = window.SymmetreBoardPoints;
    const key = row[0], type = row[1], x = row[2], y = row[3], w = row[4];
    const align = row[5] || 'left', fs = row[6] || 13;
    const m = BP.meta(key) || {};
    const [hover, setHover] = useState(false);
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
             background: alarm ? 'linear-gradient(180deg,#8a2018,#5f1410)' : 'linear-gradient(180deg,#43556f,#2c3a51)',
             border: '1px solid ' + (alarm ? '#ff5a49' : '#1c2636'),
             boxShadow: '0 1px 2px rgba(0,0,0,.28)', cursor: 'pointer', whiteSpace: 'nowrap',
             lineHeight: 1, zIndex: 5, animation: alarm ? 'bms-ring 1.1s infinite' : 'none' };
      if (align === 'right') st.right = (BOARD_W - x) + 'px'; else st.left = x + 'px';
      vst = { fontSize: fs + 'px', fontWeight: 800, color: alarm ? '#fff' : (manual ? '#ff9bec' : '#eef3fb') };
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
        (manual ? ' — MANUAL override' : '') + (alarm ? ' — ALARM ACTIVE' : '') + ' (click for point detail)',
      role: 'button',
      tabIndex: 0,
      'aria-label': label + ' ' + display + ' ' + unit + ', activate to open point detail',
      onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
    },
      React.createElement('div', { style: inner },
        React.createElement('span', { style: vst }, display)
      ),
      unit ? React.createElement('span', { style: ust }, unit) : null,
      manual ? React.createElement('span', {
        style: { position: 'absolute', top: '-8px', right: '-6px', minWidth: '14px', height: '14px',
                 padding: '0 2px', borderRadius: '4px', fontSize: '10px', fontWeight: 800,
                 display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                 background: '#c81fae', border: '1px solid #fff',
                 boxShadow: '0 1px 2px rgba(0,0,0,.3)', zIndex: 6 },
        title: 'Manual override active',
      }, 'M') : null
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
        const md = c.getModes ? c.getModes() : {};
        const list = eng.evaluate ? eng.evaluate(c.getState(), md) : (eng.getActiveAlarms ? eng.getActiveAlarms() : []);
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
        airflow: (state.cfm || 0) > 200,
        riserFlow: (state.cfm || 0) > 200,
        showCommon: !!(cfg.art && cfg.art.showCommon),
        bg: bg,
      }),
      { airStyle: state.fanRunning ? 'display:block' : 'display:none' }
    );
    const svg = ART.resolve(cfg.board === 'U23' ? ART.U23 : ART.MAIN, artCtx);

    function commandPoint(key, value, mode) {
      const c = window[cfg.controller];
      if (!c) return;
      const m = BP.meta(key) || {};
      const prev = BP.format(key, BP.valueOf(state, key));
      if (mode === 'auto') {
        if (c.clearMode) c.clearMode(key);
        else if (c.clearModes) c.clearModes();
        if (c.recalculate) c.recalculate();
        eventLog.unshift({ t: stamp(), key: key, src: BP.bacnetFor(unitId, key).name,
                           etype: 'Mode Transition', prev: 'Manual', val: 'Auto' });
      } else {
        c.setValue(key, value);
        eventLog.unshift({ t: stamp(), key: key, src: BP.bacnetFor(unitId, key).name,
                           etype: 'Value Change',
                           prev: prev + (m.unit ? ' ' + m.unit : ''),
                           val: BP.format(key, value) + (m.unit ? ' ' + m.unit : '') });
      }
      if (eventLog.length > 120) eventLog.length = 120;
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

    // Artwork is rendered outside `children` so a unit's artView wrapper scales
    // only the overlay — the SVG already carries that zoom in its own viewBox.
    const artChild = React.createElement('div', {
      key: 'art',
      style: { position: 'absolute', left: 0, top: 0, width: BOARD_W + 'px', height: BOARD_H + 'px' },
      dangerouslySetInnerHTML: { __html: svg },
    });

    // pill stacks + fan blocks
    cfg.fans.forEach(function (fan, i) {
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
      const m = BP.meta(key);
      if (!m) return;
      const value = BP.valueOf(state, key);
      if (value === undefined) return;
      children.push(React.createElement(Chip, {
        key: key, row: row, value: value, label: m.label,
        manual: modes[key] === 'Manual',
        alarm: !!alarmKeys[key],
        onOpen: () => setOpenKey(key),
      }));
    });

    return React.createElement('div', {
      ref: wrapRef,
      className: 'relative w-full h-full',
      // Responsive band: whole board visible, centred. Pinned (below MIN_SCALE):
      // the board holds its readable size and this pane scrolls.
      style: { background: bgTheme.flat,
               overflow: fit.pinned ? 'auto' : 'hidden',
               display: fit.pinned ? 'block' : 'flex',
               alignItems: 'center', justifyContent: 'center' },
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
        )
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
