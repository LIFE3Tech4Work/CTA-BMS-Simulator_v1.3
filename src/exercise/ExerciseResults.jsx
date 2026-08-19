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
    // The temporary password just issued, shown once under its own row. Held in
    // state rather than persisted: it is a hand-off to the person standing there,
    // not a record — storing it would recreate the hole this control replaced.
    var [resetInfo, setResetInfo] = useState(null);

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

    // Readable rather than random-looking: it gets spoken aloud across a classroom,
    // so no characters that are ambiguous out loud (0/O, 1/l/I) and a short digit run.
    function tempPassword() {
      var words = ['maple', 'harbor', 'quartz', 'ember', 'willow', 'cobalt', 'summit', 'cedar'];
      return words[Math.floor(Math.random() * words.length)] +
             String(Math.floor(Math.random() * 90) + 10);
    }

    function resetStudentPassword(seat) {
      var LA = window.LocalAccounts, R = window.StudentRoster;
      if (!LA || !R) return;
      var acct = LA.get(seat) || R.get(seat);
      var pw = tempPassword();
      var res = LA.resetPassword(seat, acct.email, pw);
      if (!res || !res.ok) {
        setResetInfo({ seat: seat, error: (res && res.error) || 'Could not reset that password.' });
        return;
      }
      setResetInfo({ seat: seat, password: pw });
    }

    function renderStudentRow(ex, seat) {
      var attempt = ES.attemptFor(ex.id, seat);
      var status = ES.statusFor(ex, seat);
      var logKey = ex.id + '|' + seat;
      var isOpen = openLog === logKey;
      var actions = (attempt && attempt.actions) || [];
      // Only real self-registered accounts can be reset. The shared demo seats live
      // in AuthContext's fixed list and have no stored credential to replace, so
      // offering the button there would fail rather than help.

      return React.createElement('div', { key: seat, style: { borderTop: '1px solid rgba(53,64,90,.6)' } },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px' }
        },
          React.createElement('span', {
            style: { width: '150px', flexShrink: 0, lineHeight: 1.25 },
            title: (window.StudentRoster ? window.StudentRoster.displayLong(seat) + '  ' : '') + '(' + seat + ')'
          },
            React.createElement('div', {
              style: { fontSize: '11.5px', fontWeight: 700, color: '#e8edf6',
                       overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
            }, window.StudentRoster ? window.StudentRoster.displayName(seat) : seat),
            // Email underneath rather than beside: it is the identifier an
            // instructor uses to chase someone up, but not what they scan by.
            (window.StudentRoster && window.StudentRoster.get(seat).email)
              ? React.createElement('div', {
                  style: { fontSize: '9.5px', color: '#7f8ea6', overflow: 'hidden',
                           textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                }, window.StudentRoster.get(seat).email)
              : null
          ),
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

    // Grouped by team when the exercise was assigned by group, flat otherwise.
    // A team project reported as six unrelated rows tells an instructor nothing
    // about how the teams did, which is the thing they need to know.
    function studentRows(ex, seats) {
      var G = window.StudentGroups;
      var asg = ex.assignment;
      if (!G || !asg || asg.mode !== 'groups' || !(asg.groupIds || []).length) {
        return React.createElement('div', null,
          seats.map(function (s) { return renderStudentRow(ex, s); }));
      }
      var placed = {};
      var blocks = (asg.groupIds || []).map(function (gid) {
        var g = G.get(gid);
        if (!g) return null;
        var members = g.seatIds.filter(function (s) { return seats.indexOf(s) >= 0; });
        members.forEach(function (s) { placed[s] = true; });
        var passed = members.filter(function (s) { return ES.statusFor(ex, s) === 'passed'; }).length;
        return React.createElement('div', { key: gid },
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                     padding: '5px 12px', background: '#141a26',
                     borderTop: '1px solid #232c3d', borderBottom: '1px solid #232c3d' }
          },
            React.createElement('span', {
              style: { fontSize: '10px', fontWeight: 800, letterSpacing: '.4px', color: '#9db0c8' }
            }, g.name.toUpperCase()),
            React.createElement('span', {
              style: { fontSize: '10px', fontWeight: 700,
                       color: (members.length && passed === members.length) ? '#8ff0b5' : '#7f8ea6' }
            }, passed + ' of ' + members.length + ' passed')
          ),
          members.map(function (s) { return renderStudentRow(ex, s); })
        );
      }).filter(Boolean);

      // A seat in the list but in none of the chosen groups — happens if a
      // student was removed from a team after the exercise was published.
      var orphans = seats.filter(function (s) { return !placed[s]; });
      if (orphans.length) {
        blocks.push(React.createElement('div', { key: '__ungrouped' },
          React.createElement('div', {
            style: { padding: '5px 12px', background: '#141a26', fontSize: '10px',
                     fontWeight: 800, letterSpacing: '.4px', color: '#e6a23c',
                     borderTop: '1px solid #232c3d' }
          }, 'NO LONGER IN A GROUP'),
          orphans.map(function (s) { return renderStudentRow(ex, s); })
        ));
      }
      return React.createElement('div', null, blocks);
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
            ? studentRows(ex, seats)
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

    // Student accounts, with the one action an instructor needs when somebody cannot
    // sign in. Driven by the account store rather than by any exercise's assignment
    // list, because a locked-out student is locked out regardless of what they were
    // assigned.
    function renderAccounts() {
      var LA = window.LocalAccounts, R = window.StudentRoster;
      if (!LA || typeof LA.all !== 'function') return null;
      var accounts = LA.all();
      if (!accounts.length) return null;
      return React.createElement('div', { style: { marginBottom: '22px' } },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }
        },
          React.createElement('span', { style: { fontSize: '15px', fontWeight: 800, color: '#fff' } },
            'Student Accounts'),
          React.createElement('span', { style: { fontSize: '11.5px', color: '#9db0c8' } },
            accounts.length + (accounts.length === 1 ? ' registered' : ' registered'))
        ),
        React.createElement('div', {
          style: { border: '1px solid #35405a', borderRadius: '8px', background: '#1b2536',
                   overflow: 'hidden' }
        },
          accounts.map(function (a, idx) {
            var shown = resetInfo && resetInfo.seat === a.username ? resetInfo : null;
            var name = (a.firstName || a.lastName)
              ? ((a.firstName || '') + ' ' + (a.lastName || '')).trim()
              : a.username;
            return React.createElement('div', {
              key: a.username,
              style: idx ? { borderTop: '1px solid rgba(53,64,90,.6)' } : null
            },
              React.createElement('div', {
                style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px' }
              },
                React.createElement('span', { style: { lineHeight: 1.25, minWidth: 0, flex: 1 } },
                  React.createElement('div', {
                    style: { fontSize: '11.5px', fontWeight: 700, color: '#e8edf6' }
                  }, name),
                  React.createElement('div', {
                    style: { fontSize: '9.5px', color: '#7f8ea6' }
                  }, a.email || a.username)
                ),
                React.createElement('button', {
                  type: 'button',
                  onClick: function () { resetStudentPassword(a.username); },
                  title: 'Set a temporary password and show it once',
                  style: { padding: '3px 9px', borderRadius: '4px', fontSize: '10px',
                           fontWeight: 800, letterSpacing: '.3px', fontFamily: 'inherit',
                           cursor: 'pointer', background: '#1b2230',
                           border: '1px solid #46536b', color: '#c3cfdd', flexShrink: 0 }
                }, 'RESET PASSWORD')
              ),
              shown ? React.createElement('div', {
                style: { padding: '0 10px 9px', fontSize: '11px', lineHeight: 1.45,
                         color: shown.error ? '#ff8a7e' : '#8ff0b5' }
              }, shown.error
                  ? shown.error
                  : React.createElement('span', null,
                      'Temporary password: ',
                      React.createElement('code', {
                        style: { fontFamily: 'ui-monospace,Menlo,monospace', fontSize: '12.5px',
                                 fontWeight: 700, padding: '1px 6px', borderRadius: '3px',
                                 background: 'rgba(255,255,255,.10)', color: '#e8edf6' }
                      }, shown.password),
                      '  \u2014 read it to them now. It is not shown again and nothing is emailed.'
                    )
              ) : null
            );
          })
        )
      );
    }

    return React.createElement('div', { style: { fontFamily: FONT, marginBottom: '22px' } },
      renderAccounts(),
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
