/**
 * AHU43Controller.js — AHU-4-3 (Conference Rooms 2nd Level, Level 4)
 *
 * AHU-4-3 and AHU-4-4 are the paired mixing-box units in the SOO ("AHU-4-3 /
 * RF-4-6: Sequence of Operation"); the board's own artwork labels the common
 * outside-air damper "AHU-4-3 & 4-4 ONLY". They therefore run the SAME sequence
 * of operation, which is why this unit is a second instance of that model rather
 * than a new one — same code path, separate state, so commanding one unit never
 * moves the other.
 *
 * No AHU-4-3 point export exists yet (Lev's 3-month BMS export covers 4-4, 4-6
 * and 23-1 only), so the seed values below are AHU-4-4's with the airflow figures
 * scaled to this unit's smaller conference room-half service area. Replace them with the
 * real export when it lands — nothing else has to change.
 *
 * No import/export — exposes window.AHU43Controller
 */
(function () {
  'use strict';
  if (!window.CTA_createAHU44Controller) {
    console.warn('[AHU43Controller] AHU44NewController.js must load first.');
    return;
  }
  window.AHU43Controller = window.CTA_createAHU44Controller({
    minOAAirflowSetpoint: 4200,
    co2Sensor: 512,
    fanSpeedSetpoint: 35,
  });
})();
