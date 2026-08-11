# AHU-4-6 Scenario Tracking Log

Tracks every scenario found by cross-referencing `AHU46Controller.js` /
`AHU46FaultEngine.js` against the source documents: the "AHU-4-3 / RF-4-6:
Sequence of Operation" PDF, the AHU-4-6 Points List, the BMS Slide Companion
(Parts 1-3, Lev Chesnov), and the BMS Figure Rules document.

Update this file in the same commit as each fix, moving items from **Open**
to **Fixed** with the commit hash and a short verification summary.

---

## Fixed

### 1. Heating/cooling coil valve mutual exclusivity
- **Source:** SOO General Automatic Control Sequences #10 — "the heating
  coil control valve shall be closed whenever cooling coil is activated and
  vice versa."
- **Bug:** Both valves could open simultaneously on cold days (preheat
  warming OAT toward setpoint, cooling independently trimming the resulting
  mixed-air blend against the return-air temperature).
- **Fix:** Cooling logic now defers whenever the preheat valve is active.
- **Verified:** Full -10°F to 100°F sweep, zero cases of both valves open;
  4 new regression tests.

### 2. M-01 fault false-positive during legitimate heating priority
- **Source:** Direct consequence of fix #1 above.
- **Bug:** M-01 ("supply air exceeds cooling setpoint") fired whenever
  supply air sat above the cooling setpoint, without accounting for the
  case where cooling was correctly deferring to heating — caused the alarm
  banner to flicker on/off as OAT drifted near the threshold.
- **Fix:** M-01 now excludes the case where `phtValvePosition > 0`.
- **Verified:** 3 constructed-state test cases (SOO-compliant/no-fault,
  genuine-fault/fires, normal-operation/no-fault).

### 3. Bootstrap timeout too short, silently kills the simulation clock
- **Source:** Found while diagnosing "controls not responsive" report.
- **Bug:** In-browser Babel transpiles ~40 files before the app mounts;
  the bootstrap retry loop gave up after only 6 seconds, permanently
  leaving `window.SimulationEngine` unstarted with no clear indication why.
- **Fix:** Widened retry window to 40 seconds; warning message now points
  at the likely cause and suggests a hard refresh.

### 4. Freeze protection pump auto start/stop
- **Source:** SOO General Automatic Control Sequences #5 — "started
  automatically upon outside air temperature falling below 35°F
  (adjustable)... stopped automatically upon outside air temperature
  rising above 40°F (adjustable)."
- **Bug:** `freezePumpOn` was a static `true` default, never tied to OAT.
- **Fix:** Added hysteresis logic (35°F start / 40°F stop, holds last
  state in the deadband), independent of fan/run-schedule status.
- **Verified:** Full cool-down/warm-up cycle including both-direction
  deadband-holding and fan-independence; 5 new regression tests.

