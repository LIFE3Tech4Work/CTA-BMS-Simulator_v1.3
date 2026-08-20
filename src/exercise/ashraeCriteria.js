/**
 * ashraeCriteria.js — ASHRAE-linked success criteria for instructor exercises
 *
 * The exercise author could already target any point with any number, which is
 * flexible but leaves the instructor inventing thresholds and the student with no
 * reason why 60°F is the answer. These criteria tie a success condition to a
 * recognised standard, so an exercise reads as "restore compliance with ASHRAE
 * 62.1 ventilation" rather than "make this number be 1100".
 *
 * Standards referenced are the four the simulator already teaches (see
 * ui/shared/ASHRAECallout.jsx): 55 thermal comfort, 62.1 ventilation, 90.1 energy,
 * Guideline 36 sequences of operation.
 *
 * ── A NOTE ON HONESTY ────────────────────────────────────────────────────────
 * Some of these are requirements in the standard; others are widely-applied design
 * targets derived from it. They are NOT the same thing, and a training tool that
 * blurs them teaches the wrong habit. Each criterion therefore carries a `basis`:
 *
 *   'requirement' — the standard sets this explicitly
 *   'indicator'   — a commonly-applied proxy or design target the standard informs
 *
 * The wording shown to students reflects that distinction.
 *
 * Targets resolve against live controller state wherever the unit already holds
 * the number (minimum OA airflow, active setpoint, damper minimum), so a criterion
 * follows the unit's own configuration instead of hardcoding a value that then
 * disagrees with the sequence.
 *
 * No import/export — exposes window.ASHRAECriteria.
 */
