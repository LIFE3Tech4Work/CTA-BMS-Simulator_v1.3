/**
 * SystemOverview.jsx — the plant-to-zone topology screen
 *
 * A student diagnosing "Conference room zone starved of air" had no way to learn that the
 * conference room is served by VAV-4-4-02 off AHU-4-4 except by reading labels on two separate
 * screens. Every exercise, alarm and schedule assumes system knowledge the simulator
 * never showed anywhere. This is where that knowledge lives.
 *
 * Laid out left to right in the direction air travels — air handler, then the terminal
 * units it feeds, then the rooms those serve — because that is the order an engineer
 * troubleshoots in, working outward from the plant.
 *
 * Built from what the simulator already knows rather than waiting on as-built drawings:
 * VAVController's ZONES carry servedBy and a real room label, and each unit's service and
 * location are already on its board header. What as-builts would add is geometry — where
 * the rooms physically sit — which changes the layout of this screen but not its data. So
 * nothing here is thrown away when the drawings arrive.
 *
 * No import/export — exposes window.SystemOverview.
 */
(function () {
  'use strict';

  var useState = React.useState, useEffect = React.useEffect;
  var FONT = "'Barlow','Segoe UI',system-ui,sans-serif";

  // Air handlers in plant order, with the descriptions their own board headers carry.
  var AHUS = [
    { id: 'AHU-4-6', ctrl: 'AHU46Controller',
      service: 'Pre-Function / Meeting Rooms 2nd Level', location: 'Level 4',
      engine: 'AHU46FaultEngine' },
    { id: 'AHU-4-4', ctrl: 'AHU44NewController',
      service: 'Conference / Meeting Rooms 2nd Level', location: 'Level 4',
      engine: 'AHU44NewFaultEngine' },
    // AHU-4-3 runs the AHU-4-4 model, and that engine now keys alarms per unit and tags
    // each with the unit it evaluated — so 4-3's alarms are genuinely its own rather than
    // being attributed to 4-4. Its board drives the same engine with its own unit id.
    { id: 'AHU-4-3', ctrl: 'AHU43Controller',
      service: 'Conference Rooms 2nd Level', location: 'Level 4',
      engine: 'AHU44NewFaultEngine' },
    { id: 'AHU-23-1', ctrl: 'AHU23Controller',
      service: 'Floor 23 Boiler Room Ventilation', location: 'Floor 23 MER',
      engine: 'AHU23FaultEngine' }
  ];

  // Which AHU a zone's servedBy string refers to. The controller uses the equipment tag
  // (AHU-4-4_NEW) while the station uses the display id, so the two need reconciling here
  // rather than in either of them.
  var SERVED_BY = { 'AHU-4-4_NEW': 'AHU-4-4', 'AHU-4-6': 'AHU-4-6',
                    'AHU-4-3': 'AHU-4-3', 'AHU-23-1': 'AHU-23-1' };

  function stateOf(name) {
    var c = window[name];
    return (c && typeof c.getState === 'function') ? c.getState() : null;
  }

  /** Terminal units grouped by the air handler feeding them. */
  function zonesFor(ahuId) {
    var V = window.VAVController;
    if (!V || typeof V.getZoneIds !== 'function') return [];
    return V.getZoneIds().map(function (zid) {
      var info = (typeof V.getZoneInfo === 'function') ? V.getZoneInfo(zid) : null;
      var st = (typeof V.getState === 'function') ? V.getState(zid) : null;
      return { id: zid, label: (info && info.label) || zid,
               servedBy: SERVED_BY[info && info.servedBy] || null, state: st };
    }).filter(function (z) { return z.servedBy === ahuId; });
  }

  /** Active alarm count for a unit, so the topology shows where trouble actually is. */
  function alarmsOn(unitId, engineName) {
    var e = engineName && window[engineName];
    if (!e) return 0;
    try {
      // getAllAlarms is the one method every engine has; getActiveAlarms was missing from
      // AHU23FaultEngine, which returned a silent zero for the only unit with a live
      // alarm. Reading the broader list and filtering here means a future engine that
      // omits it degrades to correct rather than to zero.
      var list = (typeof e.getActiveAlarms === 'function')
        ? (e.getActiveAlarms() || [])
        : (typeof e.getAllAlarms === 'function' ? (e.getAllAlarms() || []) : []);
      return list.filter(function (a) {
        if (a.acknowledged) return false;
        if (a.lifecycle === 'inactive') return false;
        // AHU-4-3 and AHU-4-4 share an engine, so without this each would report the
        // other's alarms as its own.
        var sub = a.subsystem || a.unitId;
        return !sub || sub === unitId;
      }).length;
    } catch (err) { return 0; }
  }

  function num(v, dec, unit) {
    if (typeof v !== 'number') return '—';
    return v.toFixed(dec === undefined ? 1 : dec) + (unit || '');
  }

  function SystemOverview() {
    // Redrawn on a slow tick: this is a survey screen, not a control one, so a live
    // per-change subscription on six controllers would cost more than it buys.
    var [, bump] = useState(0);
    useEffect(function () {
      var iv = setInterval(function () { bump(function (n) { return n + 1; }); }, 2000);
      return function () { clearInterval(iv); };
    }, []);

    function go(unitId) { window.location.hash = '#/symmetre/' + unitId; }

    function pill(text, tone) {
      var c = { ok: ['rgba(63,143,90,.18)', '#2f7a52', '#8ff0b5'],
                warn: ['rgba(230,162,60,.20)', '#a5721f', '#ffd79a'],
                bad: ['rgba(194,34,34,.20)', '#8a2018', '#ff8a7e'],
                idle: ['#1b2230', '#38445c', '#9db0c8'] }[tone || 'idle'];
      return React.createElement('span', {
        style: { padding: '2px 8px', borderRadius: '999px', fontSize: '10px',
                 fontWeight: 800, letterSpacing: '.3px', background: c[0],
                 border: '1px solid ' + c[1], color: c[2], whiteSpace: 'nowrap' }
      }, text);
    }

    function reading(label, value) {
      return React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', gap: '10px',
                 fontSize: '11px', lineHeight: 1.5 }
      },
        React.createElement('span', { style: { color: '#9db0c8' } }, label),
        React.createElement('span', { style: { color: '#e8edf6', fontWeight: 700,
                                               fontVariantNumeric: 'tabular-nums' } }, value)
      );
    }

    function zoneCard(z) {
      var st = z.state || {};
      // A zone off its setpoint is the thing worth seeing from across the room, so the
      // deviation drives the pill rather than the raw temperature.
      var sp = st.spaceTempCoolingSetpoint;
      var t = st.spaceTemp;
      var off = (typeof t === 'number' && typeof sp === 'number') ? Math.abs(t - sp) : null;
      var tone = off === null ? 'idle' : (off <= 3 ? 'ok' : (off <= 6 ? 'warn' : 'bad'));
      return React.createElement('div', {
        key: z.id,
        onClick: function () { go(z.id); },
        title: 'Open ' + z.id,
        style: { padding: '9px 11px', borderRadius: '7px', cursor: 'pointer',
                 background: '#1b2230', border: '1px solid #2b3850' }
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                   gap: '8px', marginBottom: '5px' }
        },
          React.createElement('span', {
            style: { fontSize: '11.5px', fontWeight: 800, color: '#fff' }
          }, z.label),
          pill(num(t, 1, '\u00b0F'), tone)
        ),
        React.createElement('div', {
          style: { fontSize: '10px', color: '#7f8ea6', marginBottom: '6px' }
        }, z.id),
        reading('Setpoint', num(sp, 0, '\u00b0F')),
        reading('Airflow', num(st.airflowCFM, 0, ' CFM')),
        reading('Damper', num(st.damperPosition, 0, ' %')),
        reading('Reheat', num(st.reheatValvePosition, 0, ' %'))
      );
    }

    function ahuRow(a) {
      var st = stateOf(a.ctrl) || {};
      var zones = zonesFor(a.id);
      var alarms = alarmsOn(a.id, a.engine);
      var running = !!st.fanRunning;

      return React.createElement('div', {
        key: a.id,
        style: { display: 'flex', gap: '14px', alignItems: 'flex-start',
                 padding: '14px', borderRadius: '9px', marginBottom: '12px',
                 background: 'linear-gradient(180deg,#243044,#1e2839)',
                 border: '1px solid ' + (alarms ? '#8a2018' : '#2b3850') }
      },
        // The air handler itself.
        React.createElement('div', {
          onClick: function () { go(a.id); },
          title: 'Open ' + a.id,
          style: { width: '250px', flexShrink: 0, cursor: 'pointer' }
        },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }
          },
            React.createElement('span', {
              style: { fontSize: '14px', fontWeight: 800, color: '#fff' }
            }, a.id),
            running ? pill('RUNNING', 'ok') : pill('OFF', 'idle'),
            alarms ? pill(alarms + ' ALARM' + (alarms === 1 ? '' : 'S'), 'bad') : null
          ),
          React.createElement('div', {
            style: { fontSize: '11px', color: '#9db0c8', marginBottom: '2px' }
          }, a.service),
          React.createElement('div', {
            style: { fontSize: '10px', color: '#6f7f97', marginBottom: '8px' }
          }, a.location),
          reading('Supply air', num(st.supplyAirTemp, 1, '\u00b0F')),
          reading('Setpoint', num(st.activeSetpoint !== undefined
            ? st.activeSetpoint : st.coolingCoilSetpoint, 1, '\u00b0F')),
          reading('OA damper', num(st.oaDamperPosition, 0, ' %')),
          reading('Fan speed', num(st.fanSpeed, 0, ' %'))
        ),

        // Connector. Drawn rather than implied: the whole point of this screen is that the
        // relationship between an air handler and its zones is explicit somewhere.
        React.createElement('div', {
          style: { alignSelf: 'stretch', width: '28px', flexShrink: 0, position: 'relative' }
        },
          React.createElement('div', {
            style: { position: 'absolute', left: 0, top: '22px', right: '10px', height: '2px',
                     background: running ? '#3f8f5a' : '#38445c' }
          }),
          zones.length ? React.createElement('div', {
            style: { position: 'absolute', right: '10px', top: '22px', bottom: '22px',
                     width: '2px', background: running ? '#3f8f5a' : '#38445c' }
          }) : null
        ),

        // The terminal units it feeds.
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          zones.length
            ? React.createElement('div', {
                style: { display: 'grid', gap: '9px',
                         gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }
              }, zones.map(zoneCard))
            : React.createElement('div', {
                style: { fontSize: '11px', color: '#6f7f97', lineHeight: 1.5,
                         padding: '8px 0' }
              }, 'No terminal units modelled on this air handler. It serves its space directly.')
        )
      );
    }

    return React.createElement('div', {
      style: { height: '100vh', overflowY: 'auto', padding: '18px 22px',
               background: '#141a26', fontFamily: FONT },
      'data-screen-label': 'System Overview'
    },
      React.createElement('button', {
        type: 'button',
        onClick: function () { window.location.hash = '#/symmetre'; },
        title: 'Return to SymmetrE Station',
        style: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                 borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                 background: '#1b2230', border: '1px solid #38445c', color: '#c3cfdd',
                 fontFamily: 'inherit', marginBottom: '10px' }
      }, '\u2190 Back'),
      React.createElement('h1', {
        style: { fontSize: '19px', fontWeight: 800, color: '#fff', marginBottom: '3px' }
      }, 'System Overview'),
      React.createElement('p', {
        style: { fontSize: '12px', color: '#9db0c8', marginBottom: '16px', maxWidth: '720px',
                 lineHeight: 1.5 }
      }, 'Air handlers and the zones they serve, left to right in the direction air travels. Click any unit to open it.'),

      AHUS.map(ahuRow),

      // The indicative layout, clearly separated from the equipment topology above it. The
      // topology is recorded fact — servedBy, service strings, live readings. The layout is
      // partly inferred, so it carries its own warning and its own heading rather than
      // blending into the same surface and inheriting the credibility of the real data.
      React.createElement('div', {
        style: { marginTop: '22px', paddingTop: '16px', borderTop: '1px solid #232c3d' }
      },
        React.createElement('h2', {
          style: { fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '3px' }
        }, 'Zone Layout'),
        React.createElement('p', {
          style: { fontSize: '12px', color: '#9db0c8', marginBottom: '14px', maxWidth: '760px',
                   lineHeight: 1.5 }
        }, 'Which spaces each unit serves, grouped by floor.'),
        window.ZonePlan ? React.createElement(window.ZonePlan, null) : null
      ),

      React.createElement('p', {
        style: { fontSize: '10.5px', color: '#6f7f97', marginTop: '18px', maxWidth: '760px',
                 lineHeight: 1.5 }
      }, 'Equipment relationships and readings above are the simulator\u2019s own records. The zone layout is indicative only \u2014 see the note on it.')
    );
  }

  window.SystemOverview = SystemOverview;
})();