### 5. Fan interlock chain (interlockOn / exhaustFanOn / commonDamperOpen)
- **Source:** SOO General Automatic Control Sequences #2 ("safety devices
  shall be hardwired interlocked with 'hand' and 'automatic' positions in
  series with motor controller holding coil circuit") and System Start #1
  ("when the supply fan is started its interlocked return fan shall also
  start"). Found while investigating a broader report of static values on
  AHU-4-6 that shouldn't be, per the BMS Figure Rules document's AI/setpoint
  taxonomy.
- **Bug:** All three fields were hardcoded `true` at initialization and
  never reassigned anywhere in `recalculate()` — they'd stay reported as
  on/open even through a shutdown or a fire-alarm trip.
- **Fix:** All three now track `state.fanRunning` live.
- **Note:** the SOO's mixing-box flow diagram labels the "common damper"
  point as applying only to AHU-4-3/AHU-4-4 — unclear whether AHU-4-6 has
  a true equivalent point at all. Kept simple (tied to fan status like the
  other two) pending clarification rather than guessing at different logic.
- **Verified:** 4 new regression tests — fan running, unit off, fire-alarm
  shutdown (overrides runSchedule=On), and recovery back to normal.

### 6. M-04 / OA damper floor: 60% didn't match the SOO (item #14)
- **Source:** SOO "AHU-4-3 / RF-4-6: Sequence of Operation" min/max CFM
  table — AHU-4-6's setpoints are 4,500/9,000 CFM = exactly 50%, not 60%.
  Provenance of the previous 60% value was unconfirmed.
- **Bug:** `OA_DAMPER_FLOOR`, `economizerMinPosition`'s default, and M-04's
  fault threshold in `AHU46FaultEngine.js` were all hardcoded to 60%,
  contradicting both the SOO table and the existing `minOAAirflowSetpoint`
  (already correctly 4,500 CFM).
- **Fix:** All three changed to 50%. Also updated the M-04 warning text in
  `AHU46VectorOverlay.jsx` / `AHU46ImageOverlay.jsx` and the sidebar
  comment in `AHU46ControlsSidebar.jsx`, which both asserted "60%" as the
  threshold in plain text.
- **Verified:** Reviewed every existing test asserting the old 60% value
  (design-constant, "60% OA damper minimum", and "Manual oaDamperPosition
  (M-04 fault)" describe blocks in `AHU46Controller.test.mjs`) — updated
  each to the correct 50%-based expected value rather than blindly editing
  assertions; added a boundary test (50% vs 49%) and a new
  `AHU46FaultEngine.test.mjs` covering the M-04 threshold directly
  (boundary at exactly 50%, just-below at 49%, confirms 55% — inside the
  *old* 60% threshold's territory — correctly no longer fires, fan-off
  guard, and alarm clearing on recovery). 7 new fault-engine tests + 1 new
  controller test.

### 7. co2Sensor frozen forever, never simulated (item #25a)
- **Source:** Found during the static-values audit below. `co2Sensor` is
  declared as a live sensor and used as an input to the CO2 DCV override,
  but was never reassigned anywhere in `recalculate()`.
- **Bug:** Stuck permanently at its screenshot value (479 ppm) regardless
  of the AHU's own ventilation rate.
- **Fix:** Tied to ventilation the same way every other reading in this
  file is computed — instantaneously from current state, no time-
  integrated occupancy model. Falls toward a 450 ppm outdoor baseline as OA
  delivery approaches/exceeds the design minimum; rises toward a 1,200 ppm
  design-occupied ceiling as OA delivery is starved (low damper, or fan
  off). Still respects Manual override via the Controls Sidebar's
  "Controlling CO₂ Sensor" row, same pattern as `oaDamperPosition`.
- **Verified:** 5 new regression tests — default (full ventilation →
  outdoor baseline), fan-off (→ ceiling), manually-forced-low damper
  (proportional rise, ties to the M-04 scenario), a midpoint ventilation
  ratio, and Manual-override persistence across an unrelated recalculate.

### 8. supplyStaticPressure mislabeled and frozen (item #25b)
- **Source:** Found during the static-values audit below; the mislabel
  itself (it's always been supply-air %RH, never static pressure) was
  already documented in code comments prior to this fix.
- **Bug:** Field name `supplyStaticPressure` didn't match what it actually
  held (%RH), and — independent of the naming issue — it was never
  reassigned in `recalculate()`, frozen at 72.3 forever.
- **Decision:** Renamed to `supplyAirRH` rather than leaving the misleading
  name in place, since the UI already labeled it "Supply Air %RH" / id
  `supplyAirRH` everywhere it's displayed — the state key was the only
  place still carrying the old name, and the blast radius was small (two
  overlay files).
- **Fix:** Renamed the state field in `AHU46Controller.js` and updated the
  `stateKey` references in `AHU46VectorOverlay.jsx` and
  `AHU46ImageOverlay.jsx`. Made it dynamic: ties to whichever coil is
  actively conditioning the air — an open cooling coil pushes it toward
  saturation (90%, condensing moisture off a wet coil), an open heating
  coil dries it toward 25%, idle holds a neutral 55% baseline.
- **Verified:** 5 new regression tests — old key confirmed gone, neutral
  baseline with both coils idle, near-saturation at fully-open cooling,
  dried-out at active heating, and a partial-open case confirming the
  value scales proportionally rather than snapping between two fixed
  states.

### 9. chwSupplyTemp / cwSupplyTemp frozen plant readings (items #25c/#25d)
- **Source:** Found during the static-values audit below; per Lev's
  training material these are exactly the bottom-status-bar "global
  condition" readings that should reflect real plant load/weather.
- **Bug:** Both frozen at their original screenshot values (41.9°F / 77.7°F)
  forever, regardless of outdoor conditions.
- **Fix:** Simple weather/load-based reset tied to `oaTemperature` (already
  TMY3-driven), not a full plant model. `chwSupplyTemp` resets colder
  (40°F floor) as OAT rises and warmer (48°F ceiling) as it falls, standing
  in for load-based CHW reset. `cwSupplyTemp` follows OAT with a fixed
  approach offset, clamped to a 65–85°F plant range, standing in for a
  cooling tower's behavior. Both formulas were tuned to land almost exactly
  on the original screenshot values at the default 81.6°F OAT — good
  independent confirmation the constants are reasonably calibrated, not
  just directionally plausible.
- **Verified:** 6 new regression tests — default-OAT sanity check against
  the original screenshot values, both fields' clamps at extreme cold/hot
  OAT, and a monotonic sweep (0–100°F) confirming CHW falls / CW rises as
  OAT rises with no reversals.

### 10. Economizer enable/disable was a pure manual toggle (item #5)
- **Source:** SOO "AHU-4-3 / RF-4-6: Sequence of Operation", page 4,
  Closed Loop Controller #2 item 4d-e (AUTO mode of the WINTER-SUMMER-AUTO
  enthalpy switch): "IF [Enthalpy@THS-x < (Enthalpy@THS-4 MINUS 5.0
  BTU/Lb)] AND [Outside Air Temperature > 38°F] THEN Allow fresh air flow
  setpoint to be above minimum" (enable), and "IF [Enthalpy@THS-x >
  (Enthalpy@THS-4 MINUS 2.5 BTU/Lb)] OR [Outside Air Temperature < 35°F]
  THEN Minimum fresh air flow setpoint" (disable). Confirmed against the
  original SOO scan (`AHU_4_3_4_6_SOO_Page4.png`), not just the earlier
  paraphrase in this doc.