(function () {
  'use strict';

  // Outdoor CO₂ baseline used for the differential indicator. 400 ppm is the
  // conventional figure; the real outdoor value varies by site and season.
  var OUTDOOR_CO2_PPM = 400;

  /** First candidate key present as a number (or boolean) on this state. */
  function resolveKey(state, candidates) {
    if (!state) return null;
    for (var i = 0; i < candidates.length; i++) {
      var v = state[candidates[i]];
      if (typeof v === 'number' || typeof v === 'boolean') return candidates[i];
    }
    return null;
  }

  var CRITERIA = [
    // ─── 62.1 Ventilation and Acceptable Indoor Air Quality ──────────────────
    {
      id: 'iaq-co2-differential',
      standard: '62.1',
      label: 'Zone CO₂ within ventilation indicator',
      basis: 'indicator',
      citation: 'ASHRAE 62.1 Appendix C — CO₂ as an indicator of ventilation rate per person',
      rationale:
        'CO₂ is not itself a compliance limit in 62.1. It is used as a proxy: roughly ' +
        '700 ppm above outdoor air corresponds to the ventilation rate at which most ' +
        'visitors find body-odour intensity acceptable. With a ' + OUTDOOR_CO2_PPM +
        ' ppm outdoor baseline that puts the indicator near ' + (OUTDOOR_CO2_PPM + 700) + ' ppm.',
      keys: ['co2Sensor'],
      goalFor: function () {
        return { key: 'co2Sensor', comparator: 'below', target: OUTDOOR_CO2_PPM + 700, tolerance: 0 };
      },
      appliesTo: function (state) { return typeof state.co2Sensor === 'number'; }
    },
    {
      id: 'iaq-min-oa-airflow',
      standard: '62.1',
      label: 'Minimum outdoor airflow maintained',
      basis: 'requirement',
      citation: 'ASHRAE 62.1 §6.2 — Ventilation Rate Procedure, minimum outdoor air intake',
      rationale:
        'The unit must deliver at least its design minimum outdoor airflow whenever ' +
        'the space is occupied. The target is read from the unit\'s own minimum OA ' +
        'airflow setpoint rather than assumed, so it matches how this AHU is configured.',
      goalFor: function (state) {
        return {
          key: 'oaCFM',
          comparator: 'above',
          target: state.minOAAirflowSetpoint || 4900,
          tolerance: 0
        };
      },
      appliesTo: function (state) { return typeof state.oaCFM === 'number'; }
    },
    {
      id: 'iaq-min-damper',
      standard: '62.1',
      label: 'OA damper at or above minimum position',
      basis: 'requirement',
      citation: 'ASHRAE 62.1 §5.16 — outdoor air intake, minimum position during occupancy',
      rationale:
        'Closing the outdoor air damper below its minimum position starves the space ' +
        'of ventilation air even when temperatures look correct — a fault a student ' +
        'will not catch by watching supply air alone.',
      goalFor: function (state) {
        return {
          key: 'oaDamperPosition',
          comparator: 'above',
          target: (state.economizerMinPosition || 20) - 0.5,
          tolerance: 0
        };
      },
      appliesTo: function (state) { return typeof state.oaDamperPosition === 'number'; }
    },

    // ─── 55 Thermal Environmental Conditions for Human Occupancy ─────────────
    {
      id: 'comfort-zone-winter',
      standard: '55',
      label: 'Zone temperature in winter comfort range',
      basis: 'indicator',
      citation: 'ASHRAE 55 §5.3 — graphic comfort zone method (heating season, typical clothing)',
      rationale:
        'The comfort zone in 55 depends on clothing, air speed and humidity rather ' +
        'than being a single fixed band. 68–75°F operative temperature is the range ' +
        'commonly cited for winter conditions, so it is used here as the target. ' +
        'On a unit with no space sensor this measures return air, the usual proxy ' +
        'for occupied-space temperature.',
      keys: ['spaceTemp', 'zoneTemp', 'returnAirTemp'],
      goalFor: function (state) {
        return {
          key: resolveKey(state, ['spaceTemp', 'zoneTemp', 'returnAirTemp']) || 'spaceTemp',
          comparator: 'within', target: 71.5, tolerance: 3.5
        };
      },
      appliesTo: function (state) {
        return !!resolveKey(state, ['spaceTemp', 'zoneTemp', 'returnAirTemp']);
      }
    },
    {
      id: 'comfort-zone-summer',
      standard: '55',
      label: 'Zone temperature in summer comfort range',
      basis: 'indicator',
      citation: 'ASHRAE 55 §5.3 — graphic comfort zone method (cooling season, typical clothing)',
      rationale:
        '73–79°F operative temperature is the range commonly cited for summer ' +
        'conditions, reflecting lighter clothing than the winter case. On a unit ' +
        'with no space sensor this measures return air, the usual proxy for ' +
        'occupied-space temperature.',
      keys: ['spaceTemp', 'zoneTemp', 'returnAirTemp'],
      goalFor: function (state) {
        return {
          key: resolveKey(state, ['spaceTemp', 'zoneTemp', 'returnAirTemp']) || 'spaceTemp',
          comparator: 'within', target: 76, tolerance: 3
        };
      },
      appliesTo: function (state) {
        return !!resolveKey(state, ['spaceTemp', 'zoneTemp', 'returnAirTemp']);
      }
    },
    {
      id: 'comfort-humidity-cap',
      standard: '55',
      label: 'Space humidity below upper limit',
      basis: 'requirement',
      citation: 'ASHRAE 55 §5.3.2 — humidity ratio not to exceed 0.012 lb water / lb dry air',
      rationale:
        '55 sets an upper humidity limit but no lower one. Expressed here as a ' +
        'relative-humidity ceiling for the supply air the unit is delivering, which ' +
        'is the reading a student can actually act on from this station.',
      keys: ['supplyAirRH', 'supplyRH'],
      goalFor: function (state) {
        return {
          key: resolveKey(state, ['supplyAirRH', 'supplyRH']) || 'supplyAirRH',
          comparator: 'below', target: 65, tolerance: 0
        };
      },
      appliesTo: function (state) { return !!resolveKey(state, ['supplyAirRH', 'supplyRH']); }
    },

    // ─── 90.1 Energy Standard ────────────────────────────────────────────────
    {
      id: 'energy-no-simultaneous',
      standard: '90.1',
      label: 'No simultaneous heating and cooling',
      basis: 'requirement',
      citation: 'ASHRAE 90.1 §6.5.2 — simultaneous heating and cooling limitation',
      rationale:
        'Heating and cooling the same air stream wastes both. The exception that ' +
        'matters here is dehumidification: reheating air deliberately cooled to dry ' +
        'it is legitimate, which is why this criterion targets the heating valve ' +
        'while the unit is not dehumidifying.',
      goalFor: function () {
        return { key: 'phtValvePosition', comparator: 'below', target: 1, tolerance: 0 };
      },
      appliesTo: function (state) { return typeof state.phtValvePosition === 'number'; }
    },
    {
      id: 'energy-economizer-active',
      standard: '90.1',
      label: 'Economizer using available free cooling',
      basis: 'requirement',
      citation: 'ASHRAE 90.1 §6.5.1 — air economizer, required operation when conditions permit',
      rationale:
        'When outdoor air is cool and dry enough to cool the space, the unit is ' +
        'required to use it rather than run mechanical cooling. Pair this with an ' +
        'outdoor condition that makes free cooling available.',
      goalFor: function () {
        return { key: 'economizerActive', comparator: 'above', target: 0.5, tolerance: 0 };
      },
      appliesTo: function (state) { return typeof state.economizerActive === 'boolean'; }
    },

    // ─── Guideline 36 High-Performance Sequences of Operation ────────────────
    {
      id: 'soo-supply-air-setpoint',
      standard: '36',
      label: 'Supply air at its active setpoint',
      basis: 'requirement',
      citation: 'ASHRAE Guideline 36 §5.16 — AHU supply air temperature control',
      rationale:
        'The unit should hold supply air at whatever setpoint is currently in ' +
        'control. The target is read live from the unit, so it stays correct when a ' +
        'reset schedule or season change moves that setpoint.',
      goalFor: function (state) {
        return {
          key: 'supplyAirTemp',
          comparator: 'within',
          target: (typeof state.activeSetpoint === 'number' ? state.activeSetpoint : 60),
          tolerance: 1.5
        };
      },
      appliesTo: function (state) { return typeof state.supplyAirTemp === 'number'; }
    },
    {
      id: 'soo-duct-static',
      standard: '36',
      label: 'Duct static pressure at setpoint',
      basis: 'requirement',
      citation: 'ASHRAE Guideline 36 §5.16.4 — supply fan static pressure control',
      rationale:
        'Fan speed should modulate to hold duct static at setpoint. A unit sitting ' +
        'well off setpoint is either riding a manual fan command or fighting a ' +
        'damper somewhere downstream.',
      goalFor: function (state) {
        return {
          key: 'ductStaticPressure',
          comparator: 'within',
          target: (typeof state.ductStaticPressureSetpoint === 'number'
            ? state.ductStaticPressureSetpoint : 1.5),
          tolerance: 0.15
        };
      },
      appliesTo: function (state) { return typeof state.ductStaticPressure === 'number'; }
    }
  ];

  // What to break so that each criterion is violated, and how to describe it. Written
  // per criterion rather than per unit: the same violation reads the same whichever air
  // handler it is set on, and a scenario that only worked on one unit would be a trap.
  var SCENARIOS = {
    'iaq-co2-differential': {
      title: 'Ventilation not keeping up with occupancy',
      brief: 'The space is at high occupancy and zone CO₂ has climbed past the level ASHRAE 62.1 uses to indicate adequate ventilation. Work out why the unit is not bringing in enough outdoor air, and bring CO₂ back down.',
      setup: { co2Sensor: 1450, oaDamperPosition: 0 }
    },
    'iaq-min-oa-airflow': {
      title: 'Outdoor airflow below the design minimum',
      brief: 'The unit is not delivering its design minimum outdoor airflow while the space is occupied. Find what is restricting it and restore the required rate.',
      setup: { oaDamperPosition: 5 }
    },
    'iaq-min-damper': {
      title: 'Outdoor air damper closed during occupancy',
      brief: 'Temperatures look correct but the space is being starved of ventilation air. Find out why the outdoor air damper is shut and restore its minimum position.',
      setup: { oaDamperPosition: 0 }
    },
    'comfort-zone-winter': {
      title: 'Zone below the winter comfort range',
      brief: 'Occupants report the space is too cold for the season. Diagnose the cause and bring the zone back into the comfort range ASHRAE 55 describes.',
      // spaceTemp is what this criterion measures, and neither the heating setpoint nor
      // outdoor air moved it out of the 68-75 band on their own — the fault has to reach
      // the measured point, so it is set directly alongside the cause.
      setup: { spaceTemp: 62, heatingCoilSetpoint: 45, oaTemperature: 28 }
    },
    'comfort-zone-summer': {
      title: 'Zone above the summer comfort range',
      brief: 'Occupants report the space is too warm. Diagnose the cause and bring the zone back into the comfort range ASHRAE 55 describes.',
      setup: { coolingCoilSetpoint: 74, oaTemperature: 88 }
    },
    'comfort-humidity-cap': {
      title: 'Supply air too humid',
      brief: 'Supply air humidity is above the upper limit ASHRAE 55 sets. Work out why the unit is not drying the air and bring it back under the limit.',
      setup: { chwValvePosition: 0, oaTemperature: 82, oaRelHumidity: 90 }
    },
    'energy-no-simultaneous': {
      title: 'Heating and cooling at the same time',
      brief: 'Both coils are conditioning the same air stream, which wastes each against the other. Find out why and stop it — unless the unit is legitimately reheating air it has cooled to dry.',
      setup: { phtValvePosition: 60, chwValvePosition: 60 }
    },
    'energy-economizer-active': {
      title: 'Free cooling available but unused',
      brief: 'Outdoor conditions are suitable for free cooling, but the unit is running mechanical cooling instead. Work out why the economizer is not engaging.',
      setup: { oaTemperature: 55, economizerActive: false, oaDamperPosition: 20 }
    },
    'soo-supply-air-setpoint': {
      title: 'Supply air off its setpoint',
      brief: 'Supply air is running well above the setpoint currently in control and the cooling coil is shut. Work out why the unit is not holding setpoint and bring supply air back.',
      // Overrides supplyAirTemp itself, not the valve. Under the current coil model
      // supply air is computed FROM the active setpoint, so a valve at 100% reads the
      // same as one at 56% — no valve fault can move it. Setting the measured point is
      // the only setup that fails today; revisit once valve position drives temperature.
      setup: { supplyAirTemp: 74, chwValvePosition: 0 }
    },
    'soo-duct-static': {
      title: 'Duct static pressure off setpoint',
      brief: 'The supply fan is not holding duct static where it should. Find what is driving it and restore control.',
      setup: { fanSpeedSetpoint: 35 }
    }
  };

  /** The scenario for a criterion, or null where none is defined. */
  function scenarioFor(id) {
    var s = SCENARIOS[id];
    if (!s) return null;
    return { title: s.title, brief: s.brief, setup: Object.assign({}, s.setup) };
  }

  /**
   * Apply a setup to the unit's own controller, read what it settles into, then put the
   * unit back. A flat overlay cannot be used here: it only reflects keys the setup
   * writes directly, so it is blind to every fault whose effect is computed — including
   * a valve fault the coil model quietly corrects back to setpoint.
   */
  function settleWith(state, setup, unitId) {
    var ES = window.ExerciseStore;
    var ctrl = (ES && ES.controllerFor && unitId) ? ES.controllerFor(unitId) : null;
    if (!ctrl || !ctrl.setValue || !ctrl.getState) return Object.assign({}, state, setup);
    var keys = Object.keys(setup);
    try {
      keys.forEach(function (k) { ctrl.setValue(k, setup[k]); });
      if (ctrl.recalculate) { for (var i = 0; i < 12; i++) ctrl.recalculate(); }
      return Object.assign({}, ctrl.getState());
    } catch (e) {
      return Object.assign({}, state, setup);
    } finally {
      // Never leave the probe's fault on the unit the instructor is looking at.
      keys.forEach(function (k) {
        if (ctrl.clearMode) { try { ctrl.clearMode(k); } catch (e2) {} }
      });
      if (ctrl.recalculate) { try { ctrl.recalculate(); } catch (e3) {} }
    }
  }

  /**
   * Criteria that can generate a WORKING scenario on this unit.
   *
   * Two tests, and the second matters more: every setup key must exist on the unit, and
   * the scenario must leave its own criterion FAILING. A scenario whose goal is already
   * met produces an exercise a student passes without touching anything — worse than
   * offering nothing, because appearing in the dropdown makes it look vetted.
   */
  function scenariosFor(state, unitId) {
    if (!state) return [];
    return CRITERIA.filter(function (cr) {
      var s = SCENARIOS[cr.id];
      if (!s) return false;
      if (!Object.keys(s.setup).every(function (k) { return state[k] !== undefined; })) return false;

      var after = settleWith(state, s.setup, unitId);
      var g;
      try { g = cr.goalFor(after); } catch (e) { return false; }
      var v = after[g.key];
      if (typeof v !== 'number' && typeof v !== 'boolean') return true;
      var n = (typeof v === 'boolean') ? (v ? 1 : 0) : v;
      var passes =
        g.comparator === 'within' ? Math.abs(n - g.target) <= (g.tolerance || 0.5)
        : g.comparator === 'above' ? n > g.target
        : g.comparator === 'below' ? n < g.target
        : false;
      return !passes;   // only offer scenarios that start unsolved
    });
  }

  /** Criteria whose measured point exists on this unit's state. */
  function forState(state) {
    if (!state) return [];
    return CRITERIA.filter(function (c) {
      try { return c.appliesTo(state); } catch (e) { return false; }
    });
  }

  function byId(id) {
    for (var i = 0; i < CRITERIA.length; i++) if (CRITERIA[i].id === id) return CRITERIA[i];
    return null;
  }

  /**
   * Turn a criterion into a goal object, resolved against the unit's current
   * state. Carries the standard through so the student sees the basis for the
   * target rather than a bare number.
   */
  function goalFrom(id, state, meta) {
    var c = byId(id);
    if (!c) return null;
    var g = c.goalFor(state || {});
    var m = meta || {};
    return {
      key: g.key,
      comparator: g.comparator,
      target: g.target,
      tolerance: g.tolerance,
      label: m.label || g.key,
      unit: m.unit || '',
      // Carried on the goal so every surface — author preview, student brief,
      // instructor report — can cite the same source.
      standard: c.standard,
      criterionId: c.id,
      criterionLabel: c.label,
      citation: c.citation,
      basis: c.basis
    };
  }

  /** Short badge text, e.g. "ASHRAE 62.1". Guideline 36 is not a numbered standard. */
  function badge(standard) {
    if (!standard) return '';
    return standard === '36' ? 'ASHRAE Guideline 36' : 'ASHRAE ' + standard;
  }

  window.ASHRAECriteria = {
    OUTDOOR_CO2_PPM: OUTDOOR_CO2_PPM,
    all: CRITERIA,
    forState: forState,
    scenarioFor: scenarioFor,
    scenariosFor: scenariosFor,
    byId: byId,
    goalFrom: goalFrom,
    badge: badge
  };
})();
