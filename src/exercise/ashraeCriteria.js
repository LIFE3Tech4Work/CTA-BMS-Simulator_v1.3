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
    byId: byId,
    goalFrom: goalFrom,
    badge: badge
  };
})();
