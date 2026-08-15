/**
 * WeatherControl.jsx — instructor weather-override popover (checklist
 * Section C). Lets an instructor jump straight to a preset condition
 * (Winter / Summer / Rainy-Damp / Hot & Dry) or dial in a custom OAT/RH,
 * applied across every unit at once via window.WeatherOverride. Also
 * surfaces the "frozen" state that already exists today: pausing the
 * simulation clock (SpeedControls) already stops TMY3 interpolation, since
 * weather is only pushed on tick — this panel just makes that visible
 * instead of leaving it as an unlabeled side effect of Pause.
 *
 * No import/export — exposes window.WeatherControl
 */
const WeatherControl = (function () {
  'use strict';

  const { useState, useEffect, useContext, useRef } = React;

  var MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function WeatherControl() {
    var simCtx = useContext(window.SimulationContext);
    var speed = (simCtx && simCtx.speed) || 'pause';
    var isPaused = speed === 'pause';

    var [open, setOpen] = useState(false);
    var [anchor, setAnchor] = useState(null);
    var [ovr, setOvr] = useState(function () {
      return window.WeatherOverride ? window.WeatherOverride.getState() : { active: false };
    });
    var [customT, setCustomT] = useState('70');
    var [customRH, setCustomRH] = useState('50');
    var btnRef = useRef(null);
    var popRef = useRef(null);

    useEffect(function () {
      if (!window.WeatherOverride) return;
      return window.WeatherOverride.subscribe(setOvr);
    }, []);

    // The OA strip this button lives in sets overflowX: 'auto' — per the CSS
    // spec, setting only one overflow axis forces the other to 'auto' too,
    // which silently clipped an absolutely-positioned dropdown anchored
    // inside it. Rendered into a portal at document.body with position:
    // fixed, keyed off the button's own screen rect, instead.
    function toggleOpen() {
      if (!open && btnRef.current) {
        var r = btnRef.current.getBoundingClientRect();
        setAnchor({ top: r.bottom + 6, right: window.innerWidth - r.right });
      }
      setOpen(!open);
    }

    // Close on outside click
    useEffect(function () {
      if (!open) return;
      function onDocClick(e) {
        if (btnRef.current && btnRef.current.contains(e.target)) return;
        if (popRef.current && popRef.current.contains(e.target)) return;
        setOpen(false);
      }
      document.addEventListener('mousedown', onDocClick);
      return function () { document.removeEventListener('mousedown', onDocClick); };
    }, [open]);

    var PRESETS = (window.WeatherOverride && window.WeatherOverride.PRESETS) || {};
    var presetOrder = ['winter', 'summer', 'rainy', 'dry'];

    function applyPreset(key) {
      if (window.WeatherOverride) window.WeatherOverride.applyPreset(key);
    }
    function applyCustom() {
      if (window.WeatherOverride) window.WeatherOverride.applyCustom(customT, customRH);
    }
    function releaseWeather() {
      if (window.WeatherOverride) window.WeatherOverride.release();
    }

    var statusLabel = ovr.active
      ? ('OVERRIDE — ' + (ovr.presetKey ? PRESETS[ovr.presetKey].label + ' (' + ovr.dateLabel + ')' : 'Custom'))
      : (isPaused ? 'FROZEN — sim paused' : 'LIVE — following TMY');
    var statusColor = ovr.active ? '#c81fae' : (isPaused ? '#e6a23c' : '#6ee7a8');

    var popover = (open && anchor) ? React.createElement('div', {
        ref: popRef,
        style: {
          position: 'fixed', top: anchor.top + 'px', right: anchor.right + 'px',
          width: '260px', zIndex: 500,
          background: '#1b2536', border: '1px solid #46536b', borderRadius: '8px',
          boxShadow: '0 18px 44px rgba(6,10,20,.62)', padding: '10px', color: '#e8edf6',
          fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif"
        }
      },
        React.createElement('div', {
          style: { fontSize: '11px', fontWeight: 800, letterSpacing: '.3px', marginBottom: '8px', color: '#9db0c8' }
        }, 'MANUAL WEATHER CONTROL'),

        isPaused && !ovr.active && React.createElement('div', {
          style: { fontSize: '10px', color: '#e6a23c', marginBottom: '8px', lineHeight: 1.4 }
        }, 'Simulation is paused — weather is already frozen at its current value. Resume to let it move again, or set a condition below to hold it deliberately.'),

        // Presets
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' } },
          presetOrder.map(function (key) {
            var p = PRESETS[key];
            if (!p) return null;
            var active = ovr.active && ovr.presetKey === key;
            // Preview temperature — a real recorded reading for that date,
            // not an invented number (same lookup applyPreset() itself uses).
            var preview = (window.TMY3Projector && window.TMY3Projector.getWeatherAtHour)
              ? window.TMY3Projector.getWeatherAtHour(p.month, p.day, 15)
              : null;
            var tempStr = preview ? Math.round(preview.dryBulb) + '°F' : '--';
            return React.createElement('button', {
              key: key,
              type: 'button',
              onClick: function () { applyPreset(key); },
              title: p.label + ' — real recorded TMY reading for ' + MONTH_ABBR[p.month] + ' ' + p.day,
              style: {
                padding: '6px 4px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer',
                border: '1px solid ' + (active ? '#c81fae' : '#3a4560'),
                background: active ? '#3a1f38' : '#242e42',
                color: active ? '#ff9bec' : '#c3cfdd'
              }
            }, p.label + ' (' + tempStr + ')');
          })
        ),

        // Custom
        React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'flex-end', marginBottom: '8px' } },
          React.createElement('label', { style: { flex: 1, fontSize: '9.5px', color: '#9db0c8' } },
            'OAT °F',
            React.createElement('input', {
              type: 'number', value: customT,
              onChange: function (e) { setCustomT(e.target.value); },
              style: { width: '100%', marginTop: '2px', padding: '3px 5px', fontSize: '11px',
                       fontFamily: 'monospace', background: '#0e1420', border: '1px solid #3a4560',
                       borderRadius: '4px', color: '#e8edf6' }
            })
          ),
          React.createElement('label', { style: { flex: 1, fontSize: '9.5px', color: '#9db0c8' } },
            'RH %',
            React.createElement('input', {
              type: 'number', value: customRH, min: 1, max: 100,
              onChange: function (e) { setCustomRH(e.target.value); },
              style: { width: '100%', marginTop: '2px', padding: '3px 5px', fontSize: '11px',
                       fontFamily: 'monospace', background: '#0e1420', border: '1px solid #3a4560',
                       borderRadius: '4px', color: '#e8edf6' }
            })
          ),
          React.createElement('button', {
            type: 'button',
            onClick: applyCustom,
            style: { padding: '5px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                     fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #2f7a52',
                     background: 'linear-gradient(180deg,#3f8f5a,#2d7346)', color: '#fff' }
          }, 'Set')
        ),

        React.createElement('button', {
          type: 'button',
          disabled: !ovr.active,
          onClick: releaseWeather,
          style: {
            width: '100%', padding: '6px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
            fontFamily: 'inherit', cursor: ovr.active ? 'pointer' : 'not-allowed',
            border: '1px solid ' + (ovr.active ? '#5b9bd5' : '#2b3444'),
            background: ovr.active ? '#22314d' : '#161c28',
            color: ovr.active ? '#bcd7f5' : '#5d6b83'
          }
        }, '↺ Release to Live TMY')
      ) : null;

    return React.createElement(React.Fragment, null,
      React.createElement('button', {
        ref: btnRef,
        type: 'button',
        onClick: toggleOpen,
        title: 'Manual weather control — override OAT/RH for all units, or release back to live TMY',
        style: {
          display: 'flex', alignItems: 'center', gap: '6px', height: '22px',
          padding: '0 10px', margin: '0 4px', borderRadius: '5px', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '10.5px', fontWeight: 800, letterSpacing: '.2px',
          border: '1px solid rgba(255,255,255,.35)',
          background: open ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.1)',
          color: '#fff', flexShrink: 0
        }
      },
        React.createElement('span', {
          style: { width: '7px', height: '7px', borderRadius: '50%', background: statusColor, flexShrink: 0 }
        }),
        React.createElement('span', null, '☀️  ' + statusLabel)
      ),
      popover ? ReactDOM.createPortal(popover, document.body) : null
    );
  }

  return WeatherControl;
})();

window.WeatherControl = WeatherControl;
