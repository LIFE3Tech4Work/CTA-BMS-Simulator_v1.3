/**
 * ExerciseAuthor.jsx — instructor authoring: the per-unit "Create exercise"
 * shortcut, the authoring banner, and the save dialog.
 *
 * The flow is deliberately "work the unit, then describe it": an instructor
 * arms authoring, breaks the unit on the live diagram exactly as they would
 * demonstrate it, then saves. What they see on screen IS the exercise, so there
 * is no second representation of the fault to get out of step with the model.
 *
 * No import/export — exposes window.ExerciseAuthorButton and
 * window.ExerciseAuthorBanner
 */
(function () {
  'use strict';

  var useState = React.useState, useEffect = React.useEffect, useContext = React.useContext;

  var ARM_KEY = 'cta_exercise_authoring';

  function isArmed() {
    try { return localStorage.getItem(ARM_KEY) === '1'; } catch (e) { return false; }
  }
  function setArmed(on) {
    try { on ? localStorage.setItem(ARM_KEY, '1') : localStorage.removeItem(ARM_KEY); } catch (e) {}
    window.dispatchEvent(new CustomEvent('cta-authoring-changed'));
  }

  function useArmed() {
    var s = useState(isArmed);
    useEffect(function () {
      function onChange() { s[1](isArmed()); }
      window.addEventListener('cta-authoring-changed', onChange);
      return function () { window.removeEventListener('cta-authoring-changed', onChange); };
    }, []);
    return [s[0], setArmed];
  }

  function isInstructor(auth) {
    if (!auth || !auth.securityLevel) return false;
    return window.AuthHelpers
      ? window.AuthHelpers.hasPrivilege(auth.securityLevel, 'Engr')
      : auth.securityLevel === 'Engr' || auth.securityLevel === 'Mngr';
  }

  // ─── Shortcut button (sits in the station toolbar, per unit) ─────────────────

  function ExerciseAuthorButton(props) {
    var auth = useContext(window.AuthContext);
    var armedPair = useArmed();
    var armed = armedPair[0];
    if (!isInstructor(auth)) return null;

    return React.createElement('button', {
      type: 'button',
      onClick: function () { armedPair[1](!armed); },
      title: armed
        ? 'Authoring is on — set the unit up, then Save as exercise'
        : 'Create an exercise from this unit: set values on the diagram, then save',
      style: {
        display: 'flex', alignItems: 'center', gap: '6px', height: '22px',
        padding: '0 10px', margin: '0 4px', borderRadius: '5px', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: '10.5px', fontWeight: 800, letterSpacing: '.2px',
        border: '1px solid ' + (armed ? '#ffb347' : 'rgba(255,255,255,.35)'),
        background: armed ? 'rgba(255,179,71,.24)' : 'rgba(255,255,255,.1)',
        color: '#fff', flexShrink: 0
      }
    },
      React.createElement('span', {
        style: {
          width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
          background: armed ? '#ffb347' : '#8fa6c4'
        }
      }),
      React.createElement('span', null, armed ? 'AUTHORING' : '\u270e CREATE EXERCISE')
    );
  }

  // ─── Authoring banner + save dialog ─────────────────────────────────────────

  function fieldStyle() {
    return {
      width: '100%', padding: '5px 7px', fontSize: '12px', fontFamily: 'inherit',
      background: '#0e1420', border: '1px solid #3a4560', borderRadius: '4px',
      color: '#e8edf6', marginTop: '3px'
    };
  }
  function labelStyle() {
    return { fontSize: '9.5px', fontWeight: 800, letterSpacing: '.4px', color: '#9db0c8' };
  }

  function SaveDialog(props) {
    var unitId = props.unitId, onClose = props.onClose, operator = props.operator;
    var ES = window.ExerciseStore;
    var BP = window.SymmetreBoardPoints;

    var snap = ES.snapshot(unitId);
    var setupKeys = Object.keys(snap.setup);

    var [title, setTitle] = useState('');
    var [brief, setBrief] = useState('');
    var [goalKey, setGoalKey] = useState('supplyAirTemp');
    var [comparator, setComparator] = useState('within');
    var [target, setTarget] = useState('55');
    var [tolerance, setTolerance] = useState('1');
    var [assigned, setAssigned] = useState([]);
    var [err, setErr] = useState(null);
    var [confirmedTrivial, setConfirmedTrivial] = useState(false);

    var seats = (window.AuthHelpers && window.AuthHelpers.STUDENT_SEATS) || [];

    // Any numeric point on this unit can be the goal, named the way the rest of
    // the station names it rather than by state key.
    var ctrl = ES.controllerFor(unitId);
    var state = ctrl ? ctrl.getState() : {};
    var goalOptions = Object.keys(state).filter(function (k) {
      return typeof state[k] === 'number';
    }).map(function (k) {
      var m = BP && BP.meta ? (BP.meta(k, unitId) || {}) : {};
      return { key: k, label: m.label || k, unit: m.unit || '' };
    }).sort(function (a, b) { return a.label < b.label ? -1 : 1; });

    // Re-read on each render so the reading tracks the unit while the dialog is open.
    var liveValue = (typeof state[goalKey] === 'number') ? state[goalKey] : null;
    var alreadyMet = (function () {
      if (liveValue === null) return false;
      var t = Number(target), tol = Number(tolerance);
      if (!isFinite(t)) return false;
      if (comparator === 'within') return Math.abs(liveValue - t) <= (isFinite(tol) ? tol : 0.5);
      if (comparator === 'above') return liveValue > t;
      if (comparator === 'below') return liveValue < t;
      return liveValue === t;
    })();

    // The opposite hazard to alreadyMet: a goal the sequence will never satisfy.
    // Supply air is driven to the unit's OWN active setpoint, and on a cold day the
    // OA reset schedule moves that — so a target of 55 in winter, when the unit is
    // controlling to 63, is an exercise no student can ever pass. Caught here
    // rather than discovered by a class.
    var unreachable = (function () {
      if (goalKey !== 'supplyAirTemp' || comparator !== 'within') return null;
      var sp = state.activeSetpoint;
      if (typeof sp !== 'number') return null;
      var t = Number(target), tol = Number(tolerance);
      if (!isFinite(t)) return null;
      if (Math.abs(sp - t) <= (isFinite(tol) ? tol : 0.5)) return null;
      return sp;
    })();

    function metaFor(k) {
      var found = null;
      goalOptions.forEach(function (o) { if (o.key === k) found = o; });
      return found || { key: k, label: k, unit: '' };
    }

    function toggleSeat(seat) {
      // Updater form, not a value computed from `assigned`: two chips clicked in
      // quick succession both read the same render's array otherwise, and the
      // first selection is silently lost.
      setAssigned(function (prev) {
        return prev.indexOf(seat) >= 0
          ? prev.filter(function (s) { return s !== seat; })
          : prev.concat([seat]);
      });
    }

    function save(publish) {
      if (!title.trim()) { setErr('Give the exercise a title — it is what students see in their list.'); return; }
      if (!setupKeys.length) {
        setErr('Nothing is overridden on this unit yet, so the exercise would start at normal. Set some values first.');
        return;
      }
      if (publish && !assigned.length) { setErr('Pick at least one student to publish to.'); return; }
      if (publish && alreadyMet && !confirmedTrivial) {
        setErr('The goal is already met by this starting state — a student would pass immediately. Press PUBLISH again to do it anyway.');
        setConfirmedTrivial(true);
        return;
      }
      var gm = metaFor(goalKey);
      ES.saveExercise({
        id: ES.newId(),
        title: title.trim(),
        brief: brief.trim(),
        unitId: unitId,
        createdBy: operator,
        createdAt: new Date().toISOString(),
        setup: snap.setup,
        weather: snap.weather,
        goal: {
          key: goalKey, label: gm.label, unit: gm.unit,
          comparator: comparator, target: Number(target),
          tolerance: Number(tolerance)
        },
        assignedTo: assigned,
        published: !!publish
      });
      onClose(true);
    }

    var overlay = {
      position: 'fixed', inset: 0, background: 'rgba(6,10,20,.68)', zIndex: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    };
    var card = {
      width: '560px', maxHeight: '86vh', overflowY: 'auto',
      background: '#1b2536', border: '1px solid #46536b', borderRadius: '10px',
      boxShadow: '0 24px 60px rgba(6,10,20,.7)', color: '#e8edf6',
      fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif"
    };

    return React.createElement('div', { style: overlay, onClick: function () { onClose(false); } },
      React.createElement('div', { style: card, onClick: function (e) { e.stopPropagation(); } },
        React.createElement('div', {
          style: { padding: '11px 14px', borderBottom: '1px solid #35405a',
                   display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
        },
          React.createElement('div', { style: { fontSize: '13px', fontWeight: 800, letterSpacing: '.3px' } },
            'Save exercise \u2014 ' + unitId),
          React.createElement('button', {
            type: 'button', onClick: function () { onClose(false); },
            title: 'Close without saving',
            // Sized up because this is the only close affordance now, so it has to
            // read as one rather than as a decoration in the corner.
            style: { background: 'none', border: 'none', color: '#9db0c8', fontSize: '26px',
                     cursor: 'pointer', lineHeight: 1, padding: '0 2px', marginLeft: '8px' },
            onMouseEnter: function (e) { e.currentTarget.style.color = '#e8edf6'; },
            onMouseLeave: function (e) { e.currentTarget.style.color = '#9db0c8'; }
          }, '\u00d7')
        ),

        React.createElement('div', { style: { padding: '14px', display: 'grid', gap: '12px' } },
          React.createElement('label', { style: { display: 'block' } },
            React.createElement('span', { style: labelStyle() }, 'TITLE'),
            React.createElement('input', {
              type: 'text', value: title, placeholder: 'e.g. Supply air running warm on a cold morning',
              onChange: function (e) { setTitle(e.target.value); }, style: fieldStyle()
            })
          ),
          React.createElement('label', { style: { display: 'block' } },
            React.createElement('span', { style: labelStyle() }, 'BRIEF FOR THE STUDENT'),
            React.createElement('textarea', {
              value: brief, rows: 3,
              placeholder: 'What they are being asked to do. Students see this before they start.',
              onChange: function (e) { setBrief(e.target.value); },
              style: Object.assign(fieldStyle(), { resize: 'vertical' })
            })
          ),

          // What was captured — shown plainly, because an instructor should be able
          // to see they nudged something by accident before it reaches students.
          React.createElement('div', null,
            React.createElement('div', { style: labelStyle() },
              'CAPTURED STARTING STATE (' + setupKeys.length + ' point' + (setupKeys.length === 1 ? '' : 's') + ')'),
            React.createElement('div', {
              style: { marginTop: '4px', border: '1px solid #35405a', borderRadius: '5px',
                       background: '#141b28', maxHeight: '118px', overflowY: 'auto' }
            },
              setupKeys.length
                ? setupKeys.map(function (k) {
                    var m = metaFor(k);
                    return React.createElement('div', {
                      key: k,
                      style: { display: 'flex', justifyContent: 'space-between', gap: '10px',
                               padding: '3px 8px', fontSize: '11px',
                               borderBottom: '1px solid rgba(53,64,90,.5)' }
                    },
                      React.createElement('span', { style: { color: '#c3cfdd' } }, m.label),
                      React.createElement('span', { style: { fontFamily: 'monospace', color: '#ff9bec', fontWeight: 700 } },
                        String(snap.setup[k]) + (m.unit || ''))
                    );
                  })
                : React.createElement('div', {
                    style: { padding: '8px', fontSize: '11px', color: '#e6a23c' }
                  }, 'Nothing overridden yet \u2014 set values on the diagram or the left panel first.')
            ),
            snap.weather ? React.createElement('div', {
              style: { marginTop: '4px', fontSize: '10.5px', color: '#6fd3e8' }
            }, '\u2601 Outdoor condition saved with it: ' + snap.weather.dryBulb + '\u00b0F / '
               + snap.weather.relHumidity + '% RH') : null
          ),

          // Goal — the thing the simulator checks
          React.createElement('div', null,
            React.createElement('div', { style: labelStyle() }, 'COMPLETE WHEN'),
            React.createElement('div', {
              // A ± column between target and tolerance, so the row reads as
              // "is within 58 ± 3" instead of two unlabelled numbers side by side.
              style: { display: 'grid', alignItems: 'center', marginTop: '3px', gap: '5px',
                       gridTemplateColumns: comparator === 'within'
                         ? '1fr auto 70px auto 70px'
                         : '1fr auto 70px' }
            },
              React.createElement('select', {
                value: goalKey, onChange: function (e) { setGoalKey(e.target.value); },
                style: fieldStyle()
              }, goalOptions.map(function (o) {
                return React.createElement('option', { key: o.key, value: o.key }, o.label);
              })),
              React.createElement('select', {
                value: comparator, onChange: function (e) { setComparator(e.target.value); },
                style: fieldStyle()
              }, Object.keys(ES.COMPARATORS).map(function (c) {
                return React.createElement('option', { key: c, value: c }, ES.COMPARATORS[c].label);
              })),
              React.createElement('input', {
                type: 'number', step: 'any', value: target, title: 'Target value',
                onChange: function (e) { setTarget(e.target.value); }, style: fieldStyle()
              }),
              comparator === 'within'
                ? React.createElement('span', {
                    key: 'pm',
                    style: { fontSize: '13px', fontWeight: 800, color: '#9db0c8', textAlign: 'center' }
                  }, '\u00b1')
                : null,
              comparator === 'within'
                ? React.createElement('input', {
                    key: 'tol',
                    type: 'number', step: 'any', min: 0, value: tolerance,
                    title: 'Tolerance \u2014 how far either side of the target still counts',
                    onChange: function (e) { setTolerance(e.target.value); }, style: fieldStyle()
                  })
                : React.createElement('div', null)
            ),
            React.createElement('div', {
              style: { display: 'flex', justifyContent: 'space-between', gap: '10px',
                       fontSize: '10px', color: '#6f7f97', marginTop: '4px' }
            },
              React.createElement('span', null,
                'Must hold for ' + (ES.HOLD_MS / 1000) + 's, so a value passing through does not count.'),
              React.createElement('span', { style: { fontFamily: 'monospace', color: '#9db0c8' } },
                'now ' + (liveValue === null ? '\u2014'
                  : (Math.round(liveValue * 10) / 10) + (metaFor(goalKey).unit || '')))
            ),
            alreadyMet ? React.createElement('div', {
              style: { marginTop: '6px', padding: '6px 8px', borderRadius: '5px', fontSize: '10.5px',
                       lineHeight: 1.45, color: '#ffd79a', background: 'rgba(255,179,71,.14)',
                       border: '1px solid #a5721f' }
            }, 'This goal is already met by the state you are about to save, so a student would pass without doing anything. Either target a value the fault actually breaks, or fault the point being measured.') : null,
            unreachable !== null ? React.createElement('div', {
              style: { marginTop: '6px', padding: '6px 8px', borderRadius: '5px', fontSize: '10.5px',
                       lineHeight: 1.45, color: '#ffd79a', background: 'rgba(255,179,71,.14)',
                       border: '1px solid #a5721f' }
            }, 'This unit is controlling supply air to ' + (Math.round(unreachable * 10) / 10) +
               '\u00b0F, not ' + target + '\u00b0F. A working unit would settle on its own setpoint, so no ' +
               'student could pass this. Match the target to the active setpoint, or widen the tolerance.') : null
          ),

          // Assignment
          React.createElement('div', null,
            React.createElement('div', { style: labelStyle() }, 'ASSIGN TO'),
            React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' } },
              seats.map(function (seat) {
                var on = assigned.indexOf(seat) >= 0;
                return React.createElement('button', {
                  key: seat, type: 'button',
                  onClick: function () { toggleSeat(seat); },
                  style: {
                    padding: '4px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer',
                    border: '1px solid ' + (on ? '#3f8f5a' : '#3a4560'),
                    background: on ? 'rgba(63,143,90,.28)' : '#242e42',
                    color: on ? '#8ff0b5' : '#c3cfdd'
                  }
                }, seat);
              }),
              React.createElement('button', {
                type: 'button',
                onClick: function () { setAssigned(assigned.length === seats.length ? [] : seats.slice()); },
                style: {
                  padding: '4px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', border: '1px dashed #3a4560',
                  background: 'transparent', color: '#9db0c8'
                }
              }, assigned.length === seats.length ? 'Clear all' : 'All')
            )
          ),

          err ? React.createElement('div', {
            style: { fontSize: '11px', color: '#ff8a7e', background: 'rgba(224,52,43,.14)',
                     border: '1px solid #8a2018', borderRadius: '5px', padding: '6px 8px' }
          }, err) : null
        ),

        React.createElement('div', {
          style: { padding: '11px 14px', borderTop: '1px solid #35405a', display: 'flex', gap: '8px' }
        },
          // No CANCEL here: it was the brightest thing in the footer while being
          // the one action that discards work, and the X above already closes the
          // dialog. The footer now holds only the two ways to keep it.
          React.createElement('button', {
            type: 'button', onClick: function () { save(false); },
            title: 'Save without assigning it to anyone yet',
            style: { flex: 1, padding: '8px', borderRadius: '6px', fontWeight: 800, fontSize: '11.5px',
                     fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #46536b',
                     background: '#242e42', color: '#c3cfdd' }
          }, 'SAVE DRAFT'),
          React.createElement('button', {
            type: 'button', onClick: function () { save(true); },
            style: { flex: 1.2, padding: '8px', borderRadius: '6px', fontWeight: 800, fontSize: '11.5px',
                     fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #2f7a52',
                     background: 'linear-gradient(180deg,#3f8f5a,#2d7346)', color: '#fff' }
          }, 'PUBLISH')
        )
      )
    );
  }

  /**
   * The bar that appears across the station while authoring is armed. It exists
   * so an instructor is never unsure whether what they are doing is being
   * recorded — the same reason a recording light exists.
   */
  function ExerciseAuthorBanner(props) {
    var auth = useContext(window.AuthContext);
    var armedPair = useArmed();
    var armed = armedPair[0];
    var [dialog, setDialog] = useState(false);
    var [saved, setSaved] = useState(null);
    // Read the unit from the hash and keep following it, rather than trusting a
    // prop an ancestor computed once: when that prop went stale the capture count
    // stayed at 0 and SAVE AS EXERCISE stayed disabled until switching tabs forced
    // the ancestor to re-render.
    function unitFromHash() {
      var m = /#\/symmetre\/([^/?]+)/.exec(window.location.hash || '');
      return m ? decodeURIComponent(m[1]) : null;
    }
    var [hashUnit, setHashUnit] = useState(unitFromHash);
    useEffect(function () {
      function onHash() { setHashUnit(unitFromHash()); }
      window.addEventListener('hashchange', onHash);
      onHash();
      return function () { window.removeEventListener('hashchange', onHash); };
    }, []);
    var unitId = hashUnit || props.unitId || 'AHU-4-4';

    // Count what would be captured, live, so the bar is informative rather than
    // decorative.
    var [count, setCount] = useState(0);
    useEffect(function () {
      if (!armed || !window.ExerciseStore || !unitId) return;
      function tick() {
        var s = window.ExerciseStore.snapshot(unitId);
        setCount(Object.keys(s.setup).length);
      }
      tick();
      var iv = setInterval(tick, 1200);
      return function () { clearInterval(iv); };
    }, [armed, unitId]);

    useEffect(function () {
      if (!saved) return;
      var t = setTimeout(function () { setSaved(null); }, 4000);
      return function () { clearTimeout(t); };
    }, [saved]);

    if (!isInstructor(auth) || !armed) {
      return saved ? React.createElement('div', {
        style: { padding: '5px 12px', background: 'rgba(63,143,90,.2)', borderBottom: '1px solid #2f7a52',
                 color: '#8ff0b5', fontSize: '11px', fontWeight: 700,
                 fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" }
      }, saved) : null;
    }

    return React.createElement(React.Fragment, null,
      React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 12px',
          background: 'rgba(255,179,71,.16)', borderBottom: '1px solid #a5721f',
          fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif", color: '#ffd79a'
        }
      },
        React.createElement('span', {
          style: { width: '8px', height: '8px', borderRadius: '50%', background: '#ffb347',
                   boxShadow: '0 0 6px #ffb347', flexShrink: 0 }
        }),
        React.createElement('span', { style: { fontSize: '11px', fontWeight: 800, letterSpacing: '.3px' } },
          'AUTHORING ' + unitId),
        React.createElement('span', { style: { fontSize: '11px', color: '#e8cfa4' } },
          count
            ? count + ' point' + (count === 1 ? '' : 's') + ' will be saved as the starting state'
            : 'Change values on the diagram or left panel to build the fault'),
        React.createElement('div', { style: { flex: 1 } }),
        React.createElement('button', {
          type: 'button', onClick: function () { setDialog(true); },
          disabled: !count,
          style: { padding: '3px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                   fontFamily: 'inherit', cursor: count ? 'pointer' : 'not-allowed',
                   border: '1px solid ' + (count ? '#2f7a52' : '#46536b'),
                   background: count ? 'linear-gradient(180deg,#3f8f5a,#2d7346)' : '#242e42',
                   color: count ? '#fff' : '#6f7f97' }
        }, 'SAVE AS EXERCISE'),
        React.createElement('button', {
          type: 'button', onClick: function () { armedPair[1](false); },
          style: { padding: '3px 10px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800,
                   fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #a5721f',
                   background: 'transparent', color: '#ffd79a' }
        }, 'DISCARD')
      ),
      dialog ? React.createElement(SaveDialog, {
        unitId: unitId,
        operator: auth.operator,
        onClose: function (didSave) {
          setDialog(false);
          if (didSave) {
            armedPair[1](false);
            setSaved('Exercise saved. Students see it under Exercises when they sign in.');
          }
        }
      }) : null
    );
  }

  window.ExerciseAuthorButton = ExerciseAuthorButton;
  window.ExerciseAuthorBanner = ExerciseAuthorBanner;
  window.ExerciseAuthoring = { isArmed: isArmed, setArmed: setArmed };
})();
