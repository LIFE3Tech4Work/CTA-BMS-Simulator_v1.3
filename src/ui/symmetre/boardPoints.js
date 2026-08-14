/**
 * boardPoints.js — chip schema + point metadata for the SymmetrE vector board.
 *
 * Maps the vector board's fixed 1613×878 coordinate slots onto the EXISTING
 * v1.3 controller state keys (AHU46Controller / AHU44NewController /
 * AHU23Controller). Nothing here invents data: every chip resolves to a real
 * key on the unit's controller, and labels/units follow v1.3's own naming
 * (see each controller's state block and the previous *ImageOverlay.jsx
 * HOTSPOTS lists). Slots on the artwork with no corresponding v1.3 point are
 * intentionally left empty rather than filled with a stand-in.
 *
 * chip tuple: [stateKey, type, x, y, boxWidth|null, align, fontSize]
 *   type 'pill' = dark read-only actual value   (align/fontSize used)
 *   type 'box'  = white/grey framed value       (boxWidth used)
 *
 * No import/export — exposed as window.SymmetreBoardPoints
 */
(function () {
  'use strict';

  // ─── Point metadata, keyed by controller state key ──────────────────────────
  // kind: 'ai' read-only sensor · 'ao' commandable output (Auto/Manual)
  //       'sp' operator setpoint · 'bi' read-only binary · 'bo' commandable binary
  // catalog: POINT_CATALOG key per unit — gives the modal v1.3's real BACnet
  //          address, range, COV increment and recorded history.
  var META = {
    // ── sensors ──────────────────────────────────────────────────────────────
    supplyAirTemp:   { label: 'Supply Air Temperature', unit: '°F', kind: 'ai', dec: 1, min: 40, max: 120,
                       catalog: { 'AHU-4-6': 'AHU04_06SATemp', 'AHU-4-4': 'AHU04_04SATemp' }, bac: 'SATemp' },
    returnAirTemp:   { label: 'Return Air Temperature', unit: '°F', kind: 'ai', dec: 1, min: 40, max: 120,
                       catalog: { 'AHU-4-6': 'AHU04_06RATemp', 'AHU-4-4': 'AHU04_04RATemp' }, bac: 'RATemp' },
    mixedAirTemp:    { label: 'Mixed Air Temperature', unit: '°F', kind: 'ai', dec: 1, min: 0, max: 120, bac: 'MATemp' },
    preheatTemp:     { label: 'Preheat Discharge Temperature', unit: '°F', kind: 'ai', dec: 1, min: 0, max: 140, bac: 'PhtDischTemp' },
    returnAirRH:     { label: 'Return Air Humidity', unit: '%RH', kind: 'ai', dec: 1, min: 0, max: 100,
                       catalog: { 'AHU-4-6': 'AHU04_06RAHumid' }, bac: 'RAHumid' },
    supplyAirRH:     { label: 'Supply Air Humidity', unit: '%RH', kind: 'ai', dec: 1, min: 0, max: 100, bac: 'SAHumid' },
    supplyStaticPressure: { label: 'Supply Air %RH', unit: '%RH', kind: 'ai', dec: 1, min: 0, max: 100, bac: 'SAHumid' },
    co2Sensor:       { label: 'Return Air CO₂', unit: 'PPM', kind: 'ai', dec: 0, min: 0, max: 2000,
                       catalog: { 'AHU-4-6': 'AHU04_06RACO2', 'AHU-4-4': 'AHU04_04RACO2' }, bac: 'RACO2' },
    cfm:             { label: 'Supply Air Flow', unit: 'CFM', kind: 'ai', dec: 0, min: 0, max: 14000, bac: 'SAFlow' },
    oaCFM:           { label: 'Outside Air Flow', unit: 'CFM', kind: 'ai', dec: 0, min: 0, max: 14000, bac: 'OAFlow' },
    returnFanCFM:    { label: 'Return Air Flow', unit: 'CFM', kind: 'ai', dec: 0, min: 0, max: 14000, bac: 'RAFlow' },
    returnCFM:       { label: 'Return Air Flow', unit: 'CFM', kind: 'ai', dec: 0, min: 0, max: 14000, bac: 'RAFlow' },
    ductStaticPressure: { label: 'Duct Static Pressure', unit: 'IWC', kind: 'ai', dec: 2, min: 0, max: 4,
                       catalog: { 'AHU-4-6': 'AHU04_06BranchStaticPress', 'AHU-4-4': 'AHU04_04BranchStaticPress' },
                       bac: 'BranchStaticPress' },
    returnAirEnthalpy: { label: 'Return Air Enthalpy', unit: 'BTU', kind: 'ai', dec: 1, min: 0, max: 60, bac: 'RAEnthalpy',
                       derive: 'returnEnthalpy' },

    // ── commandable outputs ──────────────────────────────────────────────────
    oaDamperPosition: { label: 'Outside Air Damper', unit: '%', kind: 'ao', dec: 0, min: 0, max: 100, step: 5,
                       catalog: { 'AHU-4-6': 'AHU04_06OADamper', 'AHU-4-4': 'AHU04_04OADamper' }, bac: 'OADamper' },
    phtValvePosition: { label: 'Heating Coil Valve', unit: '%', kind: 'ai', dec: 0, min: 0, max: 100, step: 5,
                       catalog: { 'AHU-4-6': 'AHU04_06PHTCoil01Valve', 'AHU-4-4': 'AHU04_04PHTCoil01Valve' },
                       bac: 'PHTCoil01Valve' },
    chwValvePosition: { label: 'Cooling Coil Valve', unit: '%', kind: 'ai', dec: 0, min: 0, max: 100, step: 5,
                       catalog: { 'AHU-4-6': 'AHU04_06CHWCoilValve', 'AHU-4-4': 'AHU04_04CHWCoilValve' },
                       bac: 'CHWCoilValve' },
    fanSpeed:        { label: 'Supply Fan Speed', unit: '%', kind: 'ai', dec: 0, min: 0, max: 100, step: 5,
                       catalog: { 'AHU-4-6': 'AHU04_06SAFanSpeed', 'AHU-4-4': 'AHU04_04SAFanSpeed' }, bac: 'SAFanSpeed' },
    exhaustDamperPct: { label: 'Exhaust Air Damper', unit: '%', kind: 'ai', dec: 0, min: 0, max: 100, bac: 'EADamper' },
    returnAirDamperPosition: { label: 'Return Air Damper', unit: '%', kind: 'ai', dec: 0, min: 0, max: 100, bac: 'RADamper' },
    returnAirDamperPct: { label: 'Return Air Damper', unit: '%', kind: 'ai', dec: 0, min: 0, max: 100, bac: 'RADamper' },
    spillDamperPosition: { label: 'Spill Air Damper', unit: '%', kind: 'ai', dec: 0, min: 0, max: 100, bac: 'SpillDamper' },
    spillDamperPct:  { label: 'Spill Air Damper', unit: '%', kind: 'ai', dec: 0, min: 0, max: 100, bac: 'SpillDamper' },

    // ── setpoints ────────────────────────────────────────────────────────────
    coolingCoilSetpoint: { label: 'Cooling Coil Active SP', unit: '°F', kind: 'sp', dec: 1, min: 45, max: 75, step: 0.5, bac: 'ClgSp' },
    heatingCoilSetpoint: { label: 'Heating Coil Active SP', unit: '°F', kind: 'sp', dec: 1, min: 40, max: 75, step: 0.5, bac: 'HtgSp' },
    plenumMinSetpoint:   { label: 'Active Minimum Setpoint', unit: '°F', kind: 'sp', dec: 1, min: 35, max: 60, step: 0.5, bac: 'PlenumMinSp' },
    economizerTempControlSP: { label: 'Economizer Temp Control SP', unit: '°F', kind: 'sp', dec: 1, min: 45, max: 70, step: 0.5, bac: 'EconTempSp' },
    co2Setpoint:         { label: 'CO₂ Setpoint', unit: 'PPM', kind: 'sp', dec: 0, min: 400, max: 1500, step: 25, bac: 'CO2Sp' },
    minOAAirflowSetpoint:{ label: 'Min OA Airflow Active SP', unit: 'CFM', kind: 'sp', dec: 0, min: 0, max: 12000, step: 100, bac: 'MinOAFlowSp' },
    ductStaticPressureSetpoint: { label: 'Duct Static Pressure SP', unit: 'IWC', kind: 'sp', dec: 2, min: 0.2, max: 3, step: 0.05, bac: 'StaticSp' },
    returnFanFlowTrackingSetpoint: { label: 'Return Fan Track SP', unit: '%', kind: 'sp', dec: 0, min: 50, max: 110, step: 5, bac: 'RFTrackSp' },
    fanSpeedSetpoint:    { label: 'Fan Speed Setpoint', unit: '%', kind: 'sp', dec: 0, min: 0, max: 100, step: 5, bac: 'FanSpeedSp' },

    // ── binaries ─────────────────────────────────────────────────────────────
    runSchedule:      { label: 'Run Schedule', unit: '', kind: 'bo', options: ['On', 'Off'], bac: 'RunSchedule',
                        catalog: { 'AHU-4-6': 'AHU04_06RunSchedule', 'AHU-4-4': 'AHU04_04RunSchedule' } },
    economizerActive: { label: 'Economizer Signal', unit: '', kind: 'bi', options: ['ON', 'OFF'], bac: 'EconActive' },
    freezePumpOn:     { label: 'Freeze Protection Pump', unit: '', kind: 'bo', options: ['On', 'Off'], bac: 'FrzPump' },
    commonDamperOpen: { label: 'Common Damper', unit: '', kind: 'bo', options: ['Open', 'Closed'], bac: 'CommonDamper' },
    interlockOn:      { label: 'Interlock', unit: '', kind: 'bi', options: ['On', 'Off'], bac: 'Interlock' },
    fanRunning:       { label: 'Supply Fan Status', unit: '', kind: 'bi', options: ['Running', 'Stopped'], bac: 'SFanStatus' },
    supplyFanStatus:  { label: 'Supply Fan Status', unit: '', kind: 'bi', options: ['ON', 'OFF'], bac: 'SFanSS' },
    returnFanStatus:  { label: 'Return Fan Status', unit: '', kind: 'bi', options: ['ON', 'OFF'], bac: 'RFanSS' },
    phtValveStatus:   { label: 'Heating Valve Status', unit: '', kind: 'bi', options: ['ON', 'OFF'], bac: 'PhtVlvStatus' },
    chwValveStatus:   { label: 'Cooling Valve Status', unit: '', kind: 'bi', options: ['ON', 'OFF'], bac: 'ChwVlvStatus' },
  };

  // ─── Alarm pill stacks — lit from each unit's existing fault-engine state ───
  // key → controller state key that lights it (read straight off getState()).
  var PILL_SOURCES = {
    sf: { fail: 'supplyFanVFDFault', hi_suction: 'dps2Tripped', hi_pressure: 'dps3Tripped',
          vfd_fault: 'supplyFanVFDBypass', tamper: null, interlock_tamper: null, interlock_fail: null },
    rf: { fail: 'returnFanVFDFault', hi_suction: 'dps4Tripped', hi_pressure: 'dps5Tripped',
          vfd_fault: 'returnFanVFDBypass', tamper: null, interlock_tamper: null, interlock_fail: null },
    frz: { freeze: 'freezestatShutdown' },
  };

  var UNITS = {
    'AHU-4-6': {
      ahu: 'AHU-4-6', board: 'MAIN', controller: 'AHU46Controller', faultEngine: 'AHU46FaultEngine',
      dev: 'DEV4006', bacPrefix: 'AHU04_06',
      art: { showCommon: false },
      chips: [
        ['returnAirEnthalpy', 'pill', 1211, 159, null, 'right', 13],
        ['returnAirRH',       'pill', 1211, 184, null, 'right', 13],
        ['returnAirTemp',     'pill', 1211, 212, null, 'right', 13],
        ['co2Sensor',         'pill', 1297, 212, null, 'right', 13],
        ['supplyAirRH',       'pill', 1145, 506, null, 'left', 12.5],
        ['supplyAirTemp',     'pill', 1145, 532, null, 'left', 12.5],
        ['oaCFM',             'pill', 220,  530, null, 'right', 13],
        ['returnFanCFM',      'pill', 892,  220, null, 'left', 13],
        ['cfm',               'pill', 892,  528, null, 'left', 13],
        ['mixedAirTemp',      'pill', 481,  530, null, 'right', 13],
        ['preheatTemp',       'pill', 849,  530, null, 'right', 13],
        ['ductStaticPressure','pill', 1366, 530, null, 'right', 13],
        ['exhaustDamperPct',  'box',  250,  288, 38],
        ['returnAirDamperPosition', 'box', 424, 400, 32],
        ['economizerActive',  'box',  248,  370, 44],
        ['returnFanFlowTrackingSetpoint', 'box', 918, 291, 47],
        ['co2Setpoint',       'box',  1227, 291, 46],
        ['minOAAirflowSetpoint', 'box', 146, 593, 46],
        ['oaDamperPosition',  'box',  251,  593, 38],
        ['economizerTempControlSP', 'box', 439, 593, 42],
        ['phtValvePosition',  'box',  623,  630, 42],
        ['chwValvePosition',  'box',  718,  630, 42],
        ['heatingCoilSetpoint', 'box', 807, 593, 42],
        ['fanSpeed',          'box',  1055, 593, 32],
        ['coolingCoilSetpoint', 'box', 1148, 593, 42],
        ['ductStaticPressureSetpoint', 'box', 1318, 593, 48],
      ],
      fans: [
        { key: 'returnFanStatus', cmdKey: 'runSchedule', interlockKey: 'interlockOn', x: 894, y: 318, pills: 'rf', pillY: 100 },
        { key: 'supplyFanStatus', cmdKey: 'runSchedule', interlockKey: 'interlockOn', x: 894, y: 620, pills: 'sf', pillY: 424 },
      ],
      freeze: { key: 'freezePumpOn', x: 624, y: 752 },
    },

    'AHU-4-4': {
      ahu: 'AHU-4-4', board: 'MAIN', controller: 'AHU44NewController', faultEngine: 'AHU44NewFaultEngine',
      dev: 'DEV4004', bacPrefix: 'AHU04_04',
      art: { showCommon: true },
      chips: [
        ['returnAirTemp',     'pill', 1211, 212, null, 'right', 13],
        ['co2Sensor',         'pill', 1297, 212, null, 'right', 13],
        ['supplyStaticPressure', 'pill', 1145, 506, null, 'left', 12.5],
        ['supplyAirTemp',     'pill', 1145, 532, null, 'left', 12.5],
        ['oaCFM',             'pill', 220,  530, null, 'right', 13],
        ['returnCFM',         'pill', 892,  220, null, 'left', 13],
        ['cfm',               'pill', 892,  528, null, 'left', 13],
        ['mixedAirTemp',      'pill', 481,  530, null, 'right', 13],
        ['preheatTemp',       'pill', 849,  530, null, 'right', 13],
        ['exhaustDamperPct',  'box',  250,  288, 38],
        ['returnAirDamperPct', 'box', 424, 400, 32],
        ['economizerActive',  'box',  248,  370, 44],
        ['co2Setpoint',       'box',  1227, 291, 46],
        ['minOAAirflowSetpoint', 'box', 146, 593, 46],
        ['oaDamperPosition',  'box',  251,  593, 38],
        ['economizerTempControlSP', 'box', 439, 593, 42],
        ['phtValvePosition',  'box',  623,  630, 42],
        ['chwValvePosition',  'box',  718,  630, 42],
        ['heatingCoilSetpoint', 'box', 807, 593, 42],
        ['fanSpeed',          'box',  1055, 593, 32],
        ['coolingCoilSetpoint', 'box', 1148, 593, 42],
        ['spillDamperPct',    'box',  1318, 593, 48],
        ['commonDamperOpen',  'box',  152,  288, 56],
      ],
      fans: [
        { key: 'returnFanStatus', cmdKey: 'runSchedule', interlockKey: 'interlockOn', x: 894, y: 318, pills: 'rf', pillY: 100 },
        { key: 'supplyFanStatus', cmdKey: 'runSchedule', interlockKey: 'interlockOn', x: 894, y: 620, pills: 'sf', pillY: 424 },
      ],
      freeze: { key: 'freezePumpOn', x: 624, y: 752 },
    },

    'AHU-23-1': {
      ahu: 'AHU-23-1', board: 'U23', controller: 'AHU23Controller', faultEngine: null,
      dev: 'DEV2301', bacPrefix: 'AHU23_01',
      art: {},
      chips: [
        ['preheatTemp',   'pill', 528,  380, null, 'left', 13],
        ['supplyAirTemp', 'pill', 668,  380, null, 'left', 13],
        ['cfm',           'pill', 812,  388, null, 'left', 15],
        ['fanSpeed',      'pill', 1025, 487, null, 'left', 13],
        ['phtValveStatus','pill', 526,  634, null, 'left', 12],
        ['chwValveStatus','pill', 623,  634, null, 'left', 12],
        ['phtValvePosition', 'box', 540, 494, 34],
        ['chwValvePosition', 'box', 630, 494, 34],
        ['plenumMinSetpoint', 'box', 696, 494, 46],
        ['coolingCoilSetpoint', 'box', 696, 540, 46],
        ['fanSpeedSetpoint', 'box', 985, 487, 34],
      ],
      fans: [
        { key: 'fanRunning', cmdKey: 'runSchedule', interlockKey: null, x: 808, y: 528, pills: 'u23', pillY: 282 },
      ],
      freeze: null,
    },
  };

  var UNIT_ORDER = ['AHU-4-6', 'AHU-4-4', 'AHU-23-1'];

  function meta(key) { return META[key] || null; }

  function controllerFor(unitId) {
    var u = UNITS[unitId];
    return (u && window[u.controller]) || null;
  }

  /* Return-air enthalpy, BTU/lb dry air, from the unit's own return temp + RH.
     Same psychrometric relation TMY3Projector uses for outside air. */
  function returnEnthalpy(state) {
    var t = state.returnAirTemp;
    var rh = state.returnAirRH;
    if (typeof t !== 'number' || typeof rh !== 'number') return null;
    var pws = 0.0886 * Math.exp(0.0546 * (t - 32) / 1.8 + 1.6);  // approx sat. pressure, psia
    var pw = (rh / 100) * pws;
    var w = 0.62198 * pw / Math.max(14.696 - pw, 0.01);
    return 0.24 * t + w * (1061 + 0.444 * t);
  }

  window.SymmetreBoardPoints = {
    META: META,
    UNITS: UNITS,
    UNIT_ORDER: UNIT_ORDER,
    PILL_SOURCES: PILL_SOURCES,
    meta: meta,
    controllerFor: controllerFor,
    returnEnthalpy: returnEnthalpy,

    /* Formatted display value for a chip. */
    format: function (key, value) {
      var m = META[key];
      if (value === null || value === undefined) return '--';
      if (typeof value === 'boolean') {
        var o = (m && m.options) || ['On', 'Off'];
        return value ? o[0] : o[1];
      }
      if (typeof value !== 'number') return String(value);
      var dec = m ? (m.dec || 0) : 0;
      if (dec === 0 && Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
      return value.toFixed(dec);
    },

    /* Raw value for a chip, including derived points. */
    valueOf: function (state, key) {
      var m = META[key];
      if (m && m.derive === 'returnEnthalpy') return returnEnthalpy(state);
      return state ? state[key] : undefined;
    },

    /* BACnet identity for a point on a unit — prefers v1.3's POINT_CATALOG. */
    bacnetFor: function (unitId, key) {
      var u = UNITS[unitId] || {};
      var m = META[key] || {};
      var cat = m.catalog && m.catalog[unitId];
      var rec = null;
      if (cat && window.POINT_CATALOG && window.POINT_CATALOG.length) {
        for (var k = 0; k < window.POINT_CATALOG.length; k++) {
          if (window.POINT_CATALOG[k].id === cat) { rec = window.POINT_CATALOG[k]; break; }
        }
      }
      if (rec) {
        return {
          name: rec.id,
          addr: rec.address,
          type: { AI: 'BACnet Analog Input', AO: 'BACnet Analog Output', AV: 'BACnet Analog Value',
                  BO: 'BACnet Binary Output', BI: 'BACnet Binary Input', MSV: 'BACnet Multi-State Value'
                }[rec.type] || rec.type,
          catalogKey: cat,
          record: rec,
          history: (rec.module && rec.module.data) || null,
        };
      }
      var t = { ai: 'AI', ao: 'AO', sp: 'AV', bi: 'BI', bo: 'BO', enum: 'MSV' }[m.kind || 'ai'];
      var n = 0;
      for (var i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) >>> 0;
      return {
        name: (u.bacPrefix || 'AHU') + (m.bac || key),
        addr: t + (100 + (n % 400)) + '@' + (u.dev || 'DEV54'),
        type: { AI: 'BACnet Analog Input', AO: 'BACnet Analog Output', AV: 'BACnet Analog Value',
                BO: 'BACnet Binary Output', BI: 'BACnet Binary Input', MSV: 'BACnet Multi-State Value' }[t],
        catalogKey: null,
        record: null,
        history: null,
      };
    },
  };
})();
