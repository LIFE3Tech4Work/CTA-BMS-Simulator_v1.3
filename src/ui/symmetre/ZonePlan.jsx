/**
 * ZonePlan.jsx — diagrammatic zone layout for the System Overview
 *
 * NOT an as-built. The building's real drawings are not available, and drawing a
 * convincing floor plate from nothing would teach students a building that does not
 * exist — with enough authority that nobody questions it. So this is explicitly
 * indicative: it shows which spaces exist, which air handler and terminal box serve each
 * one, and roughly how they group by floor. It does not claim to be a survey, and the
 * screen says so at the top rather than in a footnote.
 *
 * Everything asserted here comes from what the simulator already records:
 *   - space names from each unit's own Service string in boardArt.js
 *   - floors from its Location string (Level 4, Floor 23)
 *   - which box serves which space from VAVController's servedBy
 *
 * Adjacency is the one thing NOT derived — nothing in the model knows which room adjoins
 * which. It is arranged by function instead: pre-function space between the conference room and
 * the meeting rooms, because that is what pre-function space is for. That reasoning is
 * stated on screen so a student can tell what is recorded from what is inferred.
 *
 * No import/export — exposes window.ZonePlan.
 */
(function () {
  'use strict';

  var useState = React.useState, useEffect = React.useEffect;
  var FONT = "'Barlow','Segoe UI',system-ui,sans-serif";

  // Laid out on a coarse grid rather than with coordinates: pixel positions would imply a
  // precision the source does not have.
  var FLOORS = [
    {
      id: 'level-4',
      label: 'Level 4 \u00b7 Mechanical',
      note: 'All three function-space air handlers are located here.',
      spaces: [
        { name: 'AHU-4-6', kind: 'plant', ahu: 'AHU-4-6', detail: 'Pre-function / meeting rooms', span: 2 },
        { name: 'AHU-4-4', kind: 'plant', ahu: 'AHU-4-4', detail: 'Conference rooms', span: 2 },
        { name: 'AHU-4-3', kind: 'plant', ahu: 'AHU-4-3', detail: 'Conference Room', span: 1 }
      ]
    },
    {
      id: 'level-2',
      label: 'Level 2 \u00b7 Function Space',
      note: 'Served from Level 4. Pre-function sits between the conference room and the meeting ' +
            'rooms because both open onto it \u2014 inferred from function, not from a drawing.',
      spaces: [
        { name: 'Conference Room', kind: 'assembly', ahu: 'AHU-4-4', vav: 'VAV-4-4-02',
          detail: 'Conference rooms', span: 2 },
        { name: 'Pre-Function', kind: 'circulation', ahu: 'AHU-4-4',
          detail: 'Shared \u2014 AHU-4-4 and AHU-4-6', span: 1 },
        { name: 'Meeting Room 214', kind: 'meeting', ahu: 'AHU-4-6', vav: 'VAV-02-03',
          detail: 'Zone 3', span: 1 },
        { name: 'Meeting Rooms', kind: 'meeting', ahu: 'AHU-4-6',
          detail: 'Not individually modelled', span: 1 }
      ]
    },
    {
      id: 'floor-23',
      label: 'Floor 23 \u00b7 Mechanical',
      note: 'A separate system. The air-quality hazard here is carbon monoxide from ' +
            'combustion, not CO\u2082 from occupancy.',
      spaces: [
        { name: 'Boiler Room', kind: 'plant-space', ahu: 'AHU-23-1',
          detail: 'Ventilation only', span: 3 },
        { name: 'Floor 23 MER', kind: 'plant', ahu: 'AHU-23-1',
          detail: 'AHU-23-1 located here', span: 2 }
      ]
    }
  ];

  var KINDS = {
    plant:         { bg: '#1b2230', border: '#46536b', label: 'Mechanical' },
    'plant-space': { bg: '#241f2e', border: '#5a4a6b', label: 'Plant space' },
    assembly:      { bg: '#1c2735', border: '#3f6fbf', label: 'Assembly' },
    meeting:       { bg: '#1b2a2c', border: '#2b8fa3', label: 'Meeting' },
    circulation:   { bg: '#232a1f', border: '#5d7a3f', label: 'Circulation' }
  };

  var UNIT_CTRL = { 'AHU-4-6': 'AHU46Controller', 'AHU-4-4': 'AHU44NewController',
                    'AHU-4-3': 'AHU43Controller', 'AHU-23-1': 'AHU23Controller' };

  function ZonePlan() {
    // Slow redraw: a survey view, so live readings are a courtesy rather than the point.
    var [, bump] = useState(0);
    useEffect(function () {
      var iv = setInterval(function () { bump(function (n) { return n + 1; }); }, 3000);
      return function () { clearInterval(iv); };
    }, []);

    function zoneTemp(vavId) {
      var V = window.VAVController;
      if (!V || !vavId || typeof V.getState !== 'function') return null;
      var st = V.getState(vavId);
      return (st && typeof st.spaceTemp === 'number') ? st.spaceTemp : null;
    }

    function supplyTemp(ahuId) {
      var c = window[UNIT_CTRL[ahuId]];
      if (!c || typeof c.getState !== 'function') return null;
      var st = c.getState();
      return (st && typeof st.supplyAirTemp === 'number') ? st.supplyAirTemp : null;
    }

    function spaceCard(sp, floorId) {
      var k = KINDS[sp.kind] || KINDS.plant;
      var t = sp.vav ? zoneTemp(sp.vav) : supplyTemp(sp.ahu);
      return React.createElement('div', {
        key: floorId + '-' + sp.name,
        // A modelled zone opens its own board; a space with no box opens the air handler
        // serving it, which is the nearest thing a student can actually inspect.
        onClick: function () { window.location.hash = '#/symmetre/' + (sp.vav || sp.ahu); },
        title: 'Open ' + (sp.vav || sp.ahu),
        style: { gridColumn: 'span ' + (sp.span || 1), padding: '11px 12px',
                 borderRadius: '8px', cursor: 'pointer', minHeight: '86px',
                 display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                 background: k.bg, border: '1px solid ' + k.border }
      },
        React.createElement('div', null,
          React.createElement('div', {
            style: { fontSize: '12.5px', fontWeight: 800, color: '#fff', marginBottom: '2px' }
          }, sp.name),
          sp.detail ? React.createElement('div', {
            style: { fontSize: '10px', color: '#8b9bb4', lineHeight: 1.4 }
          }, sp.detail) : null
        ),
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                   gap: '8px', marginTop: '8px' }
        },
          React.createElement('span', {
            style: { fontSize: '9.5px', fontWeight: 800, letterSpacing: '.4px', color: '#7f8ea6' }
          }, sp.vav || sp.ahu),
          t !== null ? React.createElement('span', {
            title: sp.vav ? 'Zone temperature' : 'Supply air temperature',
            style: { fontSize: '11px', fontWeight: 800, color: '#cfe6ea',
                     fontVariantNumeric: 'tabular-nums' }
          }, t.toFixed(1) + '\u00b0F') : null
        )
      );
    }

    function floorBlock(f) {
      return React.createElement('div', { key: f.id, style: { marginBottom: '16px' } },
        React.createElement('div', {
          style: { fontSize: '12px', fontWeight: 800, letterSpacing: '.3px',
                   color: '#e8edf6', marginBottom: '4px' }
        }, f.label),
        React.createElement('p', {
          style: { fontSize: '10.5px', color: '#7f8ea6', lineHeight: 1.5,
                   marginBottom: '8px', maxWidth: '760px' }
        }, f.note),
        React.createElement('div', {
          style: { display: 'grid', gap: '9px', gridTemplateColumns: 'repeat(5,minmax(0,1fr))' }
        }, f.spaces.map(function (sp) { return spaceCard(sp, f.id); }))
      );
    }

    return React.createElement('div', { style: { fontFamily: FONT } },
      // Stated where the reader starts, not in a footnote. A diagram that looks like a
      // floor plan gets read as one unless it says otherwise up front.
      React.createElement('div', {
        style: { padding: '9px 12px', borderRadius: '7px', marginBottom: '14px',
                 background: 'rgba(230,162,60,.12)', border: '1px solid #a5721f' }
      },
        React.createElement('div', {
          style: { fontSize: '10px', fontWeight: 800, letterSpacing: '.4px',
                   color: '#ffd79a', marginBottom: '3px' }
        }, 'INDICATIVE LAYOUT \u2014 NOT AN AS-BUILT'),
        React.createElement('div', {
          style: { fontSize: '11px', color: '#e8dcc4', lineHeight: 1.5, maxWidth: '760px' }
        }, 'Space names, floors and equipment assignments come from the simulator\u2019s own ' +
           'records. Room sizes and positions do NOT \u2014 they are arranged by function, ' +
           'because the building\u2019s as-built drawings are not available. Do not use this to ' +
           'reason about distances, duct runs or physical adjacency.')
      ),

      FLOORS.map(floorBlock),

      React.createElement('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px',
                 paddingTop: '10px', borderTop: '1px solid #232c3d' }
      },
        Object.keys(KINDS).map(function (key) {
          var k = KINDS[key];
          return React.createElement('span', {
            key: key,
            style: { display: 'inline-flex', alignItems: 'center', gap: '6px',
                     fontSize: '10px', color: '#9db0c8' }
          },
            React.createElement('span', {
              style: { width: '11px', height: '11px', borderRadius: '3px',
                       background: k.bg, border: '1px solid ' + k.border }
            }),
            k.label
          );
        })
      )
    );
  }

  window.ZonePlan = ZonePlan;
})();