- **Bug:** `enthalpyOKForEconomizer` was a static sidebar toggle a human
  had to flip by hand — never computed from actual OA/RA enthalpy or OAT.
- **Fix:** Added `RETURN_AIR_ENTHALPY` (26.7 BTU/lb — approximated from the
  SOO's own Closed Loop Controller #4 item 1, which holds return air RH at
  50% at the design 72.1°F return air temp) as a reference, and implemented
  the compound enable/disable hysteresis exactly as specified: enable
  requires both the enthalpy margin AND OAT > 38°F; disable fires on
  either the enthalpy margin closing OR OAT < 35°F. Between thresholds,
  holds last commanded state — same asymmetric hysteresis-deadband pattern
  as the freeze pump (item #4 above), which prevents chattering as
  conditions drift near a boundary. Still Manual-overridable via the
  existing "Enthalpy OK — Economizer" sidebar toggle.
- **Verified:** Reviewed every existing test that used
  `setValue('enthalpyOKForEconomizer', true)` to force economizer
  scenarios — all still pass unmodified, since Manual override always
  takes precedence over the new auto-hysteresis. Added 9 new regression
  tests: default-disabled sanity, enable (both conditions met), stays
  disabled (enthalpy favorable but OAT floor not cleared), disable via OAT
  alone, disable via enthalpy alone, two deadband-hold sequences on the
  enthalpy axis (becoming favorable / becoming unfavorable), one
  deadband-hold sequence on the OAT axis, and Manual-override persistence.
  Full suite confirmed no other AHU46 test's behavior changed as a side
  effect (traced through why each `loadWithWeather(...)` call in existing
  tests either already set enthalpyOKForEconomizer manually, or happened
  to land outside the new hysteresis's enable zone).

### 11. Minimum plenum temperature was static, not OAT-reset (item #6)
- **Source:** SOO page 3, Closed Loop Controller #1 item 2: "The Minimum
  Plenum Temperature control setpoint shall be reset based off of the
  following schedule: OaTemp=60°F → MinPlenumtemp=40°F; OaTemp=40°F →
  MinPlenumtemp=50°F," and "The Minimum Plenum loop shall be active at all
  times." Confirmed against the original SOO scan
  (`AHU_4_3_4_6_SOO_Page3.png`).
- **Bug:** `plenumMinSetpoint` was a static 40.0°F regardless of OAT.
- **Fix:** Linear reset between the two calibration points (60°F OAT →
  40°F floor, 40°F OAT → 50°F floor), clamped outside that OAT range per
  General Automatic Control Sequences #6 ("the output of the reset
  schedules should be limited between maximum and minimum values"). Runs
  independent of fan status, matching the SOO's "active at all times" and
  the freeze pump's precedent. Still Manual-overridable via the sidebar's
  "Active Minimum Setpoint" row.
- **Verified:** 8 new regression tests — default (design OAT above the
  60°F point → 40°F), both exact calibration points, the linear midpoint
  (45°F at 50°F OAT), both clamped extremes, Manual-override persistence,
  and a monotonic sweep (80°F down to 20°F) confirming the floor never
  drops as OAT falls.

---

## Open — static values audit (found while investigating item #5 above)

A full sweep of every state field in `AHU46Controller.js` for fields that
are *never* reassigned anywhere in `recalculate()` (i.e., permanently
frozen after initialization) turned up more candidates beyond the three
just fixed. Per the BMS Figure Rules doc, operator setpoints (white boxes)
are correctly static until a human changes them — the items below are all
things labeled as live sensor/plant readings that currently never move on
their own.

| # | Field | Declared value | Why it's a problem |
|---|---|---|---|
| 25e | `systemStarting`, `startingTimeLeft` | `false` / `0` | These should drive a startup countdown — direct evidence of the missing staged fan-start sequence (overlaps with open item #8). |

(Items 25a–25d — `co2Sensor`, `supplyStaticPressure`/`supplyAirRH`,
`chwSupplyTemp`, `cwSupplyTemp` — fixed; see Fixed items 7-9 above.)

---

## Open — control logic gaps (`AHU46Controller.js`)

| # | Scenario | Source | Notes |
|---|---|---|---|
| 7 | No VFD-in-bypass alarm | SOO General #16, Points List item 33 | Field doesn't exist on controller state at all |
| 8 | No staged fan-start sequence | SOO System Start #1-2 | Currently instant on/off; real sequence is 90s damper delay → 2-min SF ramp → RF follows with 30s delay + 2-min ramp → 2-min VAV poll hold |
| 9 | No duct static-pressure control loop | SOO Closed Loop Controller #5 | `fanSpeedSetpoint` is a raw operator number, zero automatic modulation from any pressure feedback |
| 10 | No return-fan flow-tracking control | SOO Closed Loop Controller #6 | Return fan has no independent speed/CFM logic; should track 90% of supply flow |
| 11 | Only 2 of 3 mixing-box dampers modeled | SOO Item 11a, Points List DA-2/DA-3 | Return Air damper and Spill Air damper aren't separately represented |
| 12 | Return air conditions incomplete | Points List AFMS-2, THS-4 (humidity) | No return CFM or return humidity fields; `returnAirTemp` is a hardcoded constant |
| 13 | No RH-driven automatic cooling-setpoint reset | SOO Item 6 ("Automatic" mode) | Model only has the manual mode |

(Items 5 and 6 — economizer hysteresis, plenum reset — fixed; see Fixed
items 10-11 above.)

## Open — fault engine gaps (`AHU46FaultEngine.js`)

| # | Scenario | Source | Notes |
|---|---|---|---|
| 15 | M-03 has no direct SOO citation | — | Reasonable pattern (economizer + mechanical cooling together) but not sourced from a specific SOO clause |
| 16 | "Manual override itself creates an alarm" not modeled | Lev Chesnov, BMS training session (07-31-26) | Stated rule: forcing any point to Manual should itself be alarm-worthy, independent of value |

(Item 14 — M-04's threshold — fixed; see Fixed item 6 above.)

## Open — architecture/duplication

| # | Scenario | Notes |
|---|---|---|
| 17 | Legacy `FaultEngine.js` F-01 is a stale AHU-4-6 twin of M-01 | Driven by static `PointRegistry` historical playback (`AHU04_06CHWCoilValve.js` / `AHU04_06PHTCoil01Valve.js`, 1,017 canned hourly values each), completely disconnected from the live `AHU46Controller.js`. Still active in the global Alarms tab regardless of live state. |
| 18 | Companion Mode slide 29 promises an overlay that can't appear on AHU-4-6 | `SimultaneousHeatCool.jsx` is explicitly excluded for `ahuId === 'AHU-4-6'` in `App.jsx`, but the slide script and its linked scenario data still reference it |
| 19 | Same disconnected-legacy pattern confirmed for AHU-4-4 | `FaultEngine.js` F-02/F-03/F-04/F-06 are all `DEV4004`-scoped; `AHU44NewFaultEngine.js`'s own header comment already documents this exact problem |
| 20 | F-05 depends on a cooling tower point with no live counterpart | `BI801@DEV6000` — no live controller, no nav route/screen anywhere in the app, canned-off for virtually the entire historical dataset |

## Open — safety/interlock layer (not modeled at all)

| # | Scenario | Source |
|---|---|---|
| 21 | DPS-1 through DPS-5 pressure-switch safeties (dirty filter, 2x high-suction, 2x high-static) | SOO Safeties items 1-6, Points List items 24-28 |
| 22 | Freezestat shutdown sequence (fan interlock, forced 100% heating valve, critical alarm, 3-min nuisance delay, manual reset) | SOO Safeties item 4 |
| 23 | Supply/Return Fan VFD fault + bypass + damper-request points | Points List items 32-39 |
| 24 | Manual reset / software lockout points | Points List items 31, 44 |

---

## Cross-checked repo2 (`CTA-BMS-Simulator_v1.2`) — for reference

`AHU-4-6 Simulator.dc.html`'s own inline `step()` function has the **same
category of bug** as items 1 and 4 above, implemented completely
independently (its own PI-style valve solver, no shared code with
`AHU46Controller.js`):
- Heating/cooling valves computed with no mutual-exclusivity guard
  (lines ~920-923).
- `freeze_pump` is a plain manual toggle (`{kind:'bo', options:['Off','On']}`),
  no OAT-based auto logic found anywhere in the file.

Not fixed as part of this tracking log (different codebase/architecture) —
noted here in case repo2 is revisited later.
