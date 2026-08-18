/**
 * ExerciseList.jsx — the student's assignment screen and the banner that runs
 * alongside an active exercise.
 *
 * A student signs in, sees what they have been assigned, picks one, and works
 * the unit. The banner is the only thing that follows them: it states the goal
 * and how close they currently are, so progress is legible without leaving the
 * station screen. The simulator marks the attempt complete itself once the goal
 * holds — nobody has to remember to submit.
 *
 * No import/export — exposes window.ExerciseList and window.ExerciseRunBanner
 */
(function () {
  'use strict';

  var useState = React.useState, useEffect = React.useEffect, useContext = React.useContext;

  var ACTIVE_KEY = 'cta_exercise_active';

  function activeId() {
    try { return localStorage.getItem(ACTIVE_KEY) || null; } catch (e) { return null; }
  }
  function setActiveId(id) {
    try { id ? localStorage.setItem(ACTIVE_KEY, id) : localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
    window.dispatchEvent(new CustomEvent('cta-exercise-changed'));
  }

  function useExerciseChanges() {
    var s = useState(0);
    useEffect(function () {
      function bump() { s[1](function (n) { return n + 1; }); }
      window.addEventListener('cta-exercise-changed', bump);
      var un = window.ExerciseStore ? window.ExerciseStore.subscribe(bump) : null;
      return function () {
        window.removeEventListener('cta-exercise-changed', bump);
        if (un) un();
      };
    }, []);
    return s[0];
  }

  var FONT = "'Barlow','Segoe UI',system-ui,sans-serif";

  var STATUS = {
    'not-started': { label: 'Not started', color: '#9db0c8', bg: 'rgba(157,176,200,.14)' },
    'in-progress': { label: 'In progress', color: '#e6a23c', bg: 'rgba(230,162,60,.16)' },
    passed: { label: 'Complete', color: '#6ee7a8', bg: 'rgba(110,231,168,.16)' }
  };

  // ─── Student assignment screen ──────────────────────────────────────────────

  function ExerciseList() {
    var auth = useContext(window.AuthContext);
    useExerciseChanges();
    var ES = window.ExerciseStore;

    if (!auth || !auth.authenticated) {
      return React.createElement('div', {
        style: { padding: '28px', color: '#e8edf6', fontFamily: FONT }
      }, 'Sign in to see your exercises.');
    }

    var mine = ES ? ES.exercisesFor(auth.operator) : [];
    var current = activeId();

    function start(ex) {
      ES.startAttempt(ex.id, auth.operator);
      setActiveId(ex.id);
      window.location.hash = '#/symmetre/' + ex.unitId;
    }

    return React.createElement('div', {
      style: { height: '100%', overflowY: 'auto', background: '#141a26', color: '#e8edf6',
               fontFamily: FONT, padding: '18px 22px' }
    },
      React.createElement('button', {
        type: 'button',
        style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                 borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                 background: '#1b2230', border: '1px solid #38445c', color: '#c3cfdd',
                 fontFamily: 'inherit', flexShrink: 0, marginBottom: '12px' },
        onClick: function () { window.location.hash = '#/symmetre'; },
        title: 'Return to SymmetrE Station'
      }, '\u2190 Back'),
      React.createElement('div', { style: { fontSize: '17px', fontWeight: 800, letterSpacing: '.3px' } },
        'My Exercises'),
      React.createElement('div', { style: { fontSize: '11.5px', color: '#9db0c8', marginTop: '3px' } },
        'Signed in as ' + auth.operator),

      !mine.length
        ? React.createElement('div', {
            style: { marginTop: '20px', padding: '18px', borderRadius: '8px',
                     border: '1px dashed #35405a', color: '#9db0c8', fontSize: '12.5px' }
          }, 'Nothing assigned to you yet. Your instructor publishes exercises from the station screens.')
        : React.createElement('div', { style: { marginTop: '16px', display: 'grid', gap: '10px' } },
            mine.map(function (ex) {
              var status = ES.statusFor(ex, auth.operator);
              var st = STATUS[status];
              var attempt = ES.attemptFor(ex.id, auth.operator);
              var isCurrent = current === ex.id;
              return React.createElement('div', {
                key: ex.id,
                style: { border: '1px solid ' + (isCurrent ? '#5b9bd5' : '#35405a'),
                         borderRadius: '8px', background: '#1b2536', padding: '12px 14px' }
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px' } },
                  React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { fontSize: '13.5px', fontWeight: 800 } }, ex.title),
                    React.createElement('div', {
                      style: { fontSize: '11px', color: '#9db0c8', marginTop: '2px' }
                    }, ex.unitId + '  \u00b7  Goal: ' + ES.goalText(ex))
                  ),
                  React.createElement('span', {
                    style: { fontSize: '10px', fontWeight: 800, letterSpacing: '.3px',
                             padding: '3px 8px', borderRadius: '999px',
                             color: st.color, background: st.bg, whiteSpace: 'nowrap' }
                  }, st.label)
                ),
                ex.brief ? React.createElement('div', {
                  style: { fontSize: '12px', color: '#c3cfdd', marginTop: '8px', lineHeight: 1.45 }
                }, ex.brief) : null,
                React.createElement('div', {
                  style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '11px' }
                },
                  React.createElement('button', {
                    type: 'button', onClick: function () { start(ex); },
                    style: { padding: '6px 13px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800,
                             fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #2f7a52',
                             background: 'linear-gradient(180deg,#3f8f5a,#2d7346)', color: '#fff' }
                  }, status === 'not-started' ? 'START' : (status === 'passed' ? 'REVIEW AGAIN' : 'RESUME')),
                  attempt && attempt.startedAt ? React.createElement('span', {
                    style: { fontSize: '10.5px', color: '#6f7f97' }
                  }, (attempt.passed ? 'Completed in ' : 'Time so far ') + ES.durationOf(attempt)) : null
                )
              );
            })
          )
    );
  }

  // ─── Banner shown on the station while an exercise is running ───────────────

  function ExerciseRunBanner() {
    var auth = useContext(window.AuthContext);
    useExerciseChanges();
    var ES = window.ExerciseStore;
    var [res, setRes] = useState({ ok: false, value: null, heldMs: 0, passed: false });

    var id = activeId();
    var ex = (ES && id) ? ES.getExercise(id) : null;
    var mine = !!(ex && auth && auth.operator &&
                  (ex.assignedTo || []).indexOf(auth.operator) !== -1);

    useEffect(function () {
      if (!ex || !mine) return;
      // Re-read by id on every tick rather than closing over the exercise object:
      // an instructor can retarget a published exercise while a student has it
      // open, and checking against the copy captured at mount would keep grading
      // them on the old goal for the rest of the session.
      function tick() {
        var live = ES.getExercise(id);
        if (live) setRes(ES.check(live, auth.operator));
      }
      tick();
      var iv = setInterval(tick, 1000);
      return function () { clearInterval(iv); };
    }, [id, mine, auth && auth.operator]);

    if (!ex || !mine) return null;

    var passed = res.passed;
    var holdPct = Math.min(100, Math.round((res.heldMs / ES.HOLD_MS) * 100));
    var unitLabel = (ex.goal && ex.goal.unit) || '';

    return React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 12px',
        background: passed ? 'rgba(63,143,90,.22)' : 'rgba(91,155,213,.16)',
        borderBottom: '1px solid ' + (passed ? '#2f7a52' : '#3d6f9e'),
        fontFamily: FONT, color: passed ? '#8ff0b5' : '#cfe2f7'
      }
    },
      React.createElement('span', {
        style: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                 background: passed ? '#6ee7a8' : (res.ok ? '#e6a23c' : '#5b9bd5'),
                 boxShadow: passed ? '0 0 6px #6ee7a8' : 'none' }
      }),
      React.createElement('span', { style: { fontSize: '11px', fontWeight: 800, letterSpacing: '.3px' } },
        passed ? 'COMPLETE' : 'EXERCISE'),
      React.createElement('span', { style: { fontSize: '11.5px', fontWeight: 700 } }, ex.title),
      React.createElement('span', { style: { fontSize: '11px', opacity: .85 } },
        'Goal: ' + ES.goalText(ex)),
      React.createElement('span', {
        style: { fontSize: '11px', fontFamily: 'monospace', fontWeight: 700 }
      }, 'now ' + (res.value == null ? '\u2014' : (Math.round(res.value * 10) / 10) + unitLabel)),

      // While the goal is met but not yet held long enough, say so rather than
      // leaving the student wondering why nothing happened.
      (!passed && res.ok) ? React.createElement('span', {
        style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', color: '#ffd79a' }
      },
        React.createElement('span', null, 'holding\u2026'),
        React.createElement('span', {
          style: { width: '46px', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,.18)' }
        },
          React.createElement('span', {
            style: { display: 'block', width: holdPct + '%', height: '100%', borderRadius: '3px',
                     background: '#ffb347', transition: 'width .3s linear' }
          })
        )
      ) : null,

      React.createElement('div', { style: { flex: 1 } }),
      React.createElement('button', {
        type: 'button',
        onClick: function () { window.location.hash = '#/exercises'; },
        style: { padding: '3px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                 fontFamily: 'inherit', cursor: 'pointer', border: '1px solid rgba(255,255,255,.35)',
                 background: 'rgba(255,255,255,.1)', color: 'inherit' }
      }, 'MY EXERCISES'),
      React.createElement('button', {
        type: 'button',
        title: 'Put the unit back to the exercise starting state',
        onClick: function () { ES.applySetup(ex); },
        style: { padding: '3px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                 fontFamily: 'inherit', cursor: 'pointer', border: '1px solid rgba(255,255,255,.35)',
                 background: 'rgba(255,255,255,.1)', color: 'inherit' }
      }, '\u21ba RESTART'),
      React.createElement('button', {
        type: 'button',
        title: 'Leave the exercise — your progress is kept',
        onClick: function () { setActiveId(null); },
        style: { padding: '3px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                 fontFamily: 'inherit', cursor: 'pointer', border: '1px solid rgba(255,255,255,.35)',
                 background: 'transparent', color: 'inherit' }
      }, 'EXIT')
    );
  }

  window.ExerciseList = ExerciseList;
  window.ExerciseRunBanner = ExerciseRunBanner;
  window.ExerciseActive = { activeId: activeId, setActiveId: setActiveId };
})();
