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
    // Opened but nothing changed yet — worth separating, because "I started and got
    // nowhere" and "I have not looked at it" need different help from an instructor.
    started: { label: 'Opened', color: '#9db0c8', bg: 'rgba(157,176,200,.14)' },
    'in-progress': { label: 'In progress', color: '#e6a23c', bg: 'rgba(230,162,60,.16)' },
    passed: { label: 'Complete', color: '#6ee7a8', bg: 'rgba(110,231,168,.16)' }
  };

  // ─── Student assignment screen ──────────────────────────────────────────────

  /**
   * True when the viewer has navigated off the unit the exercise is on. Reading the task,
   * jumping to the assignment list or restarting all make sense ON the unit and are noise
   * while looking at a different one — the only useful actions there are going back or
   * leaving. Shared so the buttons cannot disagree about which state they are in.
   */
  function offExerciseUnit(ex) {
    if (!ex || !ex.unitId) return false;
    var m = /#\/symmetre\/([^/?]+)/.exec(window.location.hash || '');
    var here = m ? decodeURIComponent(m[1]) : null;
    return !!(here && here !== ex.unitId);
  }

  function ExerciseList() {
    var auth = useContext(window.AuthContext);
    var B = window.SupabaseBackend;
    var backendOn = !!(B && B.isConfigured());
    var [syncing, setSyncing] = useState(false);

    // Pull on mount, on tab focus, and on a slow timer. Without this a student had to
    // sign out and back in to see work assigned while they were logged in.
    useEffect(function () {
      if (!backendOn) return;
      var live = true;
      function pull() {
        if (!live) return;
        setSyncing(true);
        // `bump` belongs to useExerciseChanges' own closure, so it is not in scope here.
        // syncDown writes localStorage directly and never calls the store's notify(),
        // so nothing would redraw — dispatching the event the hook already listens for
        // is what makes a newly synced assignment appear.
        B.syncDown().then(function () {
          if (!live) return;
          setSyncing(false);
          window.dispatchEvent(new Event('cta-exercise-changed'));
        });
      }
      pull();
      var iv = setInterval(pull, 30000);
      window.addEventListener('focus', pull);
      return function () {
        live = false;
        clearInterval(iv);
        window.removeEventListener('focus', pull);
      };
    }, [backendOn]);
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
      // Begin counting active time. The timer stops itself on sign-out, on the tab being
      // hidden, and when the exercise is left — so the duration an instructor grades on
      // is time actually spent, not wall-clock since the student first pressed START.
      if (ES.startTimer) ES.startTimer(ex.id, auth.operator);
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
        // Named when the instructor has filled the roster in, so a student can
        // confirm they are signed in as themselves rather than decoding a seat id.
        // The seat id stays in the line, because that is what they typed to get in.
        (window.StudentRoster && window.StudentRoster.isNamed(auth.operator))
          ? 'Signed in as ' + window.StudentRoster.displayLong(auth.operator) +
            '  (' + auth.operator + ')'
          : 'Signed in as ' + auth.operator),

      !mine.length
        ? React.createElement('div', {
            style: { marginTop: '20px', padding: '18px', borderRadius: '8px',
                     border: '1px dashed #35405a', color: '#9db0c8', fontSize: '12.5px' }
          }, 'Nothing assigned to you yet. Your instructor publishes exercises from the station screens.')
        : React.createElement('div', { style: { marginTop: '16px', display: 'grid', gap: '10px' } },
            // Outstanding work first. A finished exercise sitting above an untouched one
            // buries the thing the student still has to do.
            mine.slice().sort(function (a, b) {
              var pa = ES.statusFor(a, auth.operator) === 'passed' ? 1 : 0;
              var pb = ES.statusFor(b, auth.operator) === 'passed' ? 1 : 0;
              return pa - pb;
            }).map(function (ex) {
              var status = ES.statusFor(ex, auth.operator);
              var st = STATUS[status] || STATUS['not-started'];
              var attempt = ES.attemptFor(ex.id, auth.operator);
              var isCurrent = current === ex.id;
              return React.createElement('div', {
                key: ex.id,
                style: { border: '1px solid ' + (isCurrent ? '#5b9bd5'
                           : (status === 'passed' ? '#2f7a52' : '#35405a')),
                         borderRadius: '8px', padding: '12px 14px',
                         background: status === 'passed' ? 'rgba(63,143,90,.10)' : '#1b2536' }
              },
                React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px' } },
                  React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { fontSize: '13.5px', fontWeight: 800 } }, ex.title),
                    React.createElement('div', {
                      style: { fontSize: '11px', color: '#9db0c8', marginTop: '2px' }
                    }, ex.unitId + '  \u00b7  Goal: ' + ES.goalText(ex)),
                    // Visible before starting, so a student knows which standard
                    // the exercise is testing them against.
                    (ex.goal && ex.goal.standard && window.ASHRAECriteria)
                      ? React.createElement('div', {
                          style: { marginTop: '4px', fontSize: '9.5px', fontWeight: 800,
                                   letterSpacing: '.4px', color: '#7fd4e2' }
                        }, window.ASHRAECriteria.badge(ex.goal.standard) +
                           (ex.goal.criterionLabel ? '  \u00b7  ' + ex.goal.criterionLabel : ''))
                      : null
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
    var [showTask, setShowTask] = useState(false);
    var [diag, setDiag] = useState('');
    var [diagSaved, setDiagSaved] = useState(false);
    // Seeded from the saved attempt when the panel opens, so reopening shows what they
    // already wrote rather than an empty box that looks like lost work.
    useEffect(function () {
      if (!showTask || !ex || !auth) return;
      var a = ES.attemptFor(ex.id, auth.operator);
      setDiag((a && a.diagnosis) || '');
      setDiagSaved(false);
    }, [showTask, ex && ex.id]);

    var id = activeId();
    var ex = (ES && id) ? ES.getExercise(id) : null;
    var mine = !!(ex && auth && auth.operator &&
                  (ex.assignedTo || []).indexOf(auth.operator) !== -1);
    // PREVIEW ON UNIT dropped an instructor onto the faulted diagram with no task panel,
    // no goal readout and no diagnosis box — so the one thing preview exists for, seeing
    // how the exercise READS to a student, was the thing it could not show. The banner
    // refused because `mine` requires being in assignedTo, which an instructor never is.
    // Preview renders the same panel and evaluates the goal live; every write below stays
    // behind `mine`, so nothing is graded, saved or pushed.
    var preview = !!(ex && !mine && window.AuthHelpers && window.AuthHelpers.hasPrivilege &&
                     window.CTAAuthLevel &&
                     window.AuthHelpers.hasPrivilege(window.CTAAuthLevel, 'Engr'));

    useEffect(function () {
      if (!ex || (!mine && !preview)) return;
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

    if (!ex || (!mine && !preview)) return null;

    var passed = res.passed;
    var holdPct = Math.min(100, Math.round((res.heldMs / ES.HOLD_MS) * 100));
    var unitLabel = (ex.goal && ex.goal.unit) || '';
    var g = ex.goal || {};

    /**
     * How far off, in words. "now 63.4°F" against "within ±1.5 of 60" makes the student
     * do arithmetic before they can act; "3.4°F too warm" is the same fact already
     * turned into a direction to move in — which is what they are actually deciding.
     */
    function gapText() {
      if (res.value == null || typeof res.value !== 'number') return null;
      if (res.ok) return null;
      var t = Number(g.target);
      if (!isFinite(t)) return null;
      var d = res.value - t;
      var mag = Math.abs(Math.round(d * 10) / 10);
      var u = unitLabel.trim();
      // Temperature reads naturally as warm/cold; everything else as high/low.
      var warm = /\u00b0F/.test(unitLabel);
      var dir = d > 0 ? (warm ? 'too warm' : 'too high') : (warm ? 'too cold' : 'too low');
      if (g.comparator === 'above') return d < 0 ? mag + u + ' below target' : null;
      if (g.comparator === 'below') return d > 0 ? mag + u + ' above target' : null;
      return mag + u + ' ' + dir;
    }
    var gap = gapText();

    return React.createElement('div', {
      style: {
        background: passed ? 'rgba(63,143,90,.22)' : 'rgba(91,155,213,.16)',
        borderBottom: '1px solid ' + (passed ? '#2f7a52' : '#3d6f9e'),
        fontFamily: FONT, color: passed ? '#8ff0b5' : '#cfe2f7'
      }
    },
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 12px',
               flexWrap: 'wrap' }
    },
      React.createElement('span', {
        style: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                 background: passed ? '#6ee7a8' : (res.ok ? '#e6a23c' : '#5b9bd5'),
                 boxShadow: passed ? '0 0 6px #6ee7a8' : 'none' }
      }),
      React.createElement('span', { style: { fontSize: '11px', fontWeight: 800, letterSpacing: '.3px',
                                             color: preview ? '#ffd79a' : undefined } },
        preview ? 'STUDENT VIEW · PREVIEW' : (passed ? 'COMPLETE' : 'EXERCISE')),
      React.createElement('span', { style: { fontSize: '11.5px', fontWeight: 700 } }, ex.title),
      React.createElement('span', { style: { fontSize: '11px', opacity: .85 } },
        'Goal: ' + ES.goalText(ex)),
      // The standard as its own chip, so a student working the unit can see the
      // basis for the target without opening the brief again.
      (ex.goal && ex.goal.standard && window.ASHRAECriteria)
        ? React.createElement('span', {
            title: ex.goal.citation || '',
            style: { fontSize: '9.5px', fontWeight: 800, letterSpacing: '.4px',
                     padding: '2px 6px', borderRadius: '3px', flexShrink: 0,
                     background: 'rgba(127,212,226,.22)', border: '1px solid #4e9aa8',
                     color: '#cfe6ea' }
          }, window.ASHRAECriteria.badge(ex.goal.standard))
        : null,
      React.createElement('span', {
        style: { fontSize: '11px', fontFamily: 'monospace', fontWeight: 700 }
      }, 'now ' + (res.value == null ? '\u2014' : (Math.round(res.value * 10) / 10) + unitLabel)),
      // The actionable half of the reading: which way to move, not just where it is.
      gap ? React.createElement('span', {
        style: { fontSize: '10.5px', fontWeight: 800, letterSpacing: '.2px',
                 padding: '2px 7px', borderRadius: '999px', whiteSpace: 'nowrap',
                 background: 'rgba(230,162,60,.18)', border: '1px solid #a5721f',
                 color: '#ffd79a' }
      }, gap) : null,

      // The 3s hold that guards against a value passing through on its way somewhere
      // wrong is short enough that showing a progress bar for it read as the app
      // loading rather than as grading in progress.
      React.createElement('div', { style: { flex: 1 } }),

      // Wandering off the exercise's unit is easy — the station tabs are always live —
      // and until now nothing said so or offered a way back. Only shown when the student
      // is actually on a different unit, so it is a correction rather than a permanent
      // fixture competing with the task and exercise-list buttons beside it.
      offExerciseUnit(ex) ? (function () {
        var m = /#\/symmetre\/([^/?]+)/.exec(window.location.hash || '');
        var here = m ? decodeURIComponent(m[1]) : null;
        return React.createElement('button', {
          type: 'button',
          onClick: function () { window.location.hash = '#/symmetre/' + ex.unitId; },
          title: 'This exercise is on ' + ex.unitId + ' — you are looking at ' + here,
          style: { padding: '3px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                   fontFamily: 'inherit', cursor: 'pointer', marginRight: '6px',
                   border: '1px solid #ffd79a', background: 'rgba(230,162,60,.28)',
                   color: '#fff', flexShrink: 0 }
        }, '\u2190 BACK TO ' + ex.unitId);
      })() : null,
      offExerciseUnit(ex) ? null : React.createElement('button', {
        type: 'button',
        onClick: function () { setShowTask(!showTask); },
        title: 'Read the task again',
        style: { padding: '3px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                 fontFamily: 'inherit', cursor: 'pointer',
                 border: '1px solid ' + (showTask ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.35)'),
                 background: showTask ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.1)',
                 color: 'inherit' }
      }, showTask ? '\u25b4 TASK' : '\u25be TASK'),
      offExerciseUnit(ex) ? null : React.createElement('button', {
        type: 'button',
        onClick: function () { window.location.hash = '#/exercises'; },
        style: { padding: '3px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                 fontFamily: 'inherit', cursor: 'pointer', border: '1px solid rgba(255,255,255,.35)',
                 background: 'rgba(255,255,255,.1)', color: 'inherit' }
      }, 'MY EXERCISES'),
      offExerciseUnit(ex) ? null : React.createElement('button', {
        type: 'button',
        title: 'Put the unit back to the exercise starting state',
        onClick: function () { ES.applySetup(ex); },
        style: { padding: '3px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                 fontFamily: 'inherit', cursor: 'pointer', border: '1px solid rgba(255,255,255,.35)',
                 background: 'rgba(255,255,255,.1)', color: 'inherit' }
      }, '\u21ba RESTART'),
      React.createElement('button', {
        type: 'button',
        title: preview
          ? 'Leave preview — nothing was saved'
          : 'Leave the exercise — your progress is kept',
        onClick: function () {
          // Final beat before leaving, so the partial interval since the last one counts.
          if (ES.stopTimer && !preview) ES.stopTimer(ex.id, auth.operator);
          setActiveId(null);
        },
        style: { padding: '3px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                 fontFamily: 'inherit', cursor: 'pointer', border: '1px solid rgba(255,255,255,.35)',
                 background: 'transparent', color: 'inherit' }
      }, 'EXIT')
    ),

    // The task, on the same screen as the unit. Collapsed by default so it never
    // competes with the board, one click away when the student loses the thread.
    showTask ? React.createElement('div', {
      style: { padding: '12px 16px 14px', borderTop: '1px solid rgba(255,255,255,.14)',
               background: 'rgba(0,0,0,.18)', display: 'flex', gap: '22px',
               alignItems: 'flex-start', flexWrap: 'wrap' }
    },
      // Left: what to do. Capped at 62ch — long lines are what made this hard to read,
      // not lack of room.
      React.createElement('div', { style: { flex: '1 1 420px', maxWidth: '62ch', minWidth: '280px' } },
      ex.instructions ? React.createElement('div', {
        style: { fontSize: '12px', lineHeight: 1.55, color: '#e8edf6', whiteSpace: 'pre-line' }
      }, ex.instructions) : null,
      React.createElement('div', {
        style: { marginTop: ex.instructions ? '9px' : 0, fontSize: '11px',
                 color: '#9db0c8', lineHeight: 1.5 }
      },
        React.createElement('strong', { style: { color: '#c3cfdd' } }, 'Complete when: '),
        ES.goalText(ex)
      ),
      // The citation, in full. On the collapsed row there is only room for the badge,
      // and "why is 1100 ppm the number" is the question the standard answers.
      (g.citation) ? React.createElement('div', {
        style: { marginTop: '6px', fontSize: '10.5px', color: '#7fd4e2', lineHeight: 1.5 }
      }, g.citation) : null
      ),

      // Right: where the written answer goes. The diagnosis scenarios ask students to explain
      // what the evidence shows, which is the part that demonstrates understanding —
      // fixing the value proves they can act, not that they know why.
      React.createElement('div', {
        style: { flex: '1 1 340px', minWidth: '300px', maxWidth: '520px',
                 paddingLeft: '20px', borderLeft: '1px solid rgba(255,255,255,.12)' }
      },
        React.createElement('div', {
          style: { fontSize: '10px', fontWeight: 800, letterSpacing: '.4px',
                   color: '#9db0c8', marginBottom: '5px' }
        }, 'YOUR DIAGNOSIS'),
        React.createElement('textarea', {
          value: diag, rows: 6,
          placeholder: 'What do you think happened, and what evidence tells you that?',
          onChange: function (e) { setDiag(e.target.value); setDiagSaved(false); },
          style: { width: '100%', boxSizing: 'border-box', padding: '7px 9px',
                   borderRadius: '5px', fontSize: '12px', lineHeight: 1.45,
                   fontFamily: 'inherit', resize: 'vertical',
                   background: '#141a26', border: '1px solid #38445c', color: '#e8edf6' }
        }),
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '9px', marginTop: '6px' }
        },
          React.createElement('button', {
            type: 'button',
            // Disabled in preview: the diagnosis belongs to a student's attempt, and an
            // instructor has none. Writing one would create an attempt row against the
            // instructor's own account and show up in their results table as a submission.
            disabled: !diag.trim() || preview,
            onClick: function () {
              if (preview) return;
              if (ES.saveDiagnosis(ex.id, auth.operator, diag)) setDiagSaved(true);
            },
            style: { padding: '5px 13px', borderRadius: '5px', fontSize: '11px',
                     fontWeight: 800, fontFamily: 'inherit',
                     cursor: (diag.trim() && !preview) ? 'pointer' : 'not-allowed',
                     border: '1px solid ' + ((diag.trim() && !preview) ? '#2f7a52' : '#38445c'),
                     background: (diag.trim() && !preview)
                       ? 'linear-gradient(180deg,#3f8f5a,#2d7346)' : '#1b2230',
                     color: (diag.trim() && !preview) ? '#fff' : '#5d6b83' }
          }, diagSaved ? '\u2713 SAVED' : 'SAVE ANSWER'),
          React.createElement('span', {
            style: { fontSize: '10px', color: preview ? '#ffd79a' : '#7f8ea6' }
          }, preview
              ? 'Preview \u2014 nothing you do here is saved or graded.'
              : 'Your instructor sees this with your results.')
        )
      )
    ) : null,

    // Completion is the moment the exercise teaches something, so it says what was
    // achieved rather than only that it ended.
    passed ? React.createElement('div', {
      style: { padding: '8px 14px', borderTop: '1px solid rgba(47,122,82,.5)',
               background: 'rgba(63,143,90,.14)', fontSize: '11.5px',
               color: '#8ff0b5', lineHeight: 1.5 }
    },
      React.createElement('strong', null, 'Goal met and held. '),
      'You brought ' + ((g.label || 'the reading')) + ' to ' + ES.goalText(ex) + '.',
      (g.standard && window.ASHRAECriteria)
        ? ' That is the ' + window.ASHRAECriteria.badge(g.standard) + ' criterion for this unit.'
        : ''
    ) : null
    );
  }

  window.ExerciseList = ExerciseList;
  window.ExerciseRunBanner = ExerciseRunBanner;
  window.ExerciseActive = { activeId: activeId, setActiveId: setActiveId };
})();
