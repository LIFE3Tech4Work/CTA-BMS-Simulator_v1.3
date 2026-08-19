/**
 * ResetControls.jsx — shared reset buttons for the unit control panels
 *
 * Two genuinely different actions, which the panels had been conflating:
 *
 *   ALARM RESET          — clears a LATCHED safety trip (freezestat, DPS chain).
 *                          Only meaningful on a unit that has one, and it does
 *                          nothing if the underlying condition is still present.
 *   RESET ALL TO DEFAULTS — releases every manual override on the unit so the
 *                          control sequence takes back over.
 *
 * Only AHU-4-4 had the second one, so an instructor on any other tab had no way to
 * undo a class's worth of overrides without touching each point. It is now on every
 * unit, from one component rather than four pasted copies — the four-copy version is
 * what let the toolbar reload silently miss three units.
 *
 * Reset-all is destructive to a student's work, so it asks twice: the first press
 * arms it, the second performs it, and it disarms itself after a few seconds. That
 * is cheaper than an undo and less annoying than a modal.
 *
 * AHU-4-4's version wrote a hardcoded table of starting values before clearing
 * overrides. That table is exactly the thing that rots when a unit gains a
 * setpoint, so this uses clearModes(), which restores each point's own
 * pre-override value and needs no per-unit knowledge.
 *
 * No import/export — exposes window.ResetControls.
 */
(function () {
  'use strict';

  var useState = React.useState, useEffect = React.useEffect;

  var ARM_MS = 4000;

  function resolve(name, zoneId) {
    var c = window[name];
    if (!c) return null;
    // VAV zones take a zone id on every call; the AHUs do not.
    if (zoneId) {
      return {
        clearModes: function () { if (c.clearModes) c.clearModes(zoneId); },
        recalculate: function () { if (c.recalculate) c.recalculate(zoneId); }
      };
    }
    return {
      clearModes: function () { if (c.clearModes) c.clearModes(); },
      recalculate: function () { if (c.recalculate) c.recalculate(); }
    };
  }

  /**
   * Release every override on a unit.
   * props: { controller, zoneId, faultEngine }
   */
  function ResetAllButton(props) {
    var [armed, setArmed] = useState(false);
    var [done, setDone] = useState(false);

    // Arming expires on its own — a button left mid-confirm is a trap for whoever
    // clicks next.
    useEffect(function () {
      if (!armed) return;
      var t = setTimeout(function () { setArmed(false); }, ARM_MS);
      return function () { clearTimeout(t); };
    }, [armed]);

    useEffect(function () {
      if (!done) return;
      var t = setTimeout(function () { setDone(false); }, 2200);
      return function () { clearTimeout(t); };
    }, [done]);

    function fire() {
      if (!armed) { setArmed(true); return; }
      var ctrl = resolve(props.controller, props.zoneId);
      if (ctrl) { ctrl.clearModes(); ctrl.recalculate(); }
      // Latched alarms belong to the unit's own engine, so clear those too or the
      // panel reads clean while the board still shows a trip.
      if (props.faultEngine) {
        var eng = window[props.faultEngine];
        if (eng && eng.reset) { try { eng.reset(); } catch (e) {} }
      }
      setArmed(false);
      setDone(true);
    }

    var label = done ? '\u2713  DEFAULTS RESTORED'
      : (armed ? 'PRESS AGAIN TO CONFIRM' : '\u21ba  RESET ALL TO DEFAULTS');

    // Amber only while armed. Previously the button was amber at rest, which made
    // the loudest thing in the panel an action nobody had asked for yet.
    var palette = done
      ? { bg: 'rgba(63,143,90,.16)', border: '#2f7a52', text: '#1e6b3f' }
      : (armed
        ? { bg: 'rgba(230,162,60,.22)', border: '#b9791b', text: '#7a4d05' }
        : { bg: '#eef2f8', border: '#a9b6c9', text: '#3f5170' });

    return React.createElement('button', {
      type: 'button',
      onClick: fire,
      title: armed
        ? 'Press again to release every manual override on this unit'
        : 'Release every manual override on this unit and return it to its control sequence',
      style: {
        width: '100%', padding: '6px 8px', borderRadius: '5px',
        fontSize: '10px', fontWeight: 800, letterSpacing: '.4px',
        fontFamily: 'inherit', cursor: 'pointer',
        background: palette.bg,
        border: '1px solid ' + palette.border,
        color: palette.text,
        transition: 'background .12s, border-color .12s, color .12s'
      }
    }, label);
  }

  /**
   * Clear latched safety trips. Only for units that actually latch something.
   * props: { controller }
   */
  function AlarmResetButton(props) {
    var [pressed, setPressed] = useState(false);

    useEffect(function () {
      if (!pressed) return;
      var t = setTimeout(function () { setPressed(false); }, 1400);
      return function () { clearTimeout(t); };
    }, [pressed]);

    function fire() {
      var c = window[props.controller];
      if (c && c.setValue) c.setValue('resetPressed', true);
      setPressed(true);
    }

    return React.createElement('button', {
      type: 'button',
      onClick: fire,
      // Says what a reset can and cannot do, since a trip whose condition is still
      // present will simply re-latch and the button will look broken.
      title: 'Clear latched safety trips. A condition that is still present will trip again immediately.',
      style: {
        width: '100%', padding: '6px 8px', borderRadius: '5px',
        fontSize: '10px', fontWeight: 800, letterSpacing: '.4px',
        fontFamily: 'inherit', cursor: 'pointer',
        background: pressed ? 'rgba(53,189,211,.2)' : '#eef2f8',
        border: '1px solid ' + (pressed ? '#2b8fa3' : '#a9b6c9'),
        color: pressed ? '#0d4a56' : '#3f5170',
        transition: 'background .12s, border-color .12s, color .12s'
      }
    }, pressed ? '\u2713  RESET SENT' : 'ALARM RESET');
  }

  window.ResetControls = {
    ResetAllButton: ResetAllButton,
    AlarmResetButton: AlarmResetButton
  };
})();
