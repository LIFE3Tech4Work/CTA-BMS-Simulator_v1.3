/**
 * ExerciseResults.jsx — the instructor's view of a published exercise: who has
 * started, who has passed, how long each took, and what each student changed.
 *
 * Mounted inside the existing Instructor Dashboard rather than on its own screen,
 * so there is one place an instructor looks for student work instead of two.
 *
 * No import/export — exposes window.ExerciseResults
 */
(function () {
  'use strict';

  var useState = React.useState, useEffect = React.useEffect;

  var FONT = "'Barlow','Segoe UI',system-ui,sans-serif";

  var STATUS = {
    'not-started': { label: 'Not started', color: '#9db0c8', bg: 'rgba(157,176,200,.14)' },
    'in-progress': { label: 'In progress', color: '#e6a23c', bg: 'rgba(230,162,60,.16)' },
    passed: { label: 'Passed', color: '#6ee7a8', bg: 'rgba(110,231,168,.16)' }
  };

  function ExerciseResults() {
    var ES = window.ExerciseStore;
    var [, bump] = useState(0);
    var [openId, setOpenId] = useState(null);
    var [openLog, setOpenLog] = useState(null);

    // Attempts arrive through localStorage from other tabs/sessions, so this polls
    // the same way the dashboard's submission list already does.
    useEffect(function () {
      if (!ES) return;
      var un = ES.subscribe(function () { bump(function (n) { return n + 1; }); });
      var iv = setInterval(function () { bump(function (n) { return n + 1; }); }, 5000);
      return function () { un(); clearInterval(iv); };
    }, []);

    if (!ES) return null;
    var exercises = ES.listExercises();

    function statusPill(status) {
      var st = STATUS[status];
      return React.createElement('span', {
        style: { fontSize: '10px', fontWeight: 800, letterSpacing: '.3px', padding: '2px 7px',
                 borderRadius: '999px', color: st.color, background: st.bg, whiteSpace: 'nowrap' }
      }, st.label);
    }

    function renderStudentRow(ex, seat) {
      var attempt = ES.attemptFor(ex.id, seat);
      var status = ES.statusFor(ex, seat);
      var logKey = ex.id + '|' + seat;
      var isOpen = openLog === logKey;
      var actions = (attempt && attempt.actions) || [];

      return React.createElement('div', { key: seat, style: { borderTop: '1px solid rgba(53,64,90,.6)' } },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px' }
        },
          React.createElement('span', {
            style: { width: '78px', fontSize: '11.5px', fontWeight: 700, color: '#e8edf6' }
          }, seat),
          statusPill(status),
          React.createElement('span', { style: { fontSize: '11px', color: '#9db0c8', width: '86px' } },
            attempt ? (ES.durationOf(attempt) || '—') : '—'),
          React.createElement('div', { style: { flex: 1 } }),
          actions.length
            ? React.createElement('button', {
                type: 'button',
                onClick: function () { setOpenLog(isOpen ? null : logKey); },
                style: { padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 800,
                         fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #46536b',
                         background: '#242e42', color: '#c3cfdd' }
              }, (isOpen ? 'HIDE' : 'SHOW') + ' ' + actions.length + ' ACTION' + (actions.length === 1 ? '' : 'S'))
            : React.createElement('span', { style: { fontSize: '10px', color: '#5d6b83' } }, 'no changes yet')
        ),
        isOpen ? React.createElement('div', {
          style: { background: '#141b28', borderTop: '1px solid rgba(53,64,90,.6)',
                   maxHeight: '190px', overflowY: 'auto' }
        },
          actions.slice().reverse().map(function (act, i) {
            return React.createElement('div', {
              key: i,
              style: { display: 'flex', gap: '10px', padding: '3px 12px', fontSize: '10.5px',
                       fontFamily: 'monospace', color: '#c3cfdd' }
            },
              React.createElement('span', { style: { color: '#6f7f97', width: '62px' } },
                new Date(act.at).toLocaleTimeString()),
              React.createElement('span', { style: { flex: 1 } }, act.key),
              React.createElement('span', { style: { color: '#8fa6c4' } }, act.from),
              React.createElement('span', { style: { color: '#6f7f97' } }, '\u2192'),
              React.createElement('span', { style: { color: '#ff9bec', fontWeight: 700 } }, act.to)
            );
          })
        ) : null
      );
    }

    function renderExercise(ex) {
      var isOpen = openId === ex.id;
      var seats = ex.assignedTo || [];
      var passedCount = seats.filter(function (s) { return ES.statusFor(ex, s) === 'passed'; }).length;
      var startedCount = seats.filter(function (s) { return ES.statusFor(ex, s) !== 'not-started'; }).length;

      return React.createElement('div', {
        key: ex.id,
        style: { border: '1px solid #35405a', borderRadius: '8px', background: '#1b2536',
                 marginBottom: '10px', overflow: 'hidden' }
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer' },
          onClick: function () { setOpenId(isOpen ? null : ex.id); }
        },
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              React.createElement('span', { style: { fontSize: '13px', fontWeight: 800, color: '#e8edf6' } }, ex.title),
              ex.published
                ? null
                : React.createElement('span', {
                    style: { fontSize: '9.5px', fontWeight: 800, padding: '2px 6px', borderRadius: '999px',
                             color: '#e6a23c', background: 'rgba(230,162,60,.16)' }
                  }, 'DRAFT')
            ),
            React.createElement('div', { style: { fontSize: '11px', color: '#9db0c8', marginTop: '2px' } },
              ex.unitId + '  \u00b7  ' + ES.goalText(ex) + '  \u00b7  ' +
              Object.keys(ex.setup || {}).length + ' point' +
              (Object.keys(ex.setup || {}).length === 1 ? '' : 's') + ' faulted')
          ),
          React.createElement('span', { style: { fontSize: '11px', color: '#9db0c8', whiteSpace: 'nowrap' } },
            seats.length
              ? passedCount + '/' + seats.length + ' passed \u00b7 ' + startedCount + ' started'
              : 'not assigned'),
          React.createElement('span', { style: { color: '#6f7f97', fontSize: '12px' } }, isOpen ? '\u25b2' : '\u25bc')
        ),

        isOpen ? React.createElement('div', null,
          ex.brief ? React.createElement('div', {
            style: { padding: '0 12px 10px', fontSize: '11.5px', color: '#c3cfdd', lineHeight: 1.45 }
          }, ex.brief) : null,
          seats.length
            ? React.createElement('div', null, seats.map(function (s) { return renderStudentRow(ex, s); }))
            : React.createElement('div', {
                style: { padding: '10px 12px', fontSize: '11px', color: '#9db0c8',
                         borderTop: '1px solid rgba(53,64,90,.6)' }
              }, 'Saved as a draft — nobody is assigned yet.'),
          React.createElement('div', {
            style: { display: 'flex', gap: '8px', padding: '10px 12px',
                     borderTop: '1px solid rgba(53,64,90,.6)' }
          },
            React.createElement('button', {
              type: 'button',
              title: 'Load this exercise\u2019s starting state onto the unit so you can walk through it',
              onClick: function () {
                ES.applySetup(ex);
                window.location.hash = '#/symmetre/' + ex.unitId;
              },
              style: { padding: '5px 11px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                       fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #46536b',
                       background: '#242e42', color: '#c3cfdd' }
            }, 'PREVIEW ON UNIT'),
            React.createElement('div', { style: { flex: 1 } }),
            React.createElement('button', {
              type: 'button',
              onClick: function () {
                if (window.confirm('Delete "' + ex.title + '" and all student attempts for it?')) {
                  ES.deleteExercise(ex.id);
                }
              },
              style: { padding: '5px 11px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                       fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #8a2018',
                       background: 'rgba(224,52,43,.14)', color: '#ff8a7e' }
            }, 'DELETE')
          )
        ) : null
      );
    }

    return React.createElement('div', { style: { fontFamily: FONT, marginBottom: '22px' } },
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }
      },
        React.createElement('span', { style: { fontSize: '15px', fontWeight: 800, color: '#fff' } }, 'Exercises'),
        React.createElement('span', { style: { fontSize: '11.5px', color: '#9db0c8' } },
          exercises.length
            ? exercises.length + ' authored'
            : 'none yet')
      ),
      exercises.length
        ? React.createElement('div', null, exercises.slice().reverse().map(renderExercise))
        : React.createElement('div', {
            style: { padding: '14px', borderRadius: '8px', border: '1px dashed #35405a',
                     color: '#9db0c8', fontSize: '12px', lineHeight: 1.5 }
          },
            'To build one: open a unit, click ',
            React.createElement('strong', { style: { color: '#ffd79a' } }, '\u270e CREATE EXERCISE'),
            ' in the Outside Air strip, set the unit up as you want students to find it, then ',
            React.createElement('strong', { style: { color: '#8ff0b5' } }, 'Save as exercise'),
            '.'
          )
    );
  }

  window.ExerciseResults = ExerciseResults;
})();
