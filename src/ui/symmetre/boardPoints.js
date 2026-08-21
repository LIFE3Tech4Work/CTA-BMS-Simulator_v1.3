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
    fanHeatRise:     { label: 'Fan Heat Gain', unit: '°F', kind: 'ai', dec: 1, min: 0, max: 5, bac: 'FanHeatGain' },
    returnAirRH:     { label: 'Return Air Humidity', unit: '%RH', kind: 'ai', dec: 1, min: 0, max: 100,
                       catalog: { 'AHU-4-6': 'AHU04_06RAHumid' }, bac: 'RAHumid' },
    supplyAirRH:     { label: 'Supply Air Humidity', unit: '%RH', kind: 'ai', dec: 1, min: 0, max: 100, bac: 'SAHumid' },
    supplyStaticPressure: { label: 'Supply Air %RH', unit: '%RH', kind: 'ai', dec: 1, min: 0, max: 100, bac: 'SAHumid' },
    co2Sensor:       { label: 'Return Air CO₂', unit: 'PPM', kind: 'ai', dec: 0, min: 0, max: 2000,
                       catalog: { 'AHU-4-6': 'AHU04_06RACO2', 'AHU-4-4': 'AHU04_04RACO2' }, bac: 'RACO2' },
    cfm:             { label: 'Supply Air Flow', unit: 'CFM', kind: 'ai', dec: 0, min: 0, max: 14000, bac: 'SAFlow' },

    // ── Season / active-setpoint readouts (14 Aug review) ────────────────────
    activeSetpoint:  { label: 'Active Supply Air Setpoint', unit: '°F', kind: 'ai', dec: 1, min: 45, max: 80, bac: 'ActiveSASP' },
    activeSeason:    { label: 'Active Control Season', unit: '', kind: 'ai', dec: 0, bac: 'Season' },
    oaResetEnabled:  { label: 'OA Reset Schedule', unit: '', kind: 'bo', dec: 0, bac: 'OAReset' },
    heatingResetTarget: { label: 'Heating Reset Target', unit: '°F', kind: 'ai', dec: 1, min: 40, max: 90, bac: 'HeatResetTgt' },
    controlMode:     { label: 'Control Mode', unit: '', kind: 'ao', dec: 0, bac: 'CtrlMode' },
    zoneTempSetpoint: { label: 'Zone Temperature Setpoint', unit: '°F', kind: 'sp', dec: 1, min: 60, max: 85, step: 0.5, bac: 'ZoneSP' },
    zoneSetpointControl: { label: 'Zone Setpoint Control', unit: '', kind: 'bo', dec: 0, bac: 'ZoneSPCtrl' },

    // ── VAV terminal box (VAVController state keys) ──────────────────────────
    airflowCFM:      { label: 'Primary Airflow', unit: 'CFM', kind: 'ai', dec: 0, min: 0, max: 1200, bac: 'PriAirflow' },
    damperPosition:  { label: 'Damper Position', unit: '%', kind: 'ao', dec: 0, min: 0, max: 100, step: 5, bac: 'Damper' },
    spaceTemp:       { label: 'Zone Temperature', unit: '°F', kind: 'ai', dec: 1, min: 50, max: 95, bac: 'ZoneTemp' },
    reheatValvePosition: { label: 'Reheat Valve', unit: '%', kind: 'ao', dec: 0, min: 0, max: 100, step: 5, bac: 'ReheatValve' },
    leavingAirTemp:  { label: 'Leaving Air Temperature', unit: '°F', kind: 'ai', dec: 1, min: 40, max: 120, bac: 'LAT' },
    dischargeAirTemp: { label: 'Primary Air From AHU', unit: '°F', kind: 'ai', dec: 1, min: 40, max: 120, bac: 'DAT' },
    reheatValveStatus: { label: 'Reheat Valve Status', unit: '', kind: 'bi', dec: 0, bac: 'ReheatSts' },
    spaceTempCoolingSetpoint: { label: 'Zone Cooling Setpoint', unit: '°F', kind: 'sp', dec: 1, min: 65, max: 85, step: 0.5, bac: 'ZoneClgSP' },
    spaceTempHeatingSetpoint: { label: 'Zone Heating Setpoint', unit: '°F', kind: 'sp', dec: 1, min: 60, max: 80, step: 0.5, bac: 'ZoneHtgSP' },
    // Outdoor conditions. These have no board chip of their own — they live in the
    // header's OA strip — but alarms reference them, so they need metadata or their
    // Value column renders a bare unitless number.
    oaTemperature:   { label: 'Outside Air Temperature', unit: '°F', kind: 'ai', dec: 1, min: -20, max: 120, bac: 'OATemp' },
    oaRelHumidity:   { label: 'Outside Air Humidity', unit: '%RH', kind: 'ai', dec: 0, min: 0, max: 100, bac: 'OAHumid' },
    oaEnthalpy:      { label: 'Outside Air Enthalpy', unit: 'BTU/lb', kind: 'ai', dec: 1, min: 0, max: 60, bac: 'OAEnthalpy' },
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
    dischargeDamperPct: { label: 'Discharge Damper', unit: '%', kind: 'bo', dec: 0, min: 0, max: 100, bac: 'DADamper' },
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
        ['spaceTemp',         'pill', 1297, 184, null, 'right', 13],
        ['zoneTempSetpoint',  'pill', 1297, 159, null, 'right', 13],
        ['supplyAirRH',       'pill', 1145, 506, null, 'left', 12.5],
        ['dischargeAirTemp',  'pill', 1145, 532, null, 'left', 12.5],
        ['oaTemperature',     'pill', 148,  508, null, 'right', 13],
        ['oaCFM',             'pill', 220,  530, null, 'right', 13],
        ['returnFanCFM',      'pill', 892,  220, null, 'left', 13],
        ['cfm',               'pill', 892,  528, null, 'left', 13],
        ['mixedAirTemp',      'pill', 481,  530, null, 'right', 13],
        ['supplyAirTemp',     'pill', 849,  530, null, 'right', 13],
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
        // activeSetpoint removed: the uncaptioned white box directly left of the VFD, showing
        // the same 60.0 °F as the captioned Cooling Coil Setpoint two boxes right. The artwork
        // never had a caption for this position — it is the duplicate Omar flagged. The reading
        // still drives the goal checks and stays visible in the left panel.
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
        ['spaceTemp',         'pill', 1297, 184, null, 'right', 13],
        ['zoneTempSetpoint',  'pill', 1297, 159, null, 'right', 13],
        ['supplyStaticPressure', 'pill', 1145, 506, null, 'left', 12.5],
        ['dischargeAirTemp',  'pill', 1145, 532, null, 'left', 12.5],
        ['oaTemperature',     'pill', 148,  508, null, 'right', 13],
        ['oaCFM',             'pill', 220,  530, null, 'right', 13],
        ['returnCFM',         'pill', 892,  220, null, 'left', 13],
        ['cfm',               'pill', 892,  528, null, 'left', 13],
        ['mixedAirTemp',      'pill', 481,  530, null, 'right', 13],
        ['supplyAirTemp',     'pill', 849,  530, null, 'right', 13],
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
        // activeSetpoint removed: the uncaptioned white box directly left of the VFD, showing
        // the same 60.0 °F as the captioned Cooling Coil Setpoint two boxes right. The artwork
        // never had a caption for this position — it is the duplicate Omar flagged. The reading
        // still drives the goal checks and stays visible in the left panel.
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

    // AHU-4-3 is AHU-4-4's paired mixing-box unit — same board, same chip set,
    // its own controller instance. No AHU-4-3 fault engine exists, so alarms are
    // left off rather than borrowing AHU-4-4's and mislabelling them.
    'AHU-4-3': {
      ahu: 'AHU-4-3', board: 'MAIN', controller: 'AHU43Controller', faultEngine: null,
      dev: 'DEV4003', bacPrefix: 'AHU04_03',
      art: { showCommon: true },
      chips: [
        ['returnAirTemp',     'pill', 1211, 212, null, 'right', 13],
        ['co2Sensor',         'pill', 1297, 212, null, 'right', 13],
        ['spaceTemp',         'pill', 1297, 184, null, 'right', 13],
        ['zoneTempSetpoint',  'pill', 1297, 159, null, 'right', 13],
        ['supplyStaticPressure', 'pill', 1145, 506, null, 'left', 12.5],
        ['dischargeAirTemp',  'pill', 1145, 532, null, 'left', 12.5],
        ['oaTemperature',     'pill', 148,  508, null, 'right', 13],
        ['oaCFM',             'pill', 220,  530, null, 'right', 13],
        ['returnCFM',         'pill', 892,  220, null, 'left', 13],
        ['cfm',               'pill', 892,  528, null, 'left', 13],
        ['mixedAirTemp',      'pill', 481,  530, null, 'right', 13],
        ['supplyAirTemp',     'pill', 849,  530, null, 'right', 13],
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
        // activeSetpoint removed: the uncaptioned white box directly left of the VFD, showing
        // the same 60.0 °F as the captioned Cooling Coil Setpoint two boxes right. The artwork
        // never had a caption for this position — it is the duplicate Omar flagged. The reading
        // still drives the goal checks and stays visible in the left panel.
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
      // This unit's drawing is a single small air-handler, so it only occupied
      // x 250–1581, y 266–718 of the 1613×878 stage and read much smaller than
      // AHU-4-6 / 4-4. Scaling the whole overlay — artwork, chips, fan block and
      // pills together — keeps every coordinate in sync while enlarging the unit
      // and widening the gaps between device groups. The origin sits on the
      // header block's top-right corner so the unit title stays put and the
      // drawing grows down and to the left, into the empty space.
      // The artwork zooms via its viewBox (225 120 1367 744); the overlay rides the
      // same mapping so chips, the fan block and pill stacks stay registered to
      // the drawing and grow with it. screen = (art - v) * s.
      artView: { vx: 225, vy: 120, s: 1.18 },
      chips: [
        ['preheatTemp',   'pill', 528,  380, null, 'left', 13],
        ['supplyAirTemp', 'pill', 738,  380, null, 'left', 13],
        ['cfm',           'pill', 882,  388, null, 'left', 15],
        ['fanSpeed',      'pill', 1095, 487, null, 'left', 13],
        ['phtValveStatus','pill', 526,  634, null, 'left', 12],
        ['chwValveStatus','pill', 693,  634, null, 'left', 12],
        ['phtValvePosition', 'box', 540, 494, 34],
        ['chwValvePosition', 'box', 700, 494, 34],
        ['plenumMinSetpoint', 'box', 766, 494, 46],
        ['coolingCoilSetpoint', 'box', 766, 540, 46],
        // fanSpeedSetpoint removed from this board: this unit drives measured speed
        // directly from it, so both chips always showed the same number and looked like
        // a rendering fault. The setpoint remains editable in the left panel.
        //
        // Zone temperature above its setpoint on the right edge, stacked the way
        // VAV-4-4-02 shows the same pair. Lev asked for these on this unit, and asked
        // specifically for NO CO2 here: the boiler room's air-quality hazard is carbon
        // MONOXIDE, so a CO2 reading would point at the wrong thing.
        //
        // Centred on the TS cube's own centre line (x=1513) so each reading sits over the
        // sensor it reports, matching VAV-4-4-02.
        //
        // The setpoint pair stands alone above the container — nothing measures a setpoint.
        // The measured temperature's pill sits INSIDE the container, above the TS cube that
        // reads it, which is the pairing that makes the sensor and its value read as one
        // thing rather than two.
        ['zoneTempSetpoint',  'pill', 1513, 364, null, 'center', 13],
        ['spaceTemp',         'pill', 1513, 448, null, 'center', 13],
      ],
      fans: [
        { key: 'fanRunning', cmdKey: 'runSchedule', interlockKey: null, x: 878, y: 528, pills: 'u23', pillY: 282 },
      ],
      freeze: null,
    },

    // Terminal box downstream of AHU-4-6. The controller is VAVController's
    // single-zone facade for this zone, so the board's getState()/setValue()
    // calls need no special casing. No fan block and no fault engine: a VAV box
    // has neither in this model.
    'VAV-02-03': {
      ahu: 'VAV-02-03', board: 'VAV', controller: 'VAV0203Controller', faultEngine: null,
      dev: 'DEV0203', bacPrefix: 'VAV02_03',
      // Cooling-only box: no reheat coil, so that group drops out of the artwork.
      art: {
        vavTag: 'VAV-02-03',
        vavService: 'Meeting Room 214 \u00b7 Zone 3',
        vavLocation: 'Level 2 East',
        vavBoxLabel: 'VAV-02-03 \u00b7 10\u201d INLET \u00b7 1,200 CFM MAX',
        vavReheat: false,
      },
      chips: [
        ['airflowCFM',     'pill', 379, 300, null, 'left', 16],
        ['damperPosition', 'pill', 588, 300, null, 'left', 16],
        // Zone pills nudged down 12px: they sat 2px above their container's top
        // edge, and the larger type adds height that would overhang further.
        ['spaceTemp',      'pill', 1322, 404, null, 'left', 15],
        ['co2Sensor',      'pill', 1442, 404, null, 'left', 15],
        ['spaceTempCoolingSetpoint', 'pill', 1322, 310, null, 'left', 14],
        ['spaceTempHeatingSetpoint', 'pill', 1442, 310, null, 'left', 14],
      ],
      fans: [],
    },

    // Ballroom box downstream of AHU-4-4. This one HAS a hot-water reheat coil —
    // the model has always carried reheatValvePosition / reheatValveStatus /
    // leavingAirTemp for it, but the old legacy graphic showed none of it, so the
    // reheat sequence was invisible. Same board as VAV-02-03 with the reheat group
    // switched on.
    'VAV-4-4-02': {
      ahu: 'VAV-4-4-02', board: 'VAV', controller: 'VAV4402Controller', faultEngine: null,
      dev: 'DEV4402', bacPrefix: 'VAV04_4002',
      art: {
        vavTag: 'VAV-4-4',
        vavService: 'Ballroom \u00b7 Zone 2',
        vavLocation: 'Level 4 \u00b7 served by AHU-4-4',
        vavBoxLabel: 'VAV-4-4 \u00b7 14\u201d INLET \u00b7 REHEAT',
        vavReheat: true,
      },
      chips: [
        ['airflowCFM',          'pill', 379,  300, null, 'left', 16],
        ['damperPosition',      'pill', 588,  300, null, 'left', 16],
        // Reheat group: what arrives from the AHU, what the coil is doing, and
        // what actually reaches the room.
        ['dischargeAirTemp',    'pill', 800,  300, null, 'left', 16],
        ['reheatValvePosition', 'pill', 896,  300, null, 'center', 16],
        ['leavingAirTemp',      'pill', 1000, 300, null, 'center', 16],
        ['reheatValveStatus',   'pill', 896,  601, null, 'center', 14],
        ['spaceTemp',           'pill', 1322, 404, null, 'left', 16],
        ['co2Sensor',           'pill', 1442, 404, null, 'left', 16],
        ['spaceTempCoolingSetpoint', 'pill', 1322, 310, null, 'left', 14],
        ['spaceTempHeatingSetpoint', 'pill', 1442, 310, null, 'left', 14],
      ],
      fans: [],
    },
  };

  var UNIT_ORDER = ['AHU-4-6', 'AHU-4-4', 'AHU-4-3', 'AHU-23-1', 'VAV-02-03', 'VAV-4-4-02'];

  // A few state keys mean something different on a different unit: a VAV box's
  // co2Sensor is a room sensor, not the AHU's return-air sensor. The key stays the
  // controller's own, and only the operator-facing naming is unit-scoped.
  var UNIT_META = {
    'AHU-4-6':  { dischargeAirTemp: { label: 'Discharge Air (After Fan)', bac: 'DATemp' } },
    'AHU-4-4':  { dischargeAirTemp: { label: 'Discharge Air (After Fan)', bac: 'DATemp' } },
    'AHU-4-3':  { dischargeAirTemp: { label: 'Discharge Air (After Fan)', bac: 'DATemp' } },
    'AHU-23-1': { dischargeAirTemp: { label: 'Discharge Air (After Fan)', bac: 'DATemp' } },
    'VAV-02-03': {
      co2Sensor: { label: 'Zone CO₂', bac: 'ZoneCO2' },
      co2Setpoint: { label: 'Zone CO₂ Setpoint', bac: 'ZoneCO2SP' }
    },
    'VAV-4-4-02': {
      co2Sensor: { label: 'Zone CO₂', bac: 'ZoneCO2' },
      co2Setpoint: { label: 'Zone CO₂ Setpoint', bac: 'ZoneCO2SP' }
    }
  };

  function meta(key, unitId) {
    var base = META[key] || null;
    if (!base) return null;
    var ov = unitId && UNIT_META[unitId] && UNIT_META[unitId][key];
    return ov ? Object.assign({}, base, ov) : base;
  }

  function controllerFor(unitId) {
    var u = UNITS[unitId];
    return (u && window[u.controller]) || null;
  }

  /* Return-air enthalpy, BTU/lb dry air, from the unit's own return temp + RH.
     Uses the shared Psychrometrics helper, the same one the controllers and the
     manual weather control use. */
  function returnEnthalpy(state) {
    var t = state.returnAirTemp;
    var rh = state.returnAirRH;
    if (typeof t !== 'number' || typeof rh !== 'number') return null;
    var psy = (typeof window !== 'undefined') && window.Psychrometrics;
    if (!psy) return null;
    var h = psy.enthalpy(t, rh);
    return isFinite(h) ? h : null;
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
