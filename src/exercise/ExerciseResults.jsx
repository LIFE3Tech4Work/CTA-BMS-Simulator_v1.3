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
    var B = window.SupabaseBackend;
    var backendOn = !!(B && B.isConfigured());
    var [syncing, setSyncing] = useState(false);
    var [syncedAt, setSyncedAt] = useState(null);
    var [syncNote, setSyncNote] = useState(null);
    var [uploading, setUploading] = useState(false);

    // Local exercises that the server has no record of yet.
    function unpushed() {
      if (!backendOn) return [];
      return (ES.listExercises() || []).filter(function (ex) {
        // createdBy is a uuid once pushed by a signed-in account; a demo operator name
        // means it was authored without a session and never reached the server.
        return !/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(String(ex.createdBy || ''));
      });
    }

    function uploadLocal() {
      var B2 = window.SupabaseBackend;
      if (!B2 || uploading) return;
      var pending = unpushed();
      if (!pending.length) return;
      setUploading(true);
      B2.getClient().then(function (c) {
        if (!c) { setUploading(false); return; }
        return c.auth.getUser().then(function (u) {
          var uid = u && u.data && u.data.user && u.data.user.id;
          if (!uid) {
            setUploading(false);
            setSyncNote('Sign in with your email account before uploading.');
            return;
          }
          // Re-stamp ownership so the server rows belong to the signed-in instructor;
          // the RLS policy keys on created_by, so a row pushed under a demo name would
          // be invisible even to its author.
          var chain = Promise.resolve();
          pending.forEach(function (ex) {
            chain = chain.then(function () {
              var owned = Object.assign({}, ex, { createdBy: uid });
              ES.saveExercise(owned);
              return B2.pushExercise(owned);
            });
          });
          return chain.then(function () {
            setUploading(false);
            setSyncNote(null);
            refresh();
          });
        });
      });
    }

    function refresh() {
      if (!backendOn || syncing) return;
      setSyncing(true);
      B.syncDown().then(function (res) {
        setSyncing(false);
        setSyncedAt(new Date());
        // Roster, groups, exercises and attempts all landed — redraw from the cache.
        bump(function (n) { return n + 1; });
        // A demo account has no server session, which is expected rather than an
        // error — say so inline instead of throwing an alert at every refresh.
        if (res && res.noSession) { setSyncNote('demo'); return; }
        setSyncNote(null);
        if (res && res.ok === false) {
          var st = B.getStatus();
          if (st && st.lastError) setSyncNote(st.lastError);
        }
      });
    }

    // Pull once on mount, then on a slow interval. New signups and freshly submitted
    // work appear without the instructor doing anything, and the button is there for
    // when they want it now.
    useEffect(function () {
      if (!backendOn) return;
      refresh();
      var iv = setInterval(refresh, 45000);
      // A student submitting while the instructor watches should not wait 45s.
      function onFocus() { refresh(); }
      window.addEventListener('focus', onFocus);
      return function () { clearInterval(iv); window.removeEventListener('focus', onFocus); };
    }, [backendOn]);
    var [, bump] = useState(0);
    var [openId, setOpenId] = useState(null);
    // Which exercise is being edited, and its in-progress values. Held apart from the
    // saved record so CANCEL genuinely discards.
    var [editingId, setEditingId] = useState(null);
    var [draft, setDraft] = useState({});

    var EDIT_LBL = { fontSize: '9.5px', fontWeight: 800, letterSpacing: '.4px',
                     color: '#7f8ea6', marginBottom: '3px' };
    var EDIT_IN = { padding: '5px 8px', borderRadius: '4px', fontSize: '11.5px',
                    fontFamily: 'inherit', background: '#1b2536',
                    border: '1px solid #46536b', color: '#e8edf6', boxSizing: 'border-box' };

    function startEdit(ex) {
      if (editingId === ex.id) { setEditingId(null); return; }
      setDraft({
        // Targeting travels in the draft too, so CANCEL discards a roster change the
        // same way it discards a typo.
        mode: (ex.assignment && ex.assignment.mode) || 'students',
        groupIds: ((ex.assignment && ex.assignment.groupIds) || []).slice(),
        seatIds: (ex.assignedTo || []).slice(),
        title: ex.title || '',
        instructions: ex.instructions || '',
        target: String((ex.goal && ex.goal.target) != null ? ex.goal.target : ''),
        tolerance: String((ex.goal && ex.goal.tolerance) != null ? ex.goal.tolerance : ''),
        published: !!ex.published,
        // Copied, not referenced, so editing a value does not mutate the saved record
        // before SAVE CHANGES is pressed.
        setup: Object.assign({}, ex.setup || {}),
        goalKey: (ex.goal && ex.goal.key) || '',
        comparator: (ex.goal && ex.goal.comparator) || 'within',
        criterionId: (ex.goal && ex.goal.criterionId) || '',
        standard: (ex.goal && ex.goal.standard) || null,
        criterionLabel: (ex.goal && ex.goal.criterionLabel) || null,
        citation: (ex.goal && ex.goal.citation) || null,
        basis: (ex.goal && ex.goal.basis) || null
      });
      setEditingId(ex.id);
    }

    function saveEdit(ex) {
      // Merged onto the existing record rather than rebuilt, so the setup, trends,
      // assignment and criterion citation all survive an edit to the wording.
      var G = window.StudentGroups;
      var assignment = { mode: draft.mode, groupIds: draft.groupIds, seatIds: draft.seatIds };

      // Was the targeting touched at all? Editing a brief or a setpoint must not
      // recompute who is assigned — resolveSeats drops any id that is not a live
      // account, and every seeded exercise names placeholder seats.
      var prevAsg = ex.assignment || {};
      var sameSeats = JSON.stringify((prevAsg.seatIds || []).slice().sort()) ===
                      JSON.stringify((draft.seatIds || []).slice().sort());
      var sameGroups = JSON.stringify((prevAsg.groupIds || []).slice().sort()) ===
                       JSON.stringify((draft.groupIds || []).slice().sort());
      var targetingUnchanged = (prevAsg.mode || 'students') === draft.mode &&
                               sameSeats && sameGroups;
      // Flattened here for the same reason the author dialog flattens it: everything
      // downstream reads assignedTo, and resolving in one place keeps the two screens
      // from disagreeing about who an exercise reached.
      var resolved = G ? G.resolveSeats(assignment) : draft.seatIds;
      var next = Object.assign({}, ex, {
        assignment: assignment,
        assignedTo: resolved,
        title: draft.title.trim() || ex.title,
        instructions: draft.instructions,
        published: !!draft.published,
        goal: Object.assign({}, ex.goal, {
          key: draft.goalKey || ex.goal.key,
          comparator: draft.comparator || ex.goal.comparator,
          target: draft.target === '' ? ex.goal.target : Number(draft.target),
          tolerance: draft.tolerance === '' ? ex.goal.tolerance : Number(draft.tolerance),
          // The ASHRAE fields travel with the goal so the student's brief, the banner
          // badge and the instructor's report all cite the same standard. Cleared
          // together when the criterion is detached, rather than leaving a stale
          // citation attached to a hand-typed target.
          standard: draft.standard || null,
          criterionId: draft.criterionId || null,
          criterionLabel: draft.criterionLabel || null,
          citation: draft.citation || null,
          basis: draft.basis || null
        })
      });
      // Numeric-looking values go back as numbers. Left as strings, a setpoint would be
      // compared against text and the fault would silently not apply.
      var setupOut = {};
      Object.keys(draft.setup || {}).forEach(function (k) {
        var v = draft.setup[k];
        if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) {
          setupOut[k] = Number(v);
        } else if (v === 'true' || v === 'false') {
          setupOut[k] = (v === 'true');
        } else {
          setupOut[k] = v;
        }
      });
      next.setup = setupOut;
      // Keep the existing recipients when the instructor did not touch targeting. When
      // they did, keep any named id the resolver could not account for rather than
      // dropping a student who simply has no account yet.
      if (targetingUnchanged) {
        next.assignedTo = (ex.assignedTo || []).slice();
      } else {
        var resolved = next.assignedTo || [];
        var named = (draft.mode === 'students') ? (draft.seatIds || []) : [];
        var union = resolved.slice();
        named.forEach(function (s) { if (union.indexOf(s) < 0) union.push(s); });
        next.assignedTo = union;
      }

      ES.saveExercise(next);
      setEditingId(null);
      bump(function (n) { return n + 1; });
    }
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

      // With a backend, a browser CANNOT set another person's password — that needs
      // the service role key, which must never ship to a client. What it can do is
      // send that student a reset link. Handing out a temporary password here would
      // have written it into local storage for an account that lives on the server:
      // it would report success and change nothing the student could use.
      if (LA.backendActive && LA.backendActive()) {
        if (!acct || !acct.email) {
          setResetInfo({ seat: seat, error: 'No email on file for this student.' });
          return;
        }
        setResetInfo({ seat: seat, sending: true });
        LA.resetPasswordAsync(acct.email, '').then(function (res) {
          if (!res || !res.ok) {
            setResetInfo({ seat: seat, error: (res && res.error) || 'Could not send the reset email.' });
            return;
          }
          setResetInfo({ seat: seat, emailedTo: acct.email });
        });
        return;
      }

      // No backend: local accounts are the record, so a temporary password is both
      // possible and the fastest way to get a student back in.
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
      // The written answer, shown under the row. On a diagnosis exercise this is the
      // whole submission — a pass/fail column alone would grade the click and ignore
      // the reasoning the exercise was set to elicit.
      var diagnosis = attempt && attempt.diagnosis;
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
        // The written answer sits above the action log and outside the expander: on a
        // diagnosis exercise it IS the submission, and hiding it behind a click meant an
        // instructor marking a class would never see the reasoning they set the task for.
        diagnosis ? React.createElement('div', {
          style: { margin: '0 10px 8px', padding: '8px 10px', borderRadius: '5px',
                   background: 'rgba(127,212,226,.08)', border: '1px solid #2b6f7d' }
        },
          React.createElement('div', {
            style: { fontSize: '9.5px', fontWeight: 800, letterSpacing: '.4px',
                     color: '#7fd4e2', marginBottom: '4px' }
          }, 'STUDENT DIAGNOSIS'),
          React.createElement('div', {
            style: { fontSize: '11.5px', color: '#e8edf6', lineHeight: 1.5,
                     whiteSpace: 'pre-line' }
          }, diagnosis)
        ) : null,
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
          editingId === ex.id ? React.createElement('div', {
            style: { padding: '11px 12px', borderTop: '1px solid rgba(53,64,90,.6)',
                     background: '#141a26' }
          },
            React.createElement('div', { style: EDIT_LBL }, 'TITLE'),
            React.createElement('input', {
              value: draft.title, onChange: function (e) { setDraft(Object.assign({}, draft, { title: e.target.value })); },
              style: Object.assign({}, EDIT_IN, { width: '100%' })
            }),
            React.createElement('div', { style: Object.assign({}, EDIT_LBL, { marginTop: '8px' }) }, 'BRIEF FOR STUDENTS'),
            React.createElement('textarea', {
              value: draft.instructions, rows: 4,
              onChange: function (e) { setDraft(Object.assign({}, draft, { instructions: e.target.value })); },
              style: Object.assign({}, EDIT_IN, { width: '100%', resize: 'vertical', lineHeight: 1.45 })
            }),
            // Criterion first: picking one rewrites the point, comparator and target
            // together, which is the order the goal is actually reasoned in.
            React.createElement('div', { style: Object.assign({}, EDIT_LBL, { marginTop: '10px' }) },
              'SUCCESS CRITERION'),
            (function () {
              var AC = window.ASHRAECriteria;
              if (!AC) return null;
              var st = (function () {
                var CTRL = { 'AHU-4-6': 'AHU46Controller', 'AHU-4-4': 'AHU44NewController',
                             'AHU-4-3': 'AHU43Controller', 'AHU-23-1': 'AHU23Controller' };
                var c = window[CTRL[ex.unitId]];
                if (c && c.getState) return c.getState();
                var v = window.VAVController;
                return (v && v.getState) ? v.getState(ex.unitId) : {};
              })();
              return React.createElement('select', {
                value: draft.criterionId || '',
                onChange: function (e) {
                  var id = e.target.value;
                  if (!id) { setDraft(Object.assign({}, draft, { criterionId: '', standard: null })); return; }
                  var c = AC.byId(id);
                  var g = c && c.goalFor(st);
                  if (!g) return;
                  // Point, comparator and target move together — leaving the old target
                  // beside a new criterion is how a goal ends up unreachable.
                  setDraft(Object.assign({}, draft, {
                    criterionId: id, standard: c.standard, citation: c.citation,
                    criterionLabel: c.label, basis: c.basis,
                    goalKey: g.key, comparator: g.comparator,
                    target: String(g.target), tolerance: String(g.tolerance)
                  }));
                },
                style: Object.assign({}, EDIT_IN, { width: '100%' })
              },
                React.createElement('option', { value: '' }, 'Custom target (no standard)'),
                ['62.1', '55', '90.1', '36'].map(function (std) {
                  var group = AC.forState(st).filter(function (c) { return c.standard === std; });
                  if (!group.length) return null;
                  return React.createElement('optgroup', { key: std, label: AC.badge(std) },
                    group.map(function (c) {
                      return React.createElement('option', { key: c.id, value: c.id }, c.label);
                    }));
                })
              );
            })(),

            React.createElement('div', { style: { display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' } },
              React.createElement('div', null,
                React.createElement('div', { style: EDIT_LBL }, 'MEASURED POINT'),
                React.createElement('input', {
                  value: draft.goalKey || '',
                  onChange: function (e) {
                    // Typing a point by hand detaches it from the criterion, rather than
                    // leaving it citing a standard whose measurement no longer matches.
                    setDraft(Object.assign({}, draft, { goalKey: e.target.value,
                                                        criterionId: '', standard: null }));
                  },
                  style: Object.assign({}, EDIT_IN, { width: '170px', fontFamily: 'monospace' })
                })
              ),
              React.createElement('div', null,
                React.createElement('div', { style: EDIT_LBL }, 'COMPARATOR'),
                React.createElement('select', {
                  value: draft.comparator || 'within',
                  onChange: function (e) { setDraft(Object.assign({}, draft, { comparator: e.target.value })); },
                  style: Object.assign({}, EDIT_IN, { width: '110px' })
                },
                  ['within', 'above', 'below', 'equals'].map(function (c) {
                    return React.createElement('option', { key: c, value: c }, c);
                  })
                )
              ),
              React.createElement('div', null,
                React.createElement('div', { style: EDIT_LBL }, 'TARGET'),
                React.createElement('input', {
                  type: 'number', step: 'any', value: draft.target,
                  onChange: function (e) { setDraft(Object.assign({}, draft, { target: e.target.value })); },
                  style: Object.assign({}, EDIT_IN, { width: '90px' })
                })
              ),
              React.createElement('div', null,
                React.createElement('div', { style: EDIT_LBL }, 'TOLERANCE'),
                React.createElement('input', {
                  type: 'number', step: 'any', value: draft.tolerance,
                  onChange: function (e) { setDraft(Object.assign({}, draft, { tolerance: e.target.value })); },
                  style: Object.assign({}, EDIT_IN, { width: '90px' })
                })
              ),
              React.createElement('label', {
                style: { display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end',
                         fontSize: '11px', color: '#c3cfdd', fontWeight: 700 }
              },
                React.createElement('input', {
                  type: 'checkbox', checked: !!draft.published,
                  onChange: function (e) { setDraft(Object.assign({}, draft, { published: e.target.checked })); }
                }),
                'Published'
              )
            ),
            // ── Who gets it ────────────────────────────────────────────────────
            React.createElement('div', { style: Object.assign({}, EDIT_LBL, { marginTop: '10px' }) }, 'ASSIGNED TO'),
            React.createElement('div', { style: { display: 'flex', gap: '4px', marginBottom: '7px' } },
              [['class', 'Whole class'], ['groups', 'Groups'], ['students', 'Individuals']]
                .map(function (mo) {
                  var on = draft.mode === mo[0];
                  return React.createElement('button', {
                    key: mo[0], type: 'button',
                    onClick: function () { setDraft(Object.assign({}, draft, { mode: mo[0] })); },
                    style: { flex: 1, padding: '5px 4px', borderRadius: '5px', fontSize: '10.5px',
                             fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                             background: on ? 'linear-gradient(180deg,#3f8f5a,#2d7346)' : '#1b2230',
                             border: '1px solid ' + (on ? '#2f7a52' : '#46536b'),
                             color: on ? '#fff' : '#c3cfdd' }
                  }, mo[1]);
                })
            ),

            draft.mode === 'class' ? React.createElement('div', {
              style: { fontSize: '10.5px', color: '#9db0c8', lineHeight: 1.45 }
            }, 'Every student account gets this, including anyone who signs up later.') : null,

            draft.mode === 'groups' ? React.createElement('div', {
              style: { display: 'flex', flexWrap: 'wrap', gap: '5px' }
            },
              (window.StudentGroups ? window.StudentGroups.all() : []).map(function (g) {
                var on = draft.groupIds.indexOf(g.id) >= 0;
                return React.createElement('button', {
                  key: g.id, type: 'button',
                  onClick: function () {
                    var nx = on ? draft.groupIds.filter(function (x) { return x !== g.id; })
                               : draft.groupIds.concat([g.id]);
                    setDraft(Object.assign({}, draft, { groupIds: nx }));
                  },
                  style: { padding: '4px 10px', borderRadius: '999px', fontSize: '11px',
                           fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                           background: on ? 'linear-gradient(180deg,#3f8f5a,#2d7346)' : '#1b2230',
                           border: '1px solid ' + (on ? '#2f7a52' : '#46536b'),
                           // An empty team assigns to nobody, so it is called out.
                           color: on ? '#fff' : (g.seatIds.length ? '#c3cfdd' : '#e6a23c') }
                }, window.StudentGroups.label(g));
              }),
              (window.StudentGroups && !window.StudentGroups.all().length)
                ? React.createElement('span', { style: { fontSize: '10.5px', color: '#9db0c8' } },
                    'No groups yet — create them in Save as Exercise on the station.')
                : null
            ) : null,

            draft.mode === 'students' ? React.createElement('div', {
              style: { display: 'flex', flexWrap: 'wrap', gap: '5px' }
            },
              (window.StudentRoster ? window.StudentRoster.seats() : []).map(function (seat) {
                var on = draft.seatIds.indexOf(seat) >= 0;
                var R = window.StudentRoster;
                return React.createElement('button', {
                  key: seat, type: 'button',
                  onClick: function () {
                    var nx = on ? draft.seatIds.filter(function (x) { return x !== seat; })
                               : draft.seatIds.concat([seat]);
                    setDraft(Object.assign({}, draft, { seatIds: nx }));
                  },
                  title: R ? R.displayLong(seat) : seat,
                  style: { padding: '4px 10px', borderRadius: '999px', fontSize: '11px',
                           fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                           background: on ? 'linear-gradient(180deg,#3f8f5a,#2d7346)' : '#1b2230',
                           border: '1px solid ' + (on ? '#2f7a52' : '#46536b'),
                           color: on ? '#fff' : '#c3cfdd' }
                }, R ? R.displayName(seat) : seat);
              })
            ) : null,

            // What the change will actually do, before it is saved. Adding a student
            // mid-exercise must not read as if it wiped everyone else's attempts.
            (function () {
              var G = window.StudentGroups;
              var willReach = G ? G.resolveSeats({
                mode: draft.mode, groupIds: draft.groupIds, seatIds: draft.seatIds
              }) : draft.seatIds;
              var current = ex.assignedTo || [];
              var added = willReach.filter(function (x) { return current.indexOf(x) < 0; });
              var removed = current.filter(function (x) { return willReach.indexOf(x) < 0; });
              // A removed student's attempt is kept, not deleted — it is a record of work
              // they did, and losing it because a roster was corrected would be wrong.
              var withWork = removed.filter(function (x) {
                return ES.statusFor(ex, x) !== 'not-started';
              });
              return React.createElement('div', {
                style: { marginTop: '7px', fontSize: '10px', lineHeight: 1.5,
                         color: willReach.length ? '#8ff0b5' : '#e6a23c' }
              },
                willReach.length
                  ? willReach.length + ' student' + (willReach.length === 1 ? '' : 's') + ' will see this' +
                    (added.length ? '  \u00b7  +' + added.length + ' added' : '') +
                    (removed.length ? '  \u00b7  \u2212' + removed.length + ' removed' : '')
                  : 'Nobody will see this \u2014 pick a group with students in it, or choose individuals.',
                withWork.length ? React.createElement('div', {
                  style: { color: '#ffd79a', marginTop: '3px' }
                }, withWork.length + ' of those removed already started \u2014 their results are kept.') : null
              );
            })(),

            // The detail an instructor could not see anywhere: what the exercise breaks,
            // and whether it carries an authored history.
            React.createElement('div', { style: Object.assign({}, EDIT_LBL, { marginTop: '10px' }) },
              'STARTING STATE \u2014 WHAT THE EXERCISE BREAKS'),
            Object.keys(draft.setup || {}).length
              ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px' } },
                  Object.keys(draft.setup).map(function (k) {
                    return React.createElement('div', {
                      key: k, style: { display: 'flex', alignItems: 'center', gap: '7px' }
                    },
                      React.createElement('span', {
                        style: { flex: 1, fontSize: '11px', color: '#c3cfdd', fontFamily: 'monospace' }
                      }, k),
                      React.createElement('input', {
                        value: String(draft.setup[k]),
                        onChange: function (e) {
                          var next = Object.assign({}, draft.setup);
                          next[k] = e.target.value;
                          setDraft(Object.assign({}, draft, { setup: next }));
                        },
                        style: Object.assign({}, EDIT_IN, { width: '110px', textAlign: 'right' })
                      }),
                      React.createElement('button', {
                        type: 'button', title: 'Drop this from the starting state',
                        onClick: function () {
                          var next = Object.assign({}, draft.setup);
                          delete next[k];
                          setDraft(Object.assign({}, draft, { setup: next }));
                        },
                        style: { padding: '4px 8px', borderRadius: '4px', fontSize: '10px',
                                 fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
                                 border: '1px solid #46536b', background: '#1b2230', color: '#9db0c8' }
                      }, 'REMOVE')
                    );
                  })
                )
              : React.createElement('div', {
                  style: { fontSize: '11px', color: '#9db0c8', lineHeight: 1.5 }
                }, 'Nothing faulted \u2014 the unit starts at its defaults.'),
            React.createElement('div', {
              style: { fontSize: '10px', color: '#6f7f97', marginTop: '5px', lineHeight: 1.45 }
            }, 'Applied to the unit when a student starts. Numbers stay numbers and ON/OFF stays text, so both work.'),
            (ex.trends && Object.keys(ex.trends).length) ? React.createElement('div', {
              style: { fontSize: '11px', color: '#7fd4e2', lineHeight: 1.5, marginTop: '4px' }
            }, 'Authored history on: ' + Object.keys(ex.trends).join(', ')) : null,
            React.createElement('div', { style: { display: 'flex', gap: '7px', marginTop: '11px' } },
              React.createElement('button', {
                type: 'button', onClick: function () { saveEdit(ex); },
                style: { padding: '6px 14px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                         fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #2f7a52',
                         background: 'linear-gradient(180deg,#3f8f5a,#2d7346)', color: '#fff' }
              }, 'SAVE CHANGES'),
              React.createElement('button', {
                type: 'button', onClick: function () { setEditingId(null); },
                style: { padding: '6px 14px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                         fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #46536b',
                         background: '#1b2230', color: '#c3cfdd' }
              }, 'CANCEL')
            )
          ) : null,

          React.createElement('div', {
            style: { display: 'flex', gap: '8px', padding: '10px 12px',
                     borderTop: '1px solid rgba(53,64,90,.6)' }
          },
            React.createElement('button', {
              type: 'button',
              title: 'Load this exercise\u2019s starting state onto the unit so you can walk through it',
              onClick: function () {
                ES.applySetup(ex);
                // Point the banner at THIS exercise. Without it the banner kept showing
                // whichever exercise was previewed first — the active id lives in
                // localStorage and nothing here updated it, so switching exercises moved
                // the unit but left the old task on screen. Uses the list's own setter so
                // both paths write the key and fire the same event.
                if (window.ExerciseActive) window.ExerciseActive.setActiveId(ex.id);
                window.location.hash = '#/symmetre/' + ex.unitId;
              },
              style: { padding: '5px 11px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                       fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #46536b',
                       background: '#242e42', color: '#c3cfdd' }
            }, 'PREVIEW ON UNIT'),
            React.createElement('button', {
              type: 'button',
              title: 'Edit this exercise',
              onClick: function () { startEdit(ex); },
              style: { padding: '5px 11px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                       fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #46536b',
                       background: '#242e42', color: '#c3cfdd' }
            }, editingId === ex.id ? 'CLOSE EDITOR' : 'EDIT'),
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
                  title: (window.LocalAccounts && window.LocalAccounts.backendActive())
                    ? 'Email this student a password reset link'
                    : 'Set a temporary password and show it once',
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
                  : shown.sending
                    ? 'Sending\u2026'
                    : shown.emailedTo
                      // With a backend the browser cannot set someone else's password,
                      // so the honest outcome is a link sent to them.
                      ? React.createElement('span', null,
                          'Reset link sent to ',
                          React.createElement('strong', null, shown.emailedTo),
                          '. They set their own password from that email.'
                        )
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
      // Refresh control first: everything below it is a snapshot of the last sync, and
      // a stale screen that looks live is how an instructor concludes a student never
      // submitted anything.
      backendOn ? React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' }
      },
        React.createElement('button', {
          type: 'button', onClick: refresh, disabled: syncing,
          style: { padding: '5px 11px', borderRadius: '5px', fontSize: '11px', fontWeight: 700,
                   cursor: syncing ? 'default' : 'pointer', fontFamily: 'inherit',
                   background: '#1b2230', border: '1px solid #38445c',
                   color: syncing ? '#6f7f97' : '#c3cfdd' }
        }, syncing ? 'Refreshing\u2026' : '\u21bb Refresh from server'),
        // Only shown when there is something to upload, so it is not a permanent
        // button inviting a no-op.
        (backendOn && unpushed().length) ? React.createElement('button', {
          type: 'button', onClick: uploadLocal, disabled: uploading,
          title: 'Send exercises authored in this browser to the server so students on other machines can be assigned them',
          style: { padding: '5px 11px', borderRadius: '5px', fontSize: '11px', fontWeight: 700,
                   cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit',
                   background: 'linear-gradient(180deg,#3f8f5a,#2d7346)',
                   border: '1px solid #2f7a52', color: '#fff' }
        }, uploading ? 'Uploading\u2026' : '\u2191 Upload ' + unpushed().length + ' local to server') : null,
        React.createElement('span', {
          style: { fontSize: '10.5px', color: syncNote ? '#e6a23c' : '#6f7f97' }
        },
          syncNote === 'demo'
            ? 'Signed in with a demo account \u2014 showing local data only. Sign in with your email to see server records.'
          : syncNote ? 'Refresh failed: ' + syncNote
          : syncedAt
            ? 'Updated ' + syncedAt.toLocaleTimeString('en-US',
                { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : 'Picks up new sign-ups and submitted work')
      ) : null,
      // Student Accounts list removed: it duplicated the roster already shown per
      // exercise below, and RESET PASSWORD is reachable from each student's own row —
      // so this was a second copy of the same names competing with the results.
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
