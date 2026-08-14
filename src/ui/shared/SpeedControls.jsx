/**
 * SpeedControls.jsx — simulation transport control.
 *
 * Replaces the four loose emoji pills that CapstoneModeShell.jsx and
 * FreeExplore.jsx each rendered separately. Same four controls and the same
 * SimulationEngine.setSpeed() calls — regrouped as a transport:
 *
 *   [ ▮▮ Pause ] │ [ 1×  60×  3600× ]
 *
 * Pause stops the clock; the three rates set how fast it runs. They were
 * previously drawn as four identical peers, which read as one four-way choice
 * rather than "stop" plus "how fast". They stay mutually exclusive (only one is
 * ever lit), so a single accent colour covers both halves.
 *
 * Styled with inline styles rather than utility classes: this app serves a
 * prebuilt output.css with no JIT, so arbitrary-value classes silently produce
 * no rule.
 *
 * No import/export — exposed as window.SpeedControls
 */

(function () {
  'use strict';

  var RATES = [
    { value: '1x', label: '1\u00D7', title: 'Real time \u2014 1 simulated hour per hour' },
    { value: '60x', label: '60\u00D7', title: '60\u00D7 \u2014 1 simulated hour per minute' },
    { value: '3600x', label: '3600\u00D7', title: '3600\u00D7 \u2014 1 simulated hour per second' }
  ];

  var TRACK = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '2px',
    borderRadius: '8px',
    background: '#161d29',
    border: '1px solid #38445c',
    boxShadow: 'inset 0 1px 2px rgba(4,8,16,.45)'
  };

  function segStyle(active, extra) {
    var s = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '5px',
      height: '22px',
      padding: '0 9px',
      borderRadius: '6px',
      border: '1px solid transparent',
      background: 'transparent',
      color: '#9db0c8',
      fontFamily: 'inherit',
      fontSize: '10.5px',
      fontWeight: 700,
      letterSpacing: '.2px',
      fontVariantNumeric: 'tabular-nums',
      cursor: 'pointer',
      transition: 'background .15s, color .15s, box-shadow .15s',
      whiteSpace: 'nowrap',
      flexShrink: 0
    };
    if (active) {
      s.background = 'linear-gradient(180deg,#4b7ccc,#2d5aa8)';
      s.borderColor = '#5f8bce';
      s.color = '#fff';
      s.boxShadow = 'inset 0 1px 0 rgba(255,255,255,.22), 0 1px 2px rgba(4,10,22,.4)';
    }
    if (extra) { for (var k in extra) s[k] = extra[k]; }
    return s;
  }

  /* Two bars — the only glyph here; the rates use their own numerals. */
  function PauseGlyph() {
    return React.createElement('svg', {
      width: 8, height: 9, viewBox: '0 0 8 9', 'aria-hidden': 'true',
      style: { display: 'block', flexShrink: 0 }
    },
      React.createElement('rect', { x: 0, y: 0, width: 2.6, height: 9, rx: 0.8, fill: 'currentColor' }),
      React.createElement('rect', { x: 5.4, y: 0, width: 2.6, height: 9, rx: 0.8, fill: 'currentColor' })
    );
  }

  /**
   * @param {Object} props
   * @param {string} props.speed - current engine speed ('pause' | '1x' | '60x' | '3600x')
   * @param {Function} props.onChange - called with the new speed value
   */
  function SpeedControls(props) {
    var speed = props.speed;
    var onChange = props.onChange;
    var hoverState = React.useState(null);
    var hover = hoverState[0], setHover = hoverState[1];

    function seg(key, active, label, glyph, title, extra) {
      var lit = active;
      var st = segStyle(lit, extra);
      if (!lit && hover === key) { st.background = '#26303f'; st.color = '#e8edf6'; }
      return React.createElement('button', {
        key: key,
        type: 'button',
        style: st,
        onClick: function () { onChange(key); },
        onMouseEnter: function () { setHover(key); },
        onMouseLeave: function () { setHover(null); },
        title: title,
        'aria-pressed': lit ? 'true' : 'false'
      }, glyph, label ? React.createElement('span', null, label) : null);
    }

    return React.createElement('div', {
      style: { display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
      role: 'group',
      'aria-label': 'Simulation speed controls'
    },
      // Transport: stop the clock
      React.createElement('div', { style: TRACK },
        seg('pause', speed === 'pause', 'Pause', React.createElement(PauseGlyph, null),
          'Pause the simulation clock')
      ),
      // Rate: how fast it runs
      React.createElement('div', { style: TRACK },
        RATES.map(function (r) {
          return seg(r.value, speed === r.value, r.label, null, r.title, { minWidth: '38px' });
        })
      )
    );
  }

  window.SpeedControls = SpeedControls;
  window.SpeedControls._RATES = RATES;
})();
