/**
 * PointDialog.jsx — EBI Point Detail / command dialog.
 *
 * Ported from the CTA BMS Design project's point-detail modal (General /
 * Command Priorities / History / Recent Events, thermometer gauge, present
 * value, Auto-Manual command mode, SET) and wired to v1.3 data:
 *
 *   • attributes come from window.POINT_CATALOG where the point exists there
 *     (real BACnet address, units, range, COV increment, sensor offset),
 *     otherwise from boardPoints.js META
 *   • History plots the catalog's recorded hourly series when present; for
 *     controller-only points it plots a deterministic series seeded from the
 *     live value (identical seed for a given point, so the chart is stable)
 *   • SET writes through the unit's own controller.setValue(); AUTO calls
 *     controller.clearMode()
 *
 * No import/export — exposed as window.PointDialog
 */

const PointDialog = (function () {
  'use strict';

  const { useState, useMemo, useRef } = React;

  const UNIT_NAMES = {
    '%': 'Percent', '°F': 'Degrees Fahrenheit', 'PPM': 'Parts Per Million',
    'CFM': 'Cubic Feet / Minute', 'IWC': 'Inches of Water Column', 'Hz': 'Hertz',
    'SEC': 'Seconds', '%RH': 'Percent Relative Humidity', 'BTU': 'BTU / lb',
    'GPM': 'Gallons / Minute',
  };

  const PRIORITY_NAMES = {
    1: 'Manual-Life Safety', 2: 'Automatic-Life Safety', 5: 'Critical Equipment Control',
    6: 'Minimum On/Off', 8: 'Manual Operator',
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const TYPE_CHIP = {
    'Value Change': 'background:#0e3a52;color:#7fd0ff',
    'Mode Transition': 'background:#463a10;color:#e8cd72',
    'Alarm State Change': 'background:#4a1510;color:#ff8a7e',
    'Operator Action': 'background:#2e3742;color:#aebdd2',
  };

  const HW = 300, HH = 120;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Deterministic plausible history for a controller-only point — same shape
     as the design reference's seedHist(): daily cycle + slow drift, ending on
     the live value so the chart's right edge always matches the diagram. */
  function seedHistory(key, current, unit) {
    let amp;
    if (unit === '°F') amp = 2.6;
    else if (unit === '%' || unit === '%RH') amp = 6;
    else if (unit === 'CFM') amp = Math.max(60, Math.abs(current) * 0.05);
    else if (unit === 'IWC') amp = 0.14;
    else if (unit === 'PPM') amp = 90;
    else if (unit === 'BTU') amp = 2.2;
    else amp = Math.max(1, Math.abs(current) * 0.06);

    let h = 0;
    for (let c = 0; c < key.length; c++) h = (h * 31 + key.charCodeAt(c)) >>> 0;
    const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return (h % 10000) / 10000 - 0.5; };

    const n = 2160, out = [];
    for (let i = 0; i < n; i++) {
      const hourOfDay = (i % 24);
      const day = Math.sin((i / 24) * 0.42) * amp * 0.5;
      const diurnal = Math.sin(((hourOfDay - 4) / 24) * Math.PI * 2) * amp;
      out.push(current + day + diurnal + rnd() * amp * 0.5);
    }
    out[n - 1] = current;
    return out;
  }

  function binaryHistory(current) {
    const arr = [];
    for (let i = 0; i < 2160; i++) {
      const back = 2159 - i;
      const d = new Date(Date.now() - back * 3600000);
      const wd = d.getDay(), hr = d.getHours() + d.getMinutes() / 60;
      arr.push((wd >= 1 && wd <= 6 && hr >= 6.5 && hr < 16) ? 1 : 0);
    }
    arr[arr.length - 1] = current ? 1 : 0;
    return arr;
  }

  // ─── Sub-renderers ──────────────────────────────────────────────────────────

  function GeneralTab(props) {
    const { rows, statusText, statusColor, cmdAnalog, cmdMode, cmdOptions,
            draft, onDraft, onStep, mode, onAuto, onManual } = props;

    const btn = (on) => ({
      flex: 1, textAlign: 'center', padding: '9px', borderRadius: '6px', fontWeight: 800,
      cursor: 'pointer', border: '1px solid ' + (on ? '#2d5aa8' : '#b7c3d6'),
      background: on ? 'linear-gradient(180deg,#3f6fbf,#2d5aa8)' : '#eef2f8',
      color: on ? '#fff' : '#3f5170',
    });
    const stepBtn = {
      width: '40px', border: '1px solid #98a6bd', borderRadius: '6px', background: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
      fontWeight: 800, cursor: 'pointer', color: '#2d5aa8',
    };

    return React.createElement('div', null,
      React.createElement('div', { style: { marginBottom: '11px' } },
        rows.map((r, i) => React.createElement('div', {
          key: i,
          style: { display: 'flex', justifyContent: 'space-between', gap: '12px',
                   padding: '3.5px 0', borderBottom: '1px dashed #d4dfec' },
        },
          React.createElement('span', { style: { fontWeight: 700, color: '#3f5170', fontSize: '12px' } }, r.k),
          React.createElement('span', { style: { fontWeight: 800, color: '#12294f', fontSize: '12px', textAlign: 'right' } }, r.v)
        )),
        React.createElement('div', {
          style: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '3.5px 0' },
        },
          React.createElement('span', { style: { fontWeight: 700, color: '#3f5170', fontSize: '12px' } }, 'Status'),
          React.createElement('span', { style: { fontWeight: 800, fontSize: '12px', color: statusColor } }, statusText)
        )
      ),
      cmdAnalog ? React.createElement('div', null,
        React.createElement('div', { style: { fontWeight: 700, color: '#3f5170', marginBottom: '5px' } }, 'Command Value'),
        React.createElement('div', { style: { display: 'flex', alignItems: 'stretch', gap: '6px', marginBottom: '13px' } },
          React.createElement('div', { style: stepBtn, onClick: () => onStep(-1), title: 'Decrease' }, '–'),
          React.createElement('input', {
            value: draft, onChange: (e) => onDraft(e.target.value), inputMode: 'decimal',
            style: { flex: 1, textAlign: 'center', fontSize: '21px', fontWeight: 800,
                     border: '1px solid #98a6bd', borderRadius: '6px', padding: '7px',
                     color: '#12294f', background: '#fff' },
          }),
          React.createElement('div', { style: stepBtn, onClick: () => onStep(1), title: 'Increase' }, '+')
        )
      ) : null,
      cmdMode ? React.createElement('div', null,
        React.createElement('div', { style: { fontWeight: 700, color: '#3f5170', marginBottom: '5px' } }, 'Control Mode'),
        React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '13px' } },
          React.createElement('div', { style: btn(mode === 'auto'), onClick: onAuto }, 'AUTO'),
          React.createElement('div', { style: btn(mode === 'man'), onClick: onManual }, 'MANUAL')
        )
      ) : null,
      (cmdOptions && cmdOptions.length) ? React.createElement('div', null,
        React.createElement('div', { style: { fontWeight: 700, color: '#3f5170', marginBottom: '5px' } }, 'Command'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '13px' } },
          cmdOptions.map((o) => React.createElement('div', {
            key: o.label, onClick: o.onClick,
            style: { padding: '10px 12px', borderRadius: '6px', fontWeight: 800, cursor: 'pointer',
                     border: '1px solid ' + (o.active ? '#2d5aa8' : '#b7c3d6'),
                     background: o.active ? 'linear-gradient(180deg,#eaf1fb,#d7e4f7)' : '#fff', color: '#12294f' },
          }, o.label))
        )
      ) : null
    );
  }

  function PriorityTab({ prios, relinqVal, relinqNote }) {
    return React.createElement('div', null,
      React.createElement('div', {
        style: { border: '1px solid #c9d6e8', borderRadius: '6px', background: '#fff',
                 overflow: 'hidden', marginBottom: '9px' },
      },
        prios.map((pr) => React.createElement('div', { key: pr.n, style: pr.st },
          React.createElement('span', { style: { width: '22px', textAlign: 'right' } }, pr.n),
          React.createElement('span', { style: { flex: 1 } }, pr.name),
          React.createElement('span', null, pr.val)
        ))
      ),
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px',
                 padding: '6px 10px', border: '1px solid #c9d6e8', borderRadius: '6px',
                 background: '#eef4fb', marginBottom: '10px' },
      },
        React.createElement('span', { style: { fontWeight: 800, fontSize: '11.5px', color: '#12294f', whiteSpace: 'nowrap' } }, 'Relinquish default'),
        React.createElement('span', { style: { fontSize: '10.5px', fontWeight: 600, color: '#5a6f8e', flex: 1 } }, relinqNote),
        React.createElement('span', { style: { fontWeight: 800, fontSize: '12px', color: '#0d3f8f' } }, relinqVal)
      )
    );
  }

  function EventsTab({ rows }) {
    const head = { display: 'grid', gridTemplateColumns: '150px 122px 1fr 1fr', gap: '8px',
                   padding: '6px 12px', background: '#22262c', borderBottom: '1px solid #101317',
                   fontSize: '10px', fontWeight: 800, color: '#9db0c8', letterSpacing: '.5px' };
    return React.createElement('div', {
      style: { border: '1px solid #14181d', borderRadius: '6px', overflow: 'hidden', background: '#2f343b' },
    },
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                 padding: '7px 12px', background: '#22262c', borderBottom: '1px solid #101317' },
      },
        React.createElement('span', { style: { fontSize: '10.5px', fontWeight: 800, color: '#6fd3e8', letterSpacing: '.6px' } }, 'RECENT EVENTS — THIS POINT'),
        React.createElement('span', { style: { fontSize: '10px', color: '#9db0c8' } }, rows.length + ' entries')
      ),
      React.createElement('div', { style: head },
        React.createElement('span', null, 'TIMESTAMP'),
        React.createElement('span', null, 'EVENT TYPE'),
        React.createElement('span', null, 'PREVIOUS'),
        React.createElement('span', null, 'NEW')
      ),
      React.createElement('div', { style: { maxHeight: '238px', overflow: 'auto' } },
        rows.length === 0
          ? React.createElement('div', { style: { padding: '24px', textAlign: 'center', fontSize: '11.5px', color: '#9db0c8' } },
              'No recent events',
              React.createElement('br'),
              React.createElement('span', { style: { fontSize: '10.5px', color: '#6c7c92' } },
                "Events appear when this point's value, mode, or alarm state changes.")
            )
          : rows.map((pe, i) => React.createElement('div', {
              key: i,
              style: { display: 'grid', gridTemplateColumns: '150px 122px 1fr 1fr', gap: '8px',
                       padding: '5.5px 12px', fontSize: '10.5px',
                       background: i % 2 ? '#343a41' : '#3a4048', alignItems: 'baseline' },
            },
              React.createElement('span', { style: { color: '#9db0c8', fontWeight: 700 } }, pe.t),
              React.createElement('span', null, React.createElement('span', {
                style: Object.assign({ display: 'inline-block', padding: '1px 7px', borderRadius: '4px',
                                       fontSize: '10px', fontWeight: 800, letterSpacing: '.3px' },
                  parseInline(TYPE_CHIP[pe.ty] || TYPE_CHIP['Value Change'])),
              }, pe.ty)),
              React.createElement('span', { style: { color: '#c3cfdd' } }, pe.prev || '—'),
              React.createElement('span', { style: { color: '#fff', fontWeight: 800 } }, pe.nw || '—')
            ))
      )
    );
  }

  function parseInline(css) {
    const out = {};
    String(css || '').split(';').forEach(function (part) {
      const i = part.indexOf(':');
      if (i < 0) return;
      const k = part.slice(0, i).trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase());
      out[k] = part.slice(i + 1).trim();
    });
    return out;
  }

  // ─── Main dialog ────────────────────────────────────────────────────────────

  function PointDialogComponent(props) {
    const BP = window.SymmetreBoardPoints;
    const { unitId, stateKey, state, modes, alarm, events, onSet, onClose } = props;
    const m = BP.meta(stateKey) || { label: stateKey, kind: 'ai', unit: '' };
    const kind = m.kind;
    const isManual = (modes || {})[stateKey] === 'Manual';
    const raw = BP.valueOf(state, stateKey);
    const isBinary = (kind === 'bi' || kind === 'bo');
    const options = m.options || ['On', 'Off'];

    const [tab, setTab] = useState('general');
    const [mode, setMode] = useState(isManual ? 'man' : 'auto');
    const [draft, setDraft] = useState(function () {
      if (isBinary) return '';
      const n = typeof raw === 'number' ? raw : 0;
      return String(m.dec ? n.toFixed(m.dec) : Math.round(n));
    });
    const [histPeriod, setHistPeriod] = useState(240);
    const [histIvl, setHistIvl] = useState(1);
    const [cur, setCur] = useState(null);
    const [pin, setPin] = useState(null);
    const histRef = useRef(null);

    const bac = BP.bacnetFor(unitId, stateKey);
    const rec = bac.record;
    const commandable = (kind === 'sp' || kind === 'ao' || kind === 'bo');
    const display = BP.format(stateKey, raw);

    // ── attribute rows ──
    const rows = [
      { k: 'Object name', v: bac.name },
      { k: 'Description', v: m.label },
      { k: 'Object type', v: bac.type },
      { k: 'Technical address', v: bac.addr },
    ];
    const unitLabel = (rec && rec.units) || m.unit;
    if (unitLabel) rows.push({ k: 'Units', v: UNIT_NAMES[unitLabel] || unitLabel });
    const lo = (rec && rec.min != null) ? rec.min : m.min;
    const hi = (rec && rec.max != null) ? rec.max : m.max;
    if (lo != null && hi != null && !isBinary) rows.push({ k: 'Range', v: lo + ' to ' + hi + ' ' + (m.unit || '') });
    if (isBinary) {
      rows.push({ k: 'Active Text (1)', v: options[0] }, { k: 'Inactive Text (0)', v: options[1] });
    } else {
      rows.push({ k: 'COV increment', v: String((rec && rec.covIncrement != null) ? rec.covIncrement : (m.step != null ? m.step : 0.5)) });
      rows.push({ k: 'Sensor offset', v: ((rec && rec.sensorOffset != null) ? rec.sensorOffset : 0).toFixed(1) + (m.unit ? ' ' + m.unit : '') });
    }
    rows.push({ k: 'Subsystem', v: (rec && rec.subsystem) || unitId });

    const statusText = (kind === 'ao')
      ? (isManual ? 'MANUAL (overridden)' : 'AUTO')
      : (kind === 'sp' ? 'Operator setpoint'
        : (kind === 'ai' ? 'Read-only sensor — field / TMY input' : 'Read-only'));
    const statusColor = isManual ? '#c81fae' : (kind === 'bi' ? '#3f5170' : '#2a6a2a');

    // ── history series ──
    const series = useMemo(function () {
      if (bac.history && bac.history.length) return bac.history;
      if (isBinary) return binaryHistory(!!raw && raw !== 'OFF' && raw !== 'Off');
      const n = typeof raw === 'number' ? raw : 0;
      return seedHistory(stateKey, n, m.unit);
      // eslint-disable-next-line
    }, [stateKey, bac.history, isBinary, Math.round((typeof raw === 'number' ? raw : 0) * 10)]);

    const hist = useMemo(function () {
      const rawSer = series.slice(-histPeriod);
      let ser = rawSer;
      if (histIvl > 1) {
        ser = [];
        for (let i = 0; i < rawSer.length; i += histIvl) {
          const c = rawSer.slice(i, i + histIvl);
          ser.push(c.reduce((a, b) => a + b, 0) / c.length);
        }
      }
      if (ser.length < 2) return { empty: true, ticks: [], pts: '', area: '' };

      const dAt = (off) => new Date(Date.now() - off * 3600000);
      const fmtD = (off) => { const d = dAt(off); return String(d.getDate()).padStart(2, '0') + '-' + MONTHS[d.getMonth()]; };
      const ago = (off) => off <= 0 ? 'now' : (fmtD(off) + ' ' + String(dAt(off).getHours()).padStart(2, '0') + ':00');
      const n = ser.length, X = (i) => (i / Math.max(1, n - 1)) * HW;

      if (isBinary) {
        const yOn = 8, yOff = HH - 2;
        let prev = (ser[0] > 0.5) ? yOn : yOff, pts = '0,' + prev;
        for (let i = 1; i < n; i++) {
          const yv = (ser[i] > 0.5) ? yOn : yOff;
          if (yv !== prev) { const xx = X(i - 0.5).toFixed(1); pts += ' ' + xx + ',' + prev + ' ' + xx + ',' + yv; prev = yv; }
        }
        pts += ' ' + HW + ',' + prev;
        const f = (cur != null) ? cur : pin;
        let marker = null, at = 'now', val = (ser[n - 1] > 0.5) ? options[0] : options[1], off = '0 d';
        if (f != null) {
          const idx = Math.round(f * (n - 1)), o = (n - 1 - idx) * histIvl;
          marker = { x: X(idx).toFixed(1), y: String(ser[idx] > 0.5 ? yOn : yOff), dash: (cur != null && cur !== pin) ? '4 3' : '0' };
          at = ago(o); off = o <= 0 ? '0 d' : ('−' + (o / 24).toFixed(1) + ' d');
          val = ser[idx] > 0.5 ? options[0] : options[1];
        }
        return { empty: false, pts, area: '0,' + HH + ' ' + pts + ' ' + HW + ',' + HH,
                 ticks: [options[0], '', '', '', options[1]], marker, at, val, off, ser, n, histIvl };
      }

      const lo0 = Math.min.apply(null, ser), hi0 = Math.max.apply(null, ser);
      let l = lo0, h = hi0;
      if (h - l < 1e-6) { l = lo0 - 1; h = hi0 + 1; }
      const pad = (h - l) * 0.14; l -= pad; h += pad;
      const Y = (v) => HH - ((v - l) / (h - l)) * HH;
      const pts = ser.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
      const ticks = [];
      for (let k = 4; k >= 0; k--) ticks.push(BP.format(stateKey, l + (h - l) * k / 4));
      const f = (cur != null) ? cur : pin;
      let marker = null, at = 'now', val = BP.format(stateKey, ser[n - 1]) + (m.unit ? ' ' + m.unit : ''), off = '0 d';
      if (f != null) {
        const idx = Math.round(f * (n - 1)), o = (n - 1 - idx) * histIvl;
        marker = { x: X(idx).toFixed(1), y: Y(ser[idx]).toFixed(1), dash: (cur != null && cur !== pin) ? '4 3' : '0' };
        at = ago(o); off = o <= 0 ? '0 d' : ('−' + (o / 24).toFixed(1) + ' d');
        val = BP.format(stateKey, ser[idx]) + (m.unit ? ' ' + m.unit : '');
      }
      return { empty: false, pts, area: '0,' + HH + ' ' + pts + ' ' + HW + ',' + HH,
               ticks, marker, at, val, off, ser, n, histIvl };
      // eslint-disable-next-line
    }, [series, histPeriod, histIvl, cur, pin, stateKey]);

    const xLabels = useMemo(function () {
      const dAt = (off) => new Date(Date.now() - off * 3600000);
      const fmtD = (off) => { const d = dAt(off); return String(d.getDate()).padStart(2, '0') + '-' + MONTHS[d.getMonth()]; };
      const hq = (f) => {
        const off = Math.round(histPeriod * f);
        if (off <= 0) return 'now';
        if (histPeriod <= 24) return String(dAt(off).getHours()).padStart(2, '0') + ':00';
        if (histPeriod <= 96) return fmtD(off) + ' ' + String(dAt(off).getHours()).padStart(2, '0') + 'h';
        return fmtD(off);
      };
      return [hq(1), hq(0.75), hq(0.5), hq(0.25), 'now'];
    }, [histPeriod]);

    // ── gauge ──
    let gauge = null;
    if (!isBinary && typeof raw === 'number') {
      const gl = (lo != null) ? lo : Math.min(0, raw);
      const gh = (hi != null) ? hi : Math.max(10, Math.ceil(raw * 1.4));
      gauge = { fill: clamp(((raw - gl) / ((gh - gl) || 1)) * 100, 0, 100).toFixed(1) + '%',
                max: String(gh), min: String(gl), unit: m.unit || '' };
    }

    // ── command priorities ──
    const manActive = (kind === 'sp') || isManual;
    const prios = [];
    for (let n = 1; n <= 16; n++) {
      const active = manActive && n === 8;
      prios.push({
        n: n + '.', name: PRIORITY_NAMES[n] || 'Available',
        val: active ? display : '',
        st: { display: 'flex', gap: '8px', alignItems: 'baseline', padding: '3.5px 10px', fontSize: '11.5px',
              background: active ? 'linear-gradient(180deg,#eaf4ff,#d8e9fc)' : (n % 2 ? '#fff' : '#f4f7fb'),
              color: active ? '#0d3f8f' : '#3f5170', fontWeight: active ? 800 : 600,
              borderLeft: active ? '3px solid #2d6fd0' : '3px solid transparent' },
      });
    }

    // ── tabs ──
    const tabList = [['general', 'General']]
      .concat(commandable ? [['prio', 'Command Priorities']] : [])
      .concat([['hist', 'History'], ['events', 'Recent Events']]);

    const dot = (lit, color) => ({
      width: '11px', height: '11px', borderRadius: '50%', display: 'inline-block',
      background: lit ? (color || '#e0342b') : '#242c38',
      boxShadow: lit ? ('0 0 6px ' + (color || '#e0342b')) : 'inset 0 1px 2px rgba(0,0,0,0.6)',
      border: '1px solid #131a24',
    });

    const pointEvents = (events || []).filter(function (ev) { return ev.src === bac.name || ev.key === stateKey; })
      .map(function (ev) { return { t: ev.t, ty: ev.etype || 'Value Change', prev: ev.prev, nw: ev.val }; });

    function step(dir) {
      const cv = parseFloat(draft) || 0;
      const st = m.step || 1;
      let v = clamp(cv + dir * st, lo != null ? lo : -1e9, hi != null ? hi : 1e9);
      setDraft(String(m.dec ? v.toFixed(m.dec) : Math.round(v)));
    }

    function commitSet() {
      if (isBinary) { onClose(); return; }
      let v = parseFloat(draft);
      if (isNaN(v)) v = typeof raw === 'number' ? raw : 0;
      v = clamp(v, lo != null ? lo : -1e9, hi != null ? hi : 1e9);
      v = m.dec ? +v.toFixed(m.dec) : Math.round(v);
      onSet(v, kind === 'sp' ? 'man' : mode);
      onClose();
    }

    function exportCsv() {
      const ser = hist.ser || [];
      let csv = 'Timestamp,' + m.label.replace(/,/g, ' ') + (m.unit ? ' (' + m.unit + ')' : '') + '\n';
      const now = Date.now(), n = ser.length;
      for (let i = 0; i < n; i++) {
        const t = new Date(now - (n - 1 - i) * (hist.histIvl || 1) * 3600000);
        csv += t.toISOString().slice(0, 16).replace('T', ' ') + ',' + ser[i].toFixed(m.dec || 2) + '\n';
      }
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = bac.name + '_history.csv';
      a.click();
    }

    function histFraction(e) {
      const r = e.currentTarget.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    }

    const selectSt = { fontSize: '11px', fontWeight: 700, color: '#12294f', background: '#fff',
                       border: '1px solid #98a6bd', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer' };

    const ivlOpts = [
      { v: '1', label: '1 hour', dis: false },
      { v: '6', label: '6 hr avg', dis: false },
      { v: '24', label: '1 day avg', dis: false },
      { v: '168', label: '1 week avg', dis: histPeriod < 168 },
    ];

    return ReactDOM.createPortal(React.createElement('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(18,26,42,0.4)', display: 'flex',
               alignItems: 'center', justifyContent: 'center', zIndex: 9000 },
      onClick: onClose,
    },
      React.createElement('div', {
        style: { width: '620px', maxWidth: 'calc(100vw - 24px)',
                 maxHeight: 'calc(100vh - 24px)',
                 display: 'flex', flexDirection: 'column', minHeight: 0,
                 background: 'linear-gradient(180deg,#f6f8fc,#e9eef6)',
                 border: '1px solid #6f7f97', borderRadius: '10px',
                 boxShadow: '0 20px 52px rgba(8,14,28,0.55)', overflow: 'hidden',
                 fontSize: '13px', color: '#12294f',
                 fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" },
        onClick: (e) => e.stopPropagation(),
      },
        // ── title bar ──
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                   padding: '11px 14px', background: 'linear-gradient(180deg,#3f6fbf,#2d5aa8)',
                   color: '#fff', flexShrink: 0 },
        },
          React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 800, fontSize: '13px', color: isManual ? '#ffa8f2' : '#fff' } },
              unitId + ' · ' + m.label),
            React.createElement('div', { style: { fontSize: '11.5px', fontWeight: 700, color: '#cfe0f6', letterSpacing: '0.3px', marginTop: '3px' } },
              '/Facility/99ChurchSt/' + bac.name)
          ),
          React.createElement('div', {
            style: { width: '30px', height: '30px', borderRadius: '6px', display: 'flex',
                     alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                     fontWeight: 800, fontSize: '21px', opacity: 0.95 },
            onClick: onClose, title: 'Close',
          }, '×')
        ),

        React.createElement('div', { style: { display: 'flex', alignItems: 'stretch', flex: 1, minHeight: 0 } },
          // ── left rail ──
          React.createElement('div', {
            style: { width: '134px', background: '#e3ebf6', borderRight: '1px solid #c9d6e8',
                     padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '11px',
                     alignItems: 'center', flexShrink: 0, overflowY: 'auto' },
          },
            gauge ? React.createElement('div', { style: { display: 'flex', alignItems: 'stretch', gap: '7px' } },
              React.createElement('div', {
                style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                         fontSize: '10px', fontWeight: 700, color: '#5a6f8e', textAlign: 'right' },
              },
                React.createElement('span', null, gauge.max),
                React.createElement('span', null, gauge.unit),
                React.createElement('span', null, gauge.min)
              ),
              React.createElement('div', {
                style: { width: '17px', height: '112px', background: '#161d28', borderRadius: '3px',
                         position: 'relative', overflow: 'hidden', border: '1px solid #46536b' },
              },
                React.createElement('div', {
                  style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: gauge.fill,
                           background: 'linear-gradient(180deg,#66dff0,#28b7cc)' },
                })
              )
            ) : null,
            isBinary ? React.createElement('div', {
              style: { padding: '8px 10px', borderRadius: '7px', fontWeight: 800, fontSize: '13px',
                       textAlign: 'center', width: '100%', color: '#fff',
                       background: (display === options[0])
                         ? 'linear-gradient(180deg,#5fd694,#22a35d)'
                         : 'linear-gradient(180deg,#8d9cb4,#68788f)' },
            }, String(display).toUpperCase()) : null,
            React.createElement('div', { style: { width: '100%', textAlign: 'center' } },
              React.createElement('div', { style: { fontSize: '10px', fontWeight: 800, color: '#5a6f8e', letterSpacing: '0.5px' } }, 'PRESENT VALUE'),
              React.createElement('div', {
                style: { background: '#fff', border: '1.5px solid #35bdd3', borderRadius: '5px',
                         padding: '4px 6px', marginTop: '3px', fontSize: '16px', fontWeight: 800,
                         color: isManual ? '#c81fae' : '#12294f' },
              }, display),
              React.createElement('div', { style: { fontSize: '10px', fontWeight: 700, color: '#5a6f8e', marginTop: '2px' } }, m.unit)
            ),
            React.createElement('div', { style: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
              React.createElement('span', { style: { fontSize: '11px', fontWeight: 700, color: '#5a6f8e' } }, 'Mode'),
              React.createElement('span', { style: { fontSize: '12px', fontWeight: 800, color: isManual ? '#c81fae' : '#12294f' } },
                (kind === 'sp') ? 'Operator' : ((kind === 'ai' || kind === 'bi') ? '—' : (isManual ? 'Manual Ovr' : 'Auto')))
            ),
            React.createElement('div', { style: { width: '100%', display: 'flex', flexDirection: 'column', gap: '5px' } },
              [{ label: 'Alarm', lit: !!alarm, val: alarm ? 'ALARM' : 'Normal', vc: alarm ? '#c22222' : '#2a6a2a' },
               { label: 'Fault', lit: false, val: '', vc: '' },
               { label: 'Overridden', lit: isManual, val: '', vc: '' },
               { label: 'Out of Service', lit: false, val: '', vc: '' }].map((d) =>
                React.createElement('div', { key: d.label, style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                  React.createElement('span', { style: dot(d.lit) }),
                  React.createElement('span', { style: { fontSize: '10.5px', fontWeight: 700, color: '#3f5170' } }, d.label),
                  React.createElement('span', { style: { fontSize: '10px', fontWeight: 800, marginLeft: 'auto', color: d.vc } }, d.val)
                ))
            )
          ),

          // ── right pane ──
          React.createElement('div', {
            style: { flex: 1, minWidth: 0, minHeight: 0, padding: '12px 16px 6px',
                     display: 'flex', flexDirection: 'column' },
          },
            React.createElement('div', {
              style: { display: 'flex', gap: '4px', borderBottom: '2px solid #b9c9de', flexShrink: 0 },
            },
              tabList.map(function (t) {
                const a = tab === t[0];
                return React.createElement('div', {
                  key: t[0], onClick: () => setTab(t[0]),
                  style: { padding: '6px 12px 7px', borderRadius: '7px 7px 0 0', fontSize: '12px',
                           fontWeight: a ? 800 : 700, cursor: 'pointer', color: a ? '#12294f' : '#5a6f8e',
                           background: a ? '#fff' : '#dbe5f1', border: '1px solid #b9c9de',
                           borderBottom: 'none', marginBottom: a ? '-2px' : '0',
                           position: 'relative', zIndex: a ? 1 : 0 },
                }, t[1]);
              })
            ),
            React.createElement('div', {
              style: { paddingTop: '11px', flex: 1, minHeight: 0, overflowY: 'auto' },
            },
              tab === 'general' ? React.createElement(GeneralTab, {
                rows: rows, statusText: statusText, statusColor: statusColor,
                cmdAnalog: !isBinary && (kind === 'sp' || (kind === 'ao' && mode === 'man')),
                cmdMode: kind === 'ao',
                cmdOptions: (kind === 'bo') ? options.map(function (o) {
                  return { label: o, active: display === o, onClick: function () { onSet(o === options[0], 'man'); onClose(); } };
                }) : null,
                draft: draft, onDraft: setDraft, onStep: step,
                mode: mode, onAuto: () => setMode('auto'), onManual: () => setMode('man'),
              }) : null,
              tab === 'prio' ? React.createElement(PriorityTab, {
                prios: prios,
                relinqVal: manActive ? '—' : display,
                relinqNote: manActive ? 'Ignored while priority 8 (Manual Operator) is set' : 'Controlling now — no higher priority is set',
              }) : null,
              tab === 'events' ? React.createElement(EventsTab, { rows: pointEvents }) : null,
              tab === 'hist' ? React.createElement('div', null,
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' } },
                  React.createElement('span', { style: { fontSize: '11px', fontWeight: 700, color: '#3f5170' } }, 'Period'),
                  React.createElement('select', {
                    value: String(histPeriod), onChange: (e) => setHistPeriod(+e.target.value), style: selectSt,
                  },
                    [[24, '1 Day'], [72, '3 Days'], [168, '1 Week'], [240, '10 Days'], [336, '2 Weeks'], [720, '1 Month'], [2160, '3 Months']]
                      .map((o) => React.createElement('option', { key: o[0], value: String(o[0]) }, o[1]))
                  ),
                  React.createElement('span', { style: { fontSize: '11px', fontWeight: 700, color: '#3f5170', marginLeft: '8px' } }, 'Interval'),
                  React.createElement('select', {
                    value: String(histIvl), onChange: (e) => setHistIvl(+e.target.value), style: selectSt,
                  },
                    ivlOpts.map((o) => React.createElement('option', { key: o.v, value: o.v, disabled: o.dis }, o.label))
                  ),
                  React.createElement('div', {
                    style: { marginLeft: 'auto', padding: '3px 9px', borderRadius: '4px', fontSize: '10px',
                             fontWeight: 800, letterSpacing: '.4px', cursor: 'pointer', color: '#fff',
                             background: 'linear-gradient(180deg,#3f8f5a,#2d7346)' },
                    onClick: exportCsv,
                  }, 'EXPORT CSV')
                ),
                React.createElement('div', { style: { display: 'flex', gap: '6px' } },
                  React.createElement('div', {
                    style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                             alignItems: 'flex-end', fontSize: '10px', fontWeight: 700, color: '#5a6f8e',
                             padding: '1px 0', minWidth: '30px' },
                  }, (hist.ticks || []).map((tk, i) => React.createElement('span', { key: i }, tk))),
                  React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                    React.createElement('div', {
                      ref: histRef,
                      style: { position: 'relative', background: '#0b0f15', border: '1px solid #2c3a4e',
                               borderRadius: '4px', overflow: 'hidden', cursor: 'crosshair' },
                      onMouseMove: (e) => setCur(histFraction(e)),
                      onMouseDown: (e) => { const f = histFraction(e); setPin(f); setCur(f); },
                      onMouseLeave: () => setCur(null),
                    },
                      React.createElement('svg', {
                        viewBox: '0 0 300 120', preserveAspectRatio: 'none',
                        style: { width: '100%', height: '118px', display: 'block' },
                      },
                        React.createElement('path', {
                          d: 'M0 30 H300 M0 60 H300 M0 90 H300 M75 0 V120 M150 0 V120 M225 0 V120',
                          stroke: '#273347', strokeWidth: 1,
                        }),
                        React.createElement('polygon', { points: hist.area, fill: '#4fd9ec' }),
                        React.createElement('polyline', { points: hist.pts, fill: 'none', stroke: '#8fecf8', strokeWidth: 1.3, strokeLinejoin: 'round' }),
                        hist.marker ? React.createElement('g', null,
                          React.createElement('line', { x1: hist.marker.x, y1: 0, x2: hist.marker.x, y2: 120, stroke: '#f2f7fd', strokeWidth: 0.9, strokeDasharray: hist.marker.dash }),
                          React.createElement('circle', { cx: hist.marker.x, cy: hist.marker.y, r: 3.2, fill: '#fff', stroke: '#1d99ab', strokeWidth: 1.6 })
                        ) : null
                      ),
                      hist.empty ? React.createElement('div', {
                        style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                                 justifyContent: 'center', color: '#5a768e', fontWeight: 700, fontSize: '11px' },
                      }, 'Collecting samples…') : null
                    ),
                    React.createElement('div', {
                      style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px',
                               fontWeight: 700, color: '#5a6f8e', marginTop: '3px' },
                    }, xLabels.map((hx, i) => React.createElement('span', { key: i }, hx)))
                  )
                ),
                React.createElement('div', {
                  style: { display: 'flex', alignItems: 'center', gap: '8px', background: '#eef4fb',
                           border: '1px solid #c9d6e8', borderRadius: '5px', padding: '5px 9px',
                           marginTop: '8px', marginBottom: '8px' },
                },
                  React.createElement('span', { style: { fontSize: '10.5px', fontWeight: 700, color: '#5a6f8e' } }, 'History offset'),
                  React.createElement('span', {
                    style: { background: '#fff', border: '1px solid #98a6bd', borderRadius: '3px',
                             padding: '2px 8px', fontSize: '10.5px', fontWeight: 700, color: '#12294f',
                             minWidth: '46px', textAlign: 'center' },
                  }, hist.off || '0 d'),
                  React.createElement('span', { style: { fontSize: '10.5px', fontWeight: 700, color: '#5a6f8e', marginLeft: 'auto' } }, 'Value at'),
                  React.createElement('span', { style: { fontSize: '11px', fontWeight: 800, color: '#12294f' } }, hist.at || 'now'),
                  React.createElement('span', {
                    style: { background: '#0b0f15', color: '#fff', borderRadius: '3px', padding: '3px 10px',
                             fontSize: '11.5px', fontWeight: 800, minWidth: '60px', textAlign: 'center' },
                  }, hist.val || '—')
                )
              ) : null
            )
          )
        ),

        // ── footer ──
        React.createElement('div', {
          style: { display: 'flex', gap: '8px', padding: '10px 16px 16px',
                   borderTop: '1px solid #cdd8e6', flexShrink: 0,
                   background: 'linear-gradient(180deg,#eef2f8,#e4eaf3)' },
        },
          (commandable && !isBinary) ? React.createElement('div', {
            style: { flex: 1, textAlign: 'center', padding: '10px', borderRadius: '6px',
                     background: 'linear-gradient(180deg,#3f8f5a,#2d7346)', color: '#fff',
                     fontWeight: 800, cursor: 'pointer' },
            onClick: commitSet,
          }, 'SET') : null,
          React.createElement('div', {
            style: { flex: 1, textAlign: 'center', padding: '10px', borderRadius: '6px',
                     background: '#e2e8f2', border: '1px solid #b7c3d6', color: '#3f5170',
                     fontWeight: 800, cursor: 'pointer' },
            onClick: onClose,
          }, 'CLOSE')
        )
      )
    ), document.body);
  }

  return PointDialogComponent;
})();

window.PointDialog = PointDialog;
