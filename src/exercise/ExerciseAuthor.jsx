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
    // Tracked per field so prefill only ever fills a blank the instructor has not
    // written in, and stops as soon as they do.
    var [touched, setTouched] = useState({});
    function touch(f) { setTouched(function (p) { return Object.assign({}, p, { [f]: true }); }); }
    // Which ASHRAE criterion the goal came from, or '' for a hand-set target.
    // Picking one fills in the point, comparator and target below, resolved
    // against this unit's live state — so a criterion follows the unit's own
    // configuration (its minimum OA airflow, its active setpoint) instead of
    // hardcoding a number that then disagrees with the sequence.
    var [criterionId, setCriterionId] = useState('');
    var [goalKey, setGoalKey] = useState('supplyAirTemp');
    var [comparator, setComparator] = useState('within');
    var [target, setTarget] = useState('55');
    var [tolerance, setTolerance] = useState('1');
    var [assigned, setAssigned] = useState([]);
    var [err, setErr] = useState(null);
    var [confirmedTrivial, setConfirmedTrivial] = useState(false);
    // "Was the late run justified?" has no repair to make — the answer is a judgement. With
    // only numeric goals available, both such seeded exercises ended up with a target that
    // was already true on open, so a student passed without acting and the written answer,
    // which IS the work, counted for nothing.
    var [diagnosisOnly, setDiagnosisOnly] = useState(false);

    // Device faults, kept separate from the captured setup. A falsified READING is not an
    // override: the sequence still computes from real physics and only what the BMS reports
    // is wrong, so it must not be squashed into snap.setup, which is the override list.
    var [faultKey, setFaultKey] = useState('');
    var [faultVal, setFaultVal] = useState('');
    // Seeded from the controller, not held independently: a sensor broken from the diagram
    // has to appear here too, or it would be applied live and then silently dropped on save.
    // The controller is the single source; this state only forces a redraw.
    var [, faultTick] = useState(0);
    var faults = (function () {
      var c = window[(BP.UNITS[unitId] || {}).controller];
      return (c && c.getSensorFaults) ? c.getSensorFaults() : {};
    })();
    function setFaults() { faultTick(function (n) { return n + 1; }); }

    // Sensors on this unit worth faulting: measured inputs only. Faulting a setpoint or a
    // valve command makes no physical sense — a transmitter fails, an instruction does not.
    var faultable = (function () {
      // Read straight from the controller. An earlier version called ES.snapshotState,
      // which the store does not export — dead code that misled about where this came from.
      var ctrl = window[(BP.UNITS[unitId] || {}).controller];
      var st = (ctrl && ctrl.getState) ? ctrl.getState() : null;
      if (!st || !ctrl || !ctrl.setSensorFault) return [];
      return Object.keys(st).filter(function (k) {
        var m = BP.meta(k, unitId);
        return m && m.kind === 'ai' && typeof st[k] === 'number';
      }).sort();
    })();

    function addFault() {
      if (!faultKey || faultVal === '') return;
      var v = Number(faultVal);
      if (!isFinite(v)) return;
      setFaults();
      // Applied live so the instructor sees the consequence chain immediately — a damper
      // reading 100% while airflow stays near zero is the tell a student will use, and it
      // is worth confirming it actually reads that way before publishing.
      var ctrl = window[(BP.UNITS[unitId] || {}).controller];
      if (ctrl && ctrl.setSensorFault) ctrl.setSensorFault(faultKey, v);
      setFaultKey(''); setFaultVal('');
    }

    function dropFault(k) {
      setFaults();
      var ctrl = window[(BP.UNITS[unitId] || {}).controller];
      if (ctrl && ctrl.clearSensorFault) ctrl.clearSensorFault(k);
    }

    // Through the roster, so the picker lists real signed-up accounts when a backend
    // is configured and the six fixed seats when it is not. Reading STUDENT_SEATS
    // directly would have shown the fallback seats even with real students present —
    // and an exercise assigned to "student_a" cannot reach a Supabase account.
    var Roster = window.StudentRoster;
    var Groups = window.StudentGroups;
    // Pull the roster when the dialog opens, so someone who registered five minutes ago
    // is offered rather than silently absent from the only screen that can assign to them.
    var [rosterSynced, setRosterSynced] = useState(0);
    useEffect(function () {
      var B = window.SupabaseBackend;
      if (!B || !B.isConfigured()) return;
      B.syncDown().then(function () { setRosterSynced(function (n) { return n + 1; }); });
    }, []);

    var seats = (Roster && typeof Roster.seats === 'function')
      ? Roster.seats()
      : ((window.AuthHelpers && window.AuthHelpers.STUDENT_SEATS) || []);

    // How this exercise is targeted. Seat-by-seat was the only option, so an
    // instructor running team projects had to remember which students were Team A
    // and tick them individually on every exercise — and nothing recorded that they
    // were a team, so the results table could not group them either.
    var [assignMode, setAssignMode] = useState('class');
    var [assignGroups, setAssignGroups] = useState([]);
    var [groupTick, setGroupTick] = useState(0);
    var [newGroupName, setNewGroupName] = useState('');
    var [managingGroups, setManagingGroups] = useState(false);
    var [groupErr, setGroupErr] = useState('');
    // Which group's name is being edited, and the draft. Teams get named in a hurry
    // at the start of a session ("Team 1") and renamed once they pick something, so
    // rename has to be reachable without deleting and rebuilding the membership.
    var [renamingId, setRenamingId] = useState(null);
    var [renameDraft, setRenameDraft] = useState('');

    function startRename(g) {
      setRenamingId(g.id);
      setRenameDraft(g.name);
      setGroupErr('');
    }

    function commitRename() {
      if (!Groups || !renamingId) { setRenamingId(null); return; }
      var next = renameDraft.trim();
      var current = Groups.get(renamingId);
      // An unchanged name is not an error, and neither is an empty box the operator
      // clicked away from — both just close the editor.
      if (next && current && next !== current.name) {
        var clash = Groups.all().some(function (x) {
          return x.id !== renamingId && x.name.toLowerCase() === next.toLowerCase();
        });
        if (clash) { setGroupErr('A group with that name already exists.'); return; }
        Groups.rename(renamingId, next);
        setGroupTick(groupTick + 1);
      }
      setGroupErr('');
      setRenamingId(null);
    }

    var allGroups = Groups ? Groups.all() : [];

    function toggleAssignGroup(id) {
      setAssignGroups(function (prev) {
        return prev.indexOf(id) >= 0
          ? prev.filter(function (g) { return g !== id; })
          : prev.concat([id]);
      });
    }

    function addGroup() {
      if (!Groups) return;
      var res = Groups.create(newGroupName, []);
      if (!res.ok) { setGroupErr(res.error); return; }
      setGroupErr('');
      setNewGroupName('');
      setGroupTick(groupTick + 1);
      // Newly created group is selected, since creating one mid-assignment means
      // you intend to use it.
      setAssignGroups(function (prev) { return prev.concat([res.group.id]); });
    }

    var assignment = {
      mode: assignMode,
      groupIds: assignGroups,
      seatIds: assigned
    };
    var resolvedSeats = Groups ? Groups.resolveSeats(assignment) : assigned;

    // Which seat's name/email fields are open, and a re-render tick so edits show
    // immediately (the roster lives outside React state).
    var [editingSeat, setEditingSeat] = useState(null);
    var [rosterTick, setRosterTick] = useState(0);
    var [draftFirst, setDraftFirst] = useState('');
    var [draftLast, setDraftLast] = useState('');
    var [draftEmail, setDraftEmail] = useState('');

    function openSeatEditor(seat) {
      var r = Roster ? Roster.get(seat) : { firstName: '', lastName: '', email: '' };
      setDraftFirst(r.firstName); setDraftLast(r.lastName); setDraftEmail(r.email);
      setEditingSeat(seat);
    }

    function saveSeatEditor() {
      if (Roster && editingSeat) {
        Roster.set(editingSeat, { firstName: draftFirst, lastName: draftLast, email: draftEmail });
        setRosterTick(rosterTick + 1);
      }
      setEditingSeat(null);
    }

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

    // What each faultable point implies, so the dialog can propose a title, a brief and
    // a criterion rather than starting empty. Keyed by the point the instructor changed.
    var FAULT_HINTS = {
      runSchedule: {
        title: 'Unit will not run during occupied hours',
        brief: 'The air handler is delivering no air while the space is occupied. Find out what is stopping it and get airflow restored.',
        criterion: 'iaq-min-oa-airflow'
      },
      oaDamperPosition: {
        title: 'Outdoor air damper closed during occupancy',
        brief: 'The space is being starved of ventilation air even though temperatures look correct. Find out why and restore the minimum outdoor air position.',
        criterion: 'iaq-min-damper'
      },
      chwValvePosition: {
        title: 'Chilled water valve stuck',
        brief: 'Supply air is not where it should be and the cooling coil is not behaving. Diagnose the valve and return supply air to its setpoint.',
        criterion: 'soo-supply-air-setpoint'
      },
      phtValvePosition: {
        title: 'Preheat valve stuck',
        brief: 'The heating coil is not responding as expected. Find the fault and bring supply air back to its active setpoint.',
        criterion: 'soo-supply-air-setpoint'
      },
      coolingCoilSetpoint: {
        title: 'Space is being overcooled',
        brief: 'Occupants report the space is far too cold. Supply air is running well below where it should be — find out why and return it to design.',
        criterion: 'soo-supply-air-setpoint'
      },
      heatingCoilSetpoint: {
        title: 'Supply air running warm',
        brief: 'Supply air is warmer than it should be for these conditions. Diagnose the heating side and restore the correct setpoint.',
        criterion: 'soo-supply-air-setpoint'
      },
      co2Setpoint: {
        title: 'Ventilation not keeping up with occupancy',
        brief: 'Zone CO₂ is climbing above the ventilation indicator. Work out why the unit is not bringing in enough outdoor air.',
        criterion: 'iaq-co2-differential'
      },
      co2Sensor: {
        title: 'Zone CO₂ above the ventilation indicator',
        brief: 'CO₂ in the zone is higher than 62.1 uses as an indicator of adequate ventilation. Bring it back down.',
        criterion: 'iaq-co2-differential'
      },
      fanSpeedSetpoint: {
        title: 'Duct static pressure off setpoint',
        brief: 'The supply fan is not holding duct static where it should. Find what is driving it and restore control.',
        criterion: 'soo-duct-static'
      },
      economizerActive: {
        title: 'Free cooling available but unused',
        brief: 'Outdoor conditions are suitable for free cooling but the unit is running mechanical cooling instead. Work out why the economizer is not engaging.',
        criterion: 'energy-economizer-active'
      },
      zoneTempSetpoint: {
        title: 'Zone outside the comfort range',
        brief: 'The zone is drifting outside the comfort band occupants expect. Diagnose the cause and bring it back.',
        criterion: 'comfort-zone-winter'
      }
    };

    // First captured point that has a hint. Deliberately the FIRST rather than a merge:
    // a title describing two faults at once helps nobody, and the instructor can edit.
    var hint = (function () {
      for (var i = 0; i < setupKeys.length; i++) {
        if (FAULT_HINTS[setupKeys[i]]) return FAULT_HINTS[setupKeys[i]];
      }
      return null;
    })();

    var AC = window.ASHRAECriteria;
    var criteria = (AC && AC.forState(state)) || [];
    var criterion = (criterionId && AC) ? AC.byId(criterionId) : null;

    function applyCriterion(id) {
      setCriterionId(id);
      if (!id || !AC) return;
      var g = AC.goalFrom(id, state, metaFor((AC.byId(id).goalFor(state) || {}).key));
      if (!g) return;
      setGoalKey(g.key);
      setComparator(g.comparator);
      setTarget(String(g.target));
      setTolerance(String(g.tolerance));
    }

    // Editing the fields by hand detaches the goal from its criterion, rather
    // than leaving it citing a standard whose number no longer matches.
    function detach() { touch('goal'); if (criterionId) setCriterionId(''); }

    // Runs when the captured setup changes — so building the fault, then opening this
    // dialog, arrives with the description already written.
    useEffect(function () {
      if (!hint) return;
      if (!touched.title && !title) setTitle(hint.title);
      if (!touched.brief && !brief) setBrief(hint.brief);
      if (!touched.goal && !criterionId && hint.criterion && AC && AC.byId(hint.criterion)) {
        applyCriterion(hint.criterion);
      }
    }, [setupKeys.join(','), hint && hint.title]);

    // Apply a criterion's scenario to the live unit, then let the existing capture and
    // prefill do the rest. Writing to the controller rather than straight into the
    // exercise means the instructor SEES the fault on the diagram before saving it, and
    // can adjust it by hand like any other authored fault.
    function generateFromStandard(id) {
      if (!AC || !AC.scenarioFor) return;
      var sc = AC.scenarioFor(id);
      var ctrl = ES.controllerFor && ES.controllerFor(unitId);
      if (!sc || !ctrl) return;
      Object.keys(sc.setup).forEach(function (k) {
        try { ctrl.setValue(k, sc.setup[k]); } catch (e) {}
      });
      if (ctrl.recalculate) ctrl.recalculate();
      // The scenario's own words win over the fault-hint guess, and over a blank field —
      // but never over something the instructor has already typed.
      if (!touched.title) setTitle(sc.title);
      if (!touched.brief) setBrief(sc.brief);
      applyCriterion(id);
    }

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
      // A device fault alone is a complete exercise — the broken-feedback scenarios have no
      // override by design, which is exactly what makes them hard to find.
      if (!setupKeys.length && !Object.keys(faults).length) {
        setErr('Nothing is faulted or overridden on this unit yet, so the exercise would start at normal. Set some values or add a device fault first.');
        return;
      }
      if (publish && !assigned.length) { setErr('Pick at least one student to publish to.'); return; }
      if (publish && !diagnosisOnly && alreadyMet && !confirmedTrivial) {
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
        // Falsified readings, applied by applySetup through setSensorFault rather than
        // setValue, so they report FAULT and stay off the override list.
        sensorFaults: Object.keys(faults).length ? faults : undefined,
        // Authored history chosen in the point dialog's History tab, so a student's
        // trend can show a past that disagrees with the present.
        trends: (window.TrendAuthoring && window.TrendAuthoring.draftAll())
          ? window.TrendAuthoring.draftAll() : null,
        weather: snap.weather,
        goal: {
          // No measured target: evaluate() passes on a saved diagnosis instead.
          diagnosisOnly: diagnosisOnly || undefined,
          // Criterion fields travel with the goal so the student brief and the
          // instructor report can cite the same source the author chose.
          standard: criterion ? criterion.standard : null,
          criterionId: criterion ? criterion.id : null,
          criterionLabel: criterion ? criterion.label : null,
          citation: criterion ? criterion.citation : null,
          basis: criterion ? criterion.basis : null,
          key: goalKey, label: gm.label, unit: gm.unit,
          comparator: comparator, target: Number(target),
          tolerance: Number(tolerance)
        },
        // Flattened seat list, so exercisesFor() and everything downstream is
        // unchanged; the targeting travels beside it purely so the dialog and the
        // results table can show what was chosen.
        assignedTo: resolvedSeats,
        assignment: assignment,
        // Authored history from the point dialog's History tab. Without this the
        // instructor builds the weekend-override trend, watches it preview, and loses
        // it the moment they publish.
        trends: (window.TrendAuthoring && window.TrendAuthoring.draftAll()) || null,
        published: !!publish
      });
      // The draft belongs to the exercise just saved, not the next one an instructor
      // authors — otherwise the following exercise silently inherits these trends.
      if (window.TrendAuthoring && window.TrendAuthoring.clearDraft) {
        window.TrendAuthoring.clearDraft();
      }
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
              onChange: function (e) { touch('title'); setTitle(e.target.value); }, style: fieldStyle()
            })
          ),
          React.createElement('label', { style: { display: 'block' } },
            React.createElement('span', { style: labelStyle() }, 'BRIEF FOR THE STUDENT'),
            React.createElement('textarea', {
              value: brief, rows: 3,
              placeholder: 'What they are being asked to do. Students see this before they start.',
              onChange: function (e) { touch('brief'); setBrief(e.target.value); },
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
            // Criterion first, then the fields it fills. Choosing the standard
            // before the number is the order the exercise is actually reasoned in.
            // Device faults. Deliberately its own section rather than a row in the captured
            // list above: that list is overrides, and the whole point of a device fault is
            // that it is NOT one. Presenting them together would teach the opposite.
            faultable.length ? React.createElement('div', { style: { marginTop: '10px' } },
              React.createElement('div', { style: labelStyle() }, 'DEVICE FAULTS'),
              React.createElement('div', {
                style: { fontSize: '10px', color: '#8a97ab', marginTop: '3px', lineHeight: 1.45 }
              }, 'A sensor reporting a false reading. The plant still behaves correctly \u2014 only what the BMS reports is wrong, so this does not appear on the override list and a student has to question the reading itself.'),

              Object.keys(faults).length ? React.createElement('div', {
                style: { marginTop: '6px', border: '1px solid #35405a', borderRadius: '5px',
                         background: '#141b28' }
              },
                Object.keys(faults).map(function (k) {
                  var m = metaFor(k);
                  return React.createElement('div', {
                    key: k,
                    style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                             gap: '8px', padding: '5px 8px', fontSize: '11px' }
                  },
                    React.createElement('span', { style: { color: '#c3cfdd' } }, m.label),
                    React.createElement('span', {
                      style: { fontFamily: 'monospace', fontWeight: 700, color: '#9aa3b2' }
                    }, 'reports ' + faults[k] + (m.unit || '')),
                    React.createElement('button', {
                      type: 'button',
                      onClick: function () { dropFault(k); },
                      style: { background: 'none', border: 'none', cursor: 'pointer',
                               color: '#7f8ea6', fontSize: '10px', fontFamily: 'inherit' }
                    }, 'REMOVE')
                  );
                })
              ) : null,

              React.createElement('div', {
                style: { display: 'flex', gap: '5px', marginTop: '6px' }
              },
                React.createElement('select', {
                  value: faultKey,
                  onChange: function (e) { setFaultKey(e.target.value); },
                  style: Object.assign({}, fieldStyle(), { flex: 1 })
                },
                  React.createElement('option', { value: '' }, 'Add a faulted sensor\u2026'),
                  faultable.filter(function (k) { return !(k in faults); }).map(function (k) {
                    return React.createElement('option', { key: k, value: k }, metaFor(k).label);
                  })
                ),
                React.createElement('input', {
                  type: 'number', step: 'any', value: faultVal,
                  placeholder: 'reads',
                  onChange: function (e) { setFaultVal(e.target.value); },
                  style: Object.assign({}, fieldStyle(), { width: '82px' })
                }),
                React.createElement('button', {
                  type: 'button',
                  onClick: addFault,
                  disabled: !faultKey || faultVal === '',
                  style: { padding: '5px 11px', borderRadius: '5px', fontSize: '10.5px',
                           fontWeight: 800, fontFamily: 'inherit',
                           cursor: (faultKey && faultVal !== '') ? 'pointer' : 'not-allowed',
                           border: '1px solid ' + ((faultKey && faultVal !== '') ? '#8a2018' : '#38445c'),
                           background: (faultKey && faultVal !== '') ? 'rgba(194,34,34,.22)' : '#1b2230',
                           color: (faultKey && faultVal !== '') ? '#ff8a7e' : '#5d6b83' }
                }, 'BREAK IT')
              )
            ) : null,

            // Offered only before anything has been captured: once a fault exists on the
            // diagram, generating a different one would silently discard it.
            (setupKeys.length === 0 && AC && AC.scenariosFor)
              ? React.createElement('div', {
                  style: { marginBottom: '10px', padding: '9px 10px', borderRadius: '6px',
                           background: 'rgba(53,189,211,.08)', border: '1px solid #2b6f7d' }
                },
                  React.createElement('div', {
                    style: { fontSize: '10px', fontWeight: 800, letterSpacing: '.5px',
                             color: '#7fd4e2', marginBottom: '5px' }
                  }, 'START FROM A STANDARD'),
                  React.createElement('div', {
                    style: { fontSize: '10.5px', color: '#9db0c8', lineHeight: 1.45, marginBottom: '7px' }
                  }, 'Pick what the exercise should test and the fault is set up on this unit for you. You can adjust it on the diagram afterwards.'),
                  React.createElement('select', {
                    value: '',
                    onChange: function (e) { if (e.target.value) generateFromStandard(e.target.value); },
                    style: Object.assign({}, fieldStyle(), { width: '100%' })
                  },
                    [React.createElement('option', { key: '', value: '' }, 'Choose a standard to test\u2026')]
                      .concat(['62.1', '55', '90.1', '36'].map(function (std) {
                        var group = AC.scenariosFor(state, unitId).filter(function (x) { return x.standard === std; });
                        if (!group.length) return null;
                        return React.createElement('optgroup', { key: std, label: AC.badge(std) },
                          group.map(function (x) {
                            return React.createElement('option', { key: x.id, value: x.id }, x.label);
                          }));
                      }))
                  )
                )
              : null,

            React.createElement('div', { style: labelStyle() }, 'SUCCESS CRITERION'),
            React.createElement('select', {
              value: criterionId,
              onChange: function (e) { applyCriterion(e.target.value); },
              style: Object.assign({}, fieldStyle(), { width: '100%', marginTop: '3px' })
            },
              React.createElement('option', { value: '' }, 'Custom target (no standard)'),
              ['62.1', '55', '90.1', '36'].map(function (std) {
                var group = criteria.filter(function (c) { return c.standard === std; });
                if (!group.length) return null;
                return React.createElement('optgroup', {
                  key: std, label: AC ? AC.badge(std) : std
                }, group.map(function (c) {
                  return React.createElement('option', { key: c.id, value: c.id }, c.label);
                }));
              })
            ),

            criterion ? React.createElement('div', {
              style: { marginTop: '6px', padding: '7px 9px', borderRadius: '5px',
                       background: 'rgba(53,189,211,.10)', border: '1px solid #2b6f7d',
                       fontSize: '10.5px', lineHeight: 1.45, color: '#cfe6ea' }
            },
              React.createElement('div', {
                style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }
              },
                React.createElement('span', {
                  style: { fontWeight: 800, fontSize: '9.5px', letterSpacing: '.4px',
                           padding: '1px 5px', borderRadius: '3px', color: '#0d2b31',
                           background: '#7fd4e2' }
                }, AC.badge(criterion.standard)),
                // Requirement vs indicator, because presenting a rule of thumb as
                // a code limit is exactly the wrong lesson for a trainee.
                React.createElement('span', {
                  style: { fontWeight: 800, fontSize: '9.5px', letterSpacing: '.4px',
                           color: criterion.basis === 'requirement' ? '#8ff0b5' : '#ffd79a' }
                }, criterion.basis === 'requirement' ? 'REQUIREMENT' : 'COMMON INDICATOR')
              ),
              React.createElement('div', { style: { fontWeight: 700, marginBottom: '3px' } },
                criterion.citation),
              React.createElement('div', { style: { color: '#9db0c8' } }, criterion.rationale)
            ) : null,

            React.createElement('div', { style: Object.assign({}, labelStyle(), { marginTop: '9px' }) }, 'COMPLETE WHEN'),
            React.createElement('label', {
              style: { display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0 6px',
                       fontSize: '11px', color: '#c3cfdd', cursor: 'pointer' }
            },
              React.createElement('input', {
                type: 'checkbox', checked: diagnosisOnly,
                onChange: function (e) { setDiagnosisOnly(e.target.checked); }
              }),
              'The student submits a written diagnosis \u2014 no value to reach'
            ),
            diagnosisOnly ? React.createElement('div', {
              style: { fontSize: '10px', color: '#8a97ab', lineHeight: 1.45, marginBottom: '4px' }
            }, 'For scenarios where the answer is a judgement rather than a repair \u2014 whether an after-hours run was justified, say. The exercise passes when they have written something, and you assess the reasoning yourself.') : null,
            diagnosisOnly ? null : React.createElement('div', {
              // A ± column between target and tolerance, so the row reads as
              // "is within 58 ± 3" instead of two unlabelled numbers side by side.
              style: { display: 'grid', alignItems: 'center', marginTop: '3px', gap: '5px',
                       gridTemplateColumns: comparator === 'within'
                         ? '1fr auto 70px auto 70px'
                         : '1fr auto 70px' }
            },
              React.createElement('select', {
                value: goalKey, onChange: function (e) { setGoalKey(e.target.value); detach(); },
                style: fieldStyle()
              }, goalOptions.map(function (o) {
                return React.createElement('option', { key: o.key, value: o.key }, o.label);
              })),
              React.createElement('select', {
                value: comparator, onChange: function (e) { setComparator(e.target.value); detach(); },
                style: fieldStyle()
              }, Object.keys(ES.COMPARATORS).map(function (c) {
                return React.createElement('option', { key: c, value: c }, ES.COMPARATORS[c].label);
              })),
              React.createElement('input', {
                type: 'number', step: 'any', value: target, title: 'Target value',
                onChange: function (e) { setTarget(e.target.value); detach(); }, style: fieldStyle()
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

            // Who gets it, before which seats. Three modes, because "the whole
            // class", "Team A and Team B" and "these two students" are different
            // intentions and only the last one was expressible before.
            React.createElement('div', {
              style: { display: 'flex', gap: '4px', marginTop: '5px', marginBottom: '7px' }
            },
              [['class', 'Whole class'], ['groups', 'Groups'], ['students', 'Individuals']]
                .map(function (m) {
                  var on = assignMode === m[0];
                  return React.createElement('button', {
                    key: m[0], type: 'button',
                    onClick: function () { setAssignMode(m[0]); },
                    style: {
                      flex: 1, padding: '5px 4px', borderRadius: '5px', fontSize: '10.5px',
                      fontWeight: 800, letterSpacing: '.2px', cursor: 'pointer',
                      fontFamily: 'inherit',
                      background: on ? 'linear-gradient(180deg,#3f8f5a,#2d7346)' : '#1b2230',
                      border: '1px solid ' + (on ? '#2f7a52' : '#46536b'),
                      color: on ? '#fff' : '#c3cfdd'
                    }
                  }, m[1]);
                })
            ),

            // ── Whole class ────────────────────────────────────────────────────
            assignMode === 'class' ? React.createElement('div', {
              style: { fontSize: '10.5px', color: '#9db0c8', lineHeight: 1.45,
                       padding: '7px 9px', borderRadius: '5px', background: '#141a26',
                       border: '1px solid #38445c' }
            }, 'Every student seat gets this exercise. Nothing to keep in sync as the roster changes.') : null,

            // ── Groups ─────────────────────────────────────────────────────────
            assignMode === 'groups' ? React.createElement('div', null,
              allGroups.length === 0
                ? React.createElement('div', {
                    style: { fontSize: '10.5px', color: '#9db0c8', lineHeight: 1.45, marginBottom: '6px' }
                  }, 'No groups yet. Name one below, then add students to it.')
                : React.createElement('div', {
                    style: { display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }
                  },
                    allGroups.map(function (g) {
                      var on = assignGroups.indexOf(g.id) >= 0;
                      return React.createElement('button', {
                        key: g.id, type: 'button',
                        onClick: function () { toggleAssignGroup(g.id); },
                        title: g.seatIds.length
                          ? g.seatIds.map(function (s) {
                              return Roster ? Roster.displayName(s) : s;
                            }).join(', ')
                          : 'This group has no students in it yet',
                        style: {
                          padding: '4px 10px', borderRadius: '999px', fontSize: '11px',
                          fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                          background: on ? 'linear-gradient(180deg,#3f8f5a,#2d7346)' : '#1b2230',
                          border: '1px solid ' + (on ? '#2f7a52' : '#46536b'),
                          // An empty group is called out rather than silently
                          // assigning an exercise to nobody.
                          color: on ? '#fff' : (g.seatIds.length ? '#c3cfdd' : '#e6a23c')
                        }
                      }, Groups.label(g));
                    })
                  ),

              React.createElement('button', {
                type: 'button',
                onClick: function () { setManagingGroups(!managingGroups); },
                style: { background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                         fontSize: '10.5px', color: '#6fd3e8', fontFamily: 'inherit' }
              }, managingGroups ? 'Done managing groups' : 'Manage groups'),

              managingGroups ? React.createElement('div', {
                style: { marginTop: '7px', padding: '9px', borderRadius: '6px',
                         background: '#141a26', border: '1px solid #38445c' }
              },
                React.createElement('div', { style: { display: 'flex', gap: '5px', marginBottom: '8px' } },
                  React.createElement('input', {
                    value: newGroupName, placeholder: 'New group name, e.g. Team A',
                    onChange: function (e) { setNewGroupName(e.target.value.slice(0, 40)); },
                    onKeyDown: function (e) { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } },
                    style: Object.assign({}, fieldStyle(), { flex: 1 })
                  }),
                  React.createElement('button', {
                    type: 'button', onClick: addGroup,
                    style: { padding: '5px 11px', borderRadius: '5px', fontSize: '10.5px',
                             fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
                             border: '1px solid #2f7a52', color: '#fff',
                             background: 'linear-gradient(180deg,#3f8f5a,#2d7346)' }
                  }, 'ADD')
                ),
                groupErr ? React.createElement('div', {
                  style: { fontSize: '10px', color: '#ff8a7e', marginBottom: '7px' }
                }, groupErr) : null,

                allGroups.map(function (g) {
                  return React.createElement('div', {
                    key: g.id,
                    style: { marginBottom: '9px', paddingBottom: '8px',
                             borderBottom: '1px solid #232c3d' }
                  },
                    React.createElement('div', {
                      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                               marginBottom: '4px' }
                    },
                      renamingId === g.id
                        ? React.createElement('input', {
                            value: renameDraft,
                            autoFocus: true,
                            onChange: function (e) { setRenameDraft(e.target.value.slice(0, 40)); },
                            onKeyDown: function (e) {
                              if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                              if (e.key === 'Escape') { setRenamingId(null); setGroupErr(''); }
                            },
                            onBlur: commitRename,
                            style: Object.assign({}, fieldStyle(), { flex: 1, marginRight: '6px' })
                          })
                        : React.createElement('button', {
                            type: 'button',
                            onClick: function () { startRename(g); },
                            title: 'Rename this group',
                            style: { background: 'none', border: 'none', padding: 0,
                                     cursor: 'pointer', fontFamily: 'inherit',
                                     fontSize: '10.5px', fontWeight: 800, color: '#e8edf6',
                                     textAlign: 'left' }
                          }, g.name + '  \u270e'),
                      React.createElement('button', {
                        type: 'button',
                        onClick: function () {
                          Groups.remove(g.id);
                          setAssignGroups(function (p) { return p.filter(function (x) { return x !== g.id; }); });
                          setGroupTick(groupTick + 1);
                        },
                        title: 'Delete this group',
                        style: { background: 'none', border: 'none', cursor: 'pointer',
                                 color: '#7f8ea6', fontSize: '11px', fontFamily: 'inherit' }
                      }, 'Remove')
                    ),
                    // Membership edited right here, so building a team and
                    // assigning to it is one pass rather than two screens.
                    React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
                      seats.map(function (seat) {
                        var inGroup = g.seatIds.indexOf(seat) >= 0;
                        return React.createElement('button', {
                          key: seat, type: 'button',
                          onClick: function () {
                            Groups.toggleSeat(g.id, seat);
                            setGroupTick(groupTick + 1);
                          },
                          style: {
                            padding: '3px 8px', borderRadius: '999px', fontSize: '10px',
                            fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                            background: inGroup ? 'rgba(63,143,90,.28)' : '#1b2230',
                            border: '1px solid ' + (inGroup ? '#3f8f5a' : '#46536b'),
                            color: inGroup ? '#8ff0b5' : '#9db0c8'
                          }
                        }, Roster ? Roster.displayName(seat) : seat);
                      })
                    )
                  );
                })
              ) : null
            ) : null,

            // ── Individuals ────────────────────────────────────────────────────
            // Names rather than seat ids: an instructor picking who gets an
            // exercise is thinking about people, not credentials. The seat id is
            // still what gets assigned — the roster only changes the label. Each
            // chip carries a pencil to fill in a real name and email once.
            assignMode === 'students' ? React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '5px' } },
              seats.map(function (seat) {
                var on = assigned.indexOf(seat) >= 0;
                var named = Roster ? Roster.isNamed(seat) : false;
                var label = Roster ? Roster.displayName(seat) : seat;
                return React.createElement('span', {
                  key: seat,
                  style: { display: 'inline-flex', alignItems: 'stretch', borderRadius: '999px',
                           overflow: 'hidden', border: '1px solid ' + (on ? '#2f7a52' : '#46536b'),
                           background: on ? 'linear-gradient(180deg,#3f8f5a,#2d7346)' : '#1b2230' }
                },
                React.createElement('button', {
                  type: 'button',
                  onClick: function () { toggleSeat(seat); },
                  title: Roster ? Roster.displayLong(seat) + '  (' + seat + ')' : seat,
                  style: {
                    padding: '4px 4px 4px 10px', fontSize: '11px', fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer', border: 'none',
                    background: 'transparent',
                    color: on ? '#fff' : '#c3cfdd'
                  }
                // An unnamed seat still shows its id, so it is obvious which ones
                // have not been filled in yet.
                }, named ? label : seat.replace('student_', 'Student ').toUpperCase()),
                React.createElement('button', {
                  type: 'button',
                  onClick: function (e) { e.stopPropagation(); openSeatEditor(seat); },
                  title: 'Set this student\'s name and email',
                  style: { padding: '4px 8px 4px 4px', fontSize: '10px', border: 'none',
                           background: 'transparent', cursor: 'pointer',
                           color: on ? 'rgba(255,255,255,.75)' : '#7f8ea6' }
                }, '\u270e'));
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
            ) : null,

            // Who this actually reaches, resolved from whichever mode is chosen.
            // Shown because "Groups: Team A" is not an answer to "will this land
            // on anybody" — an empty team assigns to nobody, silently.
            React.createElement('div', {
              style: { marginTop: '8px', fontSize: '10px', lineHeight: 1.45,
                       color: resolvedSeats.length ? '#8ff0b5' : '#e6a23c' }
            }, resolvedSeats.length
                ? (Groups ? Groups.describe(assignment) + '  \u00b7  ' : '') +
                  resolvedSeats.length + ' student' + (resolvedSeats.length === 1 ? '' : 's') +
                  ' will see this'
                : 'Nobody will see this yet \u2014 pick a group with students in it, or choose individuals.'),

            editingSeat ? React.createElement('div', {
              style: { marginTop: '8px', padding: '9px', borderRadius: '6px',
                       background: '#141a26', border: '1px solid #38445c' }
            },
              React.createElement('div', {
                style: { fontSize: '9.5px', fontWeight: 800, letterSpacing: '.4px',
                         color: '#9db0c8', marginBottom: '6px' }
              }, 'WHO IS ' + editingSeat.replace('student_', 'STUDENT ').toUpperCase() + '?'),
              React.createElement('div', {
                style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }
              },
                React.createElement('input', {
                  value: draftFirst, placeholder: 'First name',
                  onChange: function (e) { setDraftFirst(e.target.value); },
                  style: fieldStyle()
                }),
                React.createElement('input', {
                  value: draftLast, placeholder: 'Last name',
                  onChange: function (e) { setDraftLast(e.target.value); },
                  style: fieldStyle()
                })
              ),
              React.createElement('input', {
                value: draftEmail, placeholder: 'Email address', type: 'email',
                onChange: function (e) { setDraftEmail(e.target.value); },
                style: Object.assign({}, fieldStyle(), { width: '100%', marginTop: '5px' })
              }),
              React.createElement('div', { style: { display: 'flex', gap: '5px', marginTop: '7px' } },
                React.createElement('button', {
                  type: 'button', onClick: function () { setEditingSeat(null); },
                  style: { flex: 1, padding: '5px', borderRadius: '5px', fontSize: '10.5px',
                           fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
                           border: '1px solid #46536b', background: '#1b2230', color: '#c3cfdd' }
                }, 'CANCEL'),
                React.createElement('button', {
                  type: 'button', onClick: saveSeatEditor,
                  style: { flex: 1, padding: '5px', borderRadius: '5px', fontSize: '10.5px',
                           fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
                           border: '1px solid #2f7a52', color: '#fff',
                           background: 'linear-gradient(180deg,#3f8f5a,#2d7346)' }
                }, 'SAVE')
              ),
              React.createElement('div', {
                style: { fontSize: '9px', color: '#6f7f97', marginTop: '6px', lineHeight: 1.4 }
              }, 'Sign-in stays ' + editingSeat + ' \u2014 this only changes how they are named on assignment lists and results.')
            ) : null
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
      if (!armed || !window.ExerciseStore) return;

      // The unit is resolved INSIDE the tick, not captured from the render that
      // started this effect. If the banner mounts before the route settles — arming
      // authoring and then navigating, or arming on a bare '#/symmetre' — a captured
      // unit id would leave this counting changes on the wrong unit forever, which
      // reads exactly like the count being frozen at zero.
      function currentUnit() {
        var m = /#\/symmetre\/([^/?]+)/.exec(window.location.hash || '');
        return m ? decodeURIComponent(m[1]) : (props.unitId || 'AHU-4-4');
      }

      function tick() {
        var u = currentUnit();
        if (!u) return;
        try {
          var s = window.ExerciseStore.snapshot(u);
          setCount(Object.keys(s.setup).length);
        } catch (e) {}
      }

      tick();

      // Recompute the moment a value actually changes. The controllers already
      // notify every subscriber on setValue, so this is the real signal — the
      // interval below is only a backstop for the things that move state without
      // going through a controller (a weather override, PointRegistry).
      var unsubs = [];
      ['AHU46Controller', 'AHU44NewController', 'AHU43Controller', 'AHU23Controller',
       'VAV4402Controller', 'VAV0203Controller'].forEach(function (name) {
        var c = window[name];
        if (!c || typeof c.subscribe !== 'function') return;
        try {
          var off = c.subscribe(tick);
          if (typeof off === 'function') unsubs.push(off);
        } catch (e) {}
      });

      var iv = setInterval(tick, 1000);
      return function () {
        clearInterval(iv);
        unsubs.forEach(function (off) { try { off(); } catch (e) {} });
      };
    }, [armed, unitId, props.unitId]);

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
