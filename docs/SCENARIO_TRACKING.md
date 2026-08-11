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

### 12. No VFD-in-bypass alarm (item #7)
- **Source:** SOO page 1, General Automatic Control Sequences #16: "For
  each variable speed motor an alarm shall be annunciated at the BAS
  whenever the drive is placed in bypass." Confirmed against the original
  SOO scan (`AHU_4_3_4_6_SOO_Page1.png`). The AHU has two variable-speed
  motors per page 2 item 4 ("variable speed supply fan and a variable
  speed return fan"), so this is two points, not one.
- **Bug:** No bypass field existed on controller state at all for either
  drive — nothing to alarm on.
- **Fix:** Added `supplyFanVFDBypass` / `returnFanVFDBypass` (plain
  operator-settable booleans, same as `fireAlarmShutdown` — bypass is a
  technician action at the physical drive, not something the control
  sequence derives from environmental conditions). Added fault rules
  M-05/M-06 to `AHU46FaultEngine.js`, unconditional on fan-running status
  per the SOO's plain wording. Tied a minimal behavioral consequence to
  the supply fan bypass: in bypass the VFD is out of the control loop, so
  the motor runs across-the-line at full/uncontrolled speed (100%) instead
  of tracking `fanSpeedSetpoint` — makes the fault meaningful rather than
  a flag nobody reacts to. No equivalent tie-in for the return fan since
  it has no independent speed model at all (open item #10). New sidebar
  "Fan VFD Status" section (NormToggleRow, matching the Fire Alarm
  section's style) and M-05/M-06 banners in both overlay files.
- **Verified:** 5 new controller regression tests (default-off, forced
  full speed overriding the setpoint, restoration when bypass clears, no
  effect while the fan is off, return-fan bypass not touching supply
  speed) and 6 new fault-engine tests (both quiet, each fires
  independently, both fire together, fires regardless of fan-running
  status, clears on recovery) in the new `AHU46FaultEngine.test.mjs`
  describe block. Also manually verified end-to-end in the running app
  (toggled `supplyFanVFDBypass` live): M-05 banner appeared, sidebar
  status flipped to ACTIVE, Supply CFM jumped to 9,200; cleared correctly
  on toggle-off. `output.css` regenerated via the Tailwind CLI to include
  the new banners' spacing utilities (`mt-24`/`mt-30`) — picked up some
  other previously-missing utility classes already used elsewhere in the
  codebase as a side effect of a full rebuild; purely additive, no
  removals.

### 13. No staged fan-start sequence (items #8 / #25e)
- **Source:** SOO page 3, System Run #1-2: fans commanded to start
  simultaneously (90s to prove status or abort with an alarm); SF VFD
  starts after a 90-second hardwired damper-travel delay, then ramps to
  setpoint over 2 minutes; the interlocked RF starts after its own
  30-second hardwired delay once SF proves status, then ramps over 2 more
  minutes. Page 3 top also describes a 2-minute hold at speed polling the
  connected VAV boxes before the mixed air dampers are released to normal
  minimum-flow control. 90+120+30+120+120 = 480 seconds total. Confirmed
  against the original SOO scan (`AHU_4_3_4_6_SOO_Page3.png`).
- **Bug:** A start command snapped straight to fully running — no damper
  travel, no fan ramp, no RF lag, no VAV-poll hold. `systemStarting` and
  `startingTimeLeft` existed on state but were never driven (item #25e).
- **Design choice (flagged to the user before building — see chat):**
  this is a real wall-clock sequence (`Date.now()`-based), not tied to the
  app's compressed TMY3 weather clock — the only place in this file that
  depends on elapsed time rather than being a pure function of current
  inputs. `startingTimeSetpoint` default changed from 120 SEC (an
  unexplained screenshot artifact that didn't match any SOO timing) to
  480 SEC, matching the SOO's literal stage sum; adjusting it scales every
  stage proportionally (General Automatic Control Sequences #9: "all
  control setpoints and variables shall be fully adjustable").
- **Fix:** Detects a rising edge on the run command (`runSchedule` on AND
  no fire-alarm shutdown) and, instead of snapping to running, walks
  through the staged sequence: OA damper ramps 0→floor during the 90s
  delay (SF/RF both off) → SF ramps from `minPositionFanSpeedLock` (a
  previously-declared-but-unused field, now meaningfully reused as the
  ramp's starting speed) up to `fanSpeedSetpoint` over 2 minutes (damper
  held at floor) → RF flips ON after its 30s delay → both hold at speed
  through the VAV-poll window. No economizer/CO₂ DCV authority at any
  point during staging — the SOO holds the mixed air damper at minimum
  through the whole sequence. A fire-alarm trip or `runSchedule=false` at
  any point aborts immediately (life-safety overrides win — General
  Automatic Control Sequences #4) and the next start begins fresh, not
  resumed. `systemStarting` converted from a manual sidebar toggle to a
  read-only derived status (like `economizerActive`) since it's no longer
  meaningful as an operator input.
- **Investigated during live-app testing:** an off→on cycle showed the
  M-02 CO₂ alarm firing during stage 1 and initially looked like a new
  bug caused by staging. Traced it through and confirmed it isn't one —
  `co2Sensor` (item #25a) already correctly shows the design-occupied
  ceiling the moment the fan is genuinely off (a real "unventilated"
  reading), and stage 1's brief fan-off delay just carries that
  already-elevated value forward rather than manufacturing a new one; it
  self-corrects once stage 2 restores ventilation. No code change needed
  — documented with a regression test instead so this doesn't get
  mistaken for a bug again later.
- **Verified:** 10 new regression tests using `vi.useFakeTimers()` to
  advance through the sequence without waiting real minutes — default
  (already running, no staging on boot), rising-edge trigger, each stage's
  values (damper travel fraction, SF ramp midpoint, RF coming on, both
  holding at speed), economizer/CO₂ DCV locked out throughout, clean
  hand-off at `startingTimeSetpoint`, mid-sequence abort-and-fresh-restart,
  proportional scaling when the setpoint is adjusted, M-04 never
  spuriously firing during the ramp, and the CO₂-during-staging
  investigation above. Rewrote the one existing test whose assumption the
  new behavior legitimately invalidates (fire-alarm clear was previously
  instant; it now correctly re-triggers the full staged sequence — same
  "update the test with the correct expected value, don't just edit the
  assertion" standard as prior batches). Also manually verified end-to-end
  in the running app via the browser console against the live controller
  instance: triggered a real restart, watched `systemStarting`/
  `startingTimeLeft`/damper/interlock update correctly in the sidebar in
  real time.

---

## Open — static values audit (found while investigating item #5 above)

A full sweep of every state field in `AHU46Controller.js` for fields that
are *never* reassigned anywhere in `recalculate()` (i.e., permanently
frozen after initialization) turned up more candidates beyond the three
just fixed. Per the BMS Figure Rules doc, operator setpoints (white boxes)
are correctly static until a human changes them — the items below are all
things labeled as live sensor/plant readings that currently never move on
their own.

All items in this table are now fixed.

(Items 25a–25d — `co2Sensor`, `supplyStaticPressure`/`supplyAirRH`,
`chwSupplyTemp`, `cwSupplyTemp` — fixed; see Fixed items 7-9 above. Item
25e — `systemStarting`/`startingTimeLeft` — fixed as part of item #8; see
Fixed item 13 below.)

---

## Open — control logic gaps (`AHU46Controller.js`)

| # | Scenario | Source | Notes |
|---|---|---|---|
| 9 | No duct static-pressure control loop | SOO Closed Loop Controller #5 | `fanSpeedSetpoint` is a raw operator number, zero automatic modulation from any pressure feedback |
| 10 | No return-fan flow-tracking control | SOO Closed Loop Controller #6 | Return fan has no independent speed/CFM logic; should track 90% of supply flow |
| 11 | Only 2 of 3 mixing-box dampers modeled | SOO Item 11a, Points List DA-2/DA-3 | Return Air damper and Spill Air damper aren't separately represented |
| 12 | Return air conditions incomplete | Points List AFMS-2, THS-4 (humidity) | No return CFM or return humidity fields; `returnAirTemp` is a hardcoded constant |
| 13 | No RH-driven automatic cooling-setpoint reset | SOO Item 6 ("Automatic" mode) | Model only has the manual mode |

(Item 8 — no staged fan-start sequence — fixed; see Fixed item 13 below.)

(Items 5 and 6 — economizer hysteresis, plenum reset — fixed; see Fixed
items 10-11 above. Item 7 — VFD-in-bypass alarm — fixed; see Fixed item 12
below.)

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
