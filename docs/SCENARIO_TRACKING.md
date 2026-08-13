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

### 14. Duct static pressure loop + return fan flow tracking (items #9, #10)
- **Source:** SOO page 5. Closed Loop Controller #5: "The supply fan
  variable frequency drive's speed shall be modulated to maintain the
  static pressure at a sensor located 2/3 down the main supply duct at an
  adjustable setpoint of 1.0 in w.c." — as zone VAV dampers open for more
  cooling, static pressure drops and the loop speeds the fan up to
  compensate; as they throttle back, pressure rises and the loop slows the
  fan down. Closed Loop Controller #6: the return fan VFD tracks "a flow
  control setpoint that shall be dynamically calculated at 90% (adjustable)
  of the supply fan['s] flow[,] for slightly positive pressurization of the
  areas." Confirmed against the original SOO scan
  (`AHU_4_3_4_6_SOO_Page5.png`).
- **Bug:** `fanSpeedSetpoint` was a raw operator number with zero automatic
  modulation — item #9's exact description. The return fan had no numeric
  speed/CFM field at all, only the `returnFanStatus` ON/OFF text.
- **No zone-level VAV model exists in this file** to drive Controller #5
  directly, so `chwValvePosition` (already modeled, 0-100%) stands in as
  the cooling-demand proxy — the SOO's own worked example for this loop is
  phrased entirely in terms of the cooling call. Modeled with a standard
  fan-affinity relationship (pressure ∝ speed²) plus a load term, solved
  algebraically for the fan speed that hits the setpoint exactly — an
  instantaneous steady-state solve, not an iterative PI loop, consistent
  with the rest of this file. Calibrated (`DUCT_PRESSURE_LOAD_SENSITIVITY`
  / `DUCT_PRESSURE_NOMINAL`) so the default state (chwValvePosition=100%,
  setpoint=1.0 in w.c.) lands on 75% fan speed — the original screenshot's
  `fanSpeedSetpoint` default — an independent sanity check, same
  calibration approach used for the CHW/CW supply temps in items #25c/#25d.
- **Fix:** Added `ductStaticPressureSetpoint` (input, default 1.0 in w.c.)
  and `ductStaticPressure` (output). `fanSpeedSetpoint` becomes a Manual
  override (same pattern as `oaDamperPosition`) rather than being read
  directly; when not overridden, fan speed is solved from the pressure
  loop. VFD bypass (item #7) still forces 100% regardless. Added
  `returnFanFlowTrackingSetpoint` (input, default 90%) and `returnFanCFM`
  (output) for the return fan, with the same VFD-bypass override. Both
  loops read `chwValvePosition`/`cfm` from the state as it stands when
  their step runs, one step ahead of COOLING LOGIC recomputing
  `chwValvePosition` for the current tick — a one-tick lag, same as any
  real control loop only ever acting on its last measurement. Two
  `recalculate()` calls now run at module bootstrap instead of one, so
  this lag doesn't leave the *default* state looking unconverged to any
  caller. Added a live hotspot for the screenshot's baked-in "2.02 IWC"
  (previously documented in `AHU46ImageOverlay.jsx` as "not modeled") and
  a new one for return fan CFM, in both overlay files — positions are
  estimates, not yet hand-calibrated against the actual screenshot/vector
  art, same caveat the vector overlay's other hotspots already carry.
- **Verified:** 14 new regression tests — default convergence, demand-
  driven speed changes (with the one-tick lag exercised deliberately),
  setpoint adjustment, Manual override bypassing the loop, VFD bypass
  interaction, off-state zeroing, both solve-clamp boundaries (floor and
  ceiling), and the return fan's tracking/bypass/staging-interaction
  behavior. Updated one batch-4 test whose "instant 75% on staging
  completion" assumption the new lag legitimately changes (documented
  in-test why, same standard as prior batches). Also manually verified
  end-to-end in the running app: read live state via the browser console
  (fan speed, duct pressure, return fan CFM all matched the formulas
  exactly against real TMY3 weather, not just synthetic test conditions)
  and visually confirmed the new sidebar sections and diagram hotspots.

### 15. Return air/spill dampers + return air conditions (items #11, #12)
- **Source:** SOO page 5, Closed Loop Controller #8 item 11a-b: "The mixed
  air dampers consist of three modulating dampers that shall be together
  controlled to maintain a fresh air intake flow (AFMS-3)... The outside
  air damper (N.C.), return air damper (N.C.) and spill damper (N.O.)
  shall each be wired to their individual BAS analog out control
  signal[;] [t]he outside and spill damper shall gradually open upon a
  demand for additional fresh air as the return damper closes
  accordingly." Confirmed against the original SOO scan
  (`AHU_4_3_4_6_SOO_Page5.png`).
- **Bug:** Only the OA damper was modeled at all. `returnAirTemp` was a
  hardcoded constant despite being a live Points List sensor (THS-4); no
  return CFM or return humidity fields existed.
- **Fix:**
  - Added `returnAirDamperPosition` (= 100 − `oaDamperPosition`, per 11b's
    "closes accordingly") and `spillDamperPosition` (tracks
    `oaDamperPosition` directly, per 11b's "gradually open... as"). Both
    close fully when the fan is off, matching SOO System Off #1's literal
    "return air... spill air dampers will be closed" — not the naive
    complementary value (100 − 0 = 100) that formula would otherwise give.
  - `returnAirTemp` is now modeled as `supplyAirTemp` + a fixed rise from
    internal space heat gains (`ROOM_DELTA_T`, 12.2°F), reading the
    PREVIOUS tick's `supplyAirTemp` — same one-tick-lag pattern as item #9
    (`mixedAirTemp` depends on `returnAirTemp`, which would otherwise
    depend circularly on `mixedAirTemp` within the same tick). Calibrated
    to the screenshot's supply/return pair (59.9°F/72.1°F); the default
    state now lands on 72.2°F, independently confirming the constant is
    well-scaled. Bounded 60–85°F; the low bound is a defensive clamp not
    actually reachable through this model's own heating/cooling formulas,
    the high bound IS reached on deep-cold days as a (correct, if
    initially surprising) consequence of the existing preheat-saturation
    behavior compounding through the new feedback loop — documented in a
    regression test rather than treated as a bug, same as the CO₂/staging
    interaction found in item #8's batch.
  - `returnAirRH` added, held at a flat 50% per the SOO's own citation
    (Closed Loop Controller #4 item 1) that it's actively maintained
    there by a separate, not-otherwise-modeled reset loop — explicitly
    reassigned each tick rather than left untouched, so it doesn't read as
    the same class of bug as the frozen sensors fixed in #25a/#25c/#25d.
  - No new field was added for return CFM — `returnFanCFM` (item #10,
    already shipped) reads directly off the return fan's own inlet flow,
    which is exactly what the Points List's AFMS-2 measures per SOO
    Closed Loop Controller #6's own description.
  - New sidebar rows and diagram hotspots for all of the above, including
    wiring the screenshot's baked-in "59.8%RH" (previously flagged
    alongside "2.02 IWC" as a static reference) to `returnAirRH`.
- **Verified:** 11 new regression tests — damper complementary/tracking
  relationship at the floor, fully-open economizer, a Manual OA override,
  a sum-to-100 sweep across OAT, both dampers closing during fan-off and
  staging stage 1; `returnAirTemp`'s default convergence, its response to
  a milder heating-call day, the (correct) high-side clamp on a deep-cold
  day, and its lag-consistent feed into `mixedAirTemp`; `returnAirRH`
  staying flat across hot and cold scenarios. Also manually verified
  end-to-end in the running app against live TMY3 weather (not just
  synthetic test conditions): read state via the browser console and
  visually confirmed the new sidebar rows and hotspots.
  **⚠ Revised by item #13 below** — `returnAirRH`'s "stays flat" test was
  removed and replaced; it's no longer a flat 50%.

### 16. Automatic RH-driven cooling-setpoint reset (item #13) — also revises item #12's returnAirRH
- **Source:** SOO page 4, Closed Loop Controller #3: the cooling supply
  temp setpoint has "two modes of operation... Automatic — Dehumidification
  shall be optimized by resetting the setpoint for the chilled water coil
  control loop automatically based upon Relative Humidity@THS-4 (Return
  Air)." SOO page 5, Closed Loop Controller #4 items 1-3: "Relative
  Humidity@THS-4 (Return Air) shall be maintained at 50% by reset of...the
  air handler supply temperature[;]" reset bounds are 60°F (dry) / 50°F
  (humid). Confirmed against the original SOO scans
  (`AHU_4_3_4_6_SOO_Page4.png`, `..._Page5.png`).
- **Bug:** The model only ever had the "Manual" mode — `coolingCoilSetpoint`
  was always a plain operator number.
- **Design revision flagged and confirmed with the user before building:**
  item #12's original batch modeled `returnAirRH` as a flat, unmoving 50%,
  reasoning it's "maintained at 50%" per the SOO citation above. But that
  citation describes the *result* of this item's automatic reset loop
  continuously correcting it back toward 50% — a flat value would give the
  reset formula nothing to ever react to, making item #13 technically
  present but permanently inert. Revised `returnAirRH` to a genuine
  disturbance-driven reading: outdoor humidity (newly pulled from TMY3
  weather via a new `oaRelHumidity` field — previously only
  `oaTemperature`/`oaEnthalpy` were extracted from weather, `relHumidity`
  was available all along and unused) pulls it away from 50% in proportion
  to ventilation fraction; the cooling coil's own dehumidification pulls it
  back down. Bounded 30-70% (the SOO gives no RH range for its bounds, so a
  symmetric band around the 50% target was assumed).
- **Fix:** Added `coolingSetpointMode` ('Manual'/'Automatic', SOO's own two
  named modes — modeled as an explicit switch rather than the
  auto-unless-overridden pattern used elsewhere in this file, specifically
  *because* an implicit default would have silently changed
  `coolingCoilSetpoint`'s default value away from 60°F, rippling into every
  other batch's calibration that assumes it — items #9's 75%-fan-speed and
  #12's 72.2°F `returnAirTemp` defaults among them). Defaults to `'Manual'`,
  so nothing changes unless an operator actively switches modes. In
  `'Automatic'`, resets linearly between the SOO's cited 50°F/60°F bounds
  based on `returnAirRH`, read from the PREVIOUS tick (same one-tick-lag
  pattern as items #9/#12 — `mixedAirTemp`/`chwValvePosition` depend on
  `coolingCoilSetpoint`, which would otherwise depend circularly on
  `returnAirRH`, which itself depends on this tick's `chwValvePosition`).
  New "Cooling SP Mode" sidebar toggle and an "OA %RH (Live)" readout.
- **Verified:** 7 new regression tests — default-Manual sanity check
  against every prior batch's calibration, `returnAirRH` responding to
  outdoor humidity independent of cooling-setpoint mode, Manual mode
  staying exactly at the operator value regardless of RH swings, Automatic
  mode resetting colder on humid days / warmer on dry days, both `returnAirRH`
  clamp boundaries (30%/70%, reached with full ventilation and zero
  dehumidification), and Automatic-mode stability across ticks (no
  oscillation — confirmed empirically via a standalone Node script across
  several weather scenarios before writing the tests, given the loop's
  negative-feedback structure isn't formally proven, just observed
  convergent). Removed and replaced item #12's now-invalid "returnAirRH
  stays flat" test. Also manually verified end-to-end in the running app:
  read live state via the browser console, switched Cooling SP Mode to
  Automatic against real TMY3 weather and watched `coolingCoilSetpoint`
  reset in real time, then reverted the app to its Manual/60°F default
  before finishing.

### 17. M-03 citation audit + M-07 Manual-override alarm (items #15, #16)
- **Item #15 — M-03's missing citation, verified rather than just noted:**
  unlike every other fault rule, M-03 (economizer active + mechanical
  cooling still engaged) had no SOO clause behind it. Investigated whether
  it should be removed, re-sourced, or left as-is. Traced through why it's
  actually sound for *this specific controller*: the economizer here is
  binary (SOO Closed Loop Controller #2 — active means the OA damper snaps
  to 100%, not a modulating partial-fresh-air position), so when it's
  active the outdoor air is *by design* supposed to meet the cooling load
  without mechanical assistance — that's the entire point of switching to
  100% OA instead of running the chiller. Confirmed the rule is
  unreachable under the model's own default setpoints (the economizer's
  own enable window, OAT < 58°F, already keeps mixed air below the 60°F
  cooling setpoint whenever it's active without a heating call) and only
  fires under the exact misconfiguration the rule's description already
  names (`economizerTempControlSP` pushed above `coolingCoilSetpoint`) —
  a real operator-error scenario, not a theoretical one. No SOO clause
  exists for this, so rather than inventing one, attributed it to the
  general ASHRAE 90.1 simultaneous-cooling principle already referenced
  elsewhere in this curriculum (`docs/BMS_ALIGNED_REQUIREMENTS.md`), with
  the rule's own description now explicit that this is not
  SOO-sourced. Also closed a real gap found during the audit: M-03 had
  *zero* test coverage anywhere in the suite (only appeared in a rule-ID
  list check).
- **Item #16 — M-07, new rule:** Lev Chesnov, BMS training session
  (07-31-26): "forcing any point to Manual should itself be alarm-worthy,
  independent of value" — a forgotten override can silently mask a real
  fault. Unlike every other rule, this one has no single `sourceField` —
  it's driven by the controller's Manual-override map
  (`AHU46Controller.getModes()`), not the state snapshot, so `evaluate()`
  gained a second, optional `modes` argument (backward compatible —
  existing single-argument callers just never see M-07 fire). Fires when
  *any* key in `modes` is `'Manual'`; the alarm's `value` lists which
  keys, frozen at first-fire same as every other rule's value (not
  continuously updated if the set of manually-overridden points changes
  while the alarm stays active — an existing property of every rule here,
  not a new inconsistency). Wired both overlay files to pass
  `ctrl.getModes()` through to `evaluate()`, and added an amber (medium
  priority, not the red used by every other banner — a Manual override
  isn't necessarily wrong) M-07 banner to both, plus rebuilt `output.css`
  for the new banner's spacing/color utilities.
- **Verified:** 11 new regression tests — 5 for M-03 (silent under
  default setpoints, fires on the misconfiguration scenario, clears
  correctly, doesn't fire on cooling-without-economizer or
  economizer-without-cooling) and 6 for M-07 (no-modes-argument backward
  compatibility, empty modes, single and multiple manually-overridden
  keys, independence from other rules firing simultaneously, clearing
  once every point returns to auto). Confirmed the exact integration path
  both overlay files use (`getState()` + `getModes()` →
  `evaluate(state, modes)`) end-to-end via a standalone Node script after
  the Browser pane became persistently unresponsive mid-batch (repeated
  "navigation denied" across multiple fresh tabs and a preview-server
  restart) — noting this here rather than silently claiming a live-app
  check that didn't actually happen this time.

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

All items in this table are now fixed — see the notes below.

(Item 8 — no staged fan-start sequence — fixed; see Fixed item 13 below.)

(Items 5 and 6 — economizer hysteresis, plenum reset — fixed; see Fixed
items 10-11 above. Item 7 — VFD-in-bypass alarm — fixed; see Fixed item 12
below. Items 9 and 10 — duct static pressure loop, return fan flow
tracking — fixed; see Fixed item 14 below. Items 11 and 12 — return
air/spill dampers, return air conditions — fixed; see Fixed item 15 below.
Item 13 — RH-driven automatic cooling-setpoint reset — fixed; see Fixed
item 16 below.)

## Open — fault engine gaps (`AHU46FaultEngine.js`)

All items in this table are now fixed — see the notes below.

(Item 14 — M-04's threshold — fixed; see Fixed item 6 above. Items 15 and
16 — M-03's citation, Manual-override alarm — fixed; see Fixed item 17
below.)

## Open — architecture/duplication

| # | Scenario | Notes |
|---|---|---|
| 17 | Legacy `FaultEngine.js` F-01 is a stale AHU-4-6 twin of M-01 | Driven by static `PointRegistry` historical playback (`AHU04_06CHWCoilValve.js` / `AHU04_06PHTCoil01Valve.js`, 1,017 canned hourly values each), completely disconnected from the live `AHU46Controller.js`. Still active in the global Alarms tab regardless of live state. |
| 18 | Companion Mode slide 29 promises an overlay that can't appear on AHU-4-6 | `SimultaneousHeatCool.jsx` is explicitly excluded for `ahuId === 'AHU-4-6'` in `App.jsx`, but the slide script and its linked scenario data still reference it |
| 19 | Same disconnected-legacy pattern confirmed for AHU-4-4 | `FaultEngine.js` F-02/F-03/F-04/F-06 are all `DEV4004`-scoped; `AHU44NewFaultEngine.js`'s own header comment already documents this exact problem |
| 20 | F-05 depends on a cooling tower point with no live counterpart | `BI801@DEV6000` — no live controller, no nav route/screen anywhere in the app, canned-off for virtually the entire historical dataset |

## Open — safety/interlock layer (not modeled at all)

All items in this table are now fixed — see Fixed item 18 below.

---

### 18. Safety/interlock layer: DPS safeties, freezestat, VFD fault, reset/lockout (items #21-24)

- **Source:** SOO Safeties items 1-6 (DPS-1 through DPS-5), Safeties item 4
  (freezestat), General Automatic Control Sequences #16 (VFD points),
  Points List items 24-28, 31-39, 44. Confirmed against the original SOO
  scans (`AHU_4_3_4_6_SOO_Page1.png`, `..._Page6.png`).
- **Bug:** None of this layer existed on controller state at all — no
  pressure-switch trips, no freezestat, no VFD fault, no reset/lockout
  points, and no fault rules for any of it.
- **Fix — item #21 (DPS-1 through DPS-5):** `filterDirty` (DPS-1,
  non-critical, alarm-only, no shutdown) plus `dps2Tripped`-`dps5Tripped`
  (each a plain field-condition boolean, same reasoning as
  `supplyFanVFDBypass` — a real pressure-switch trip isn't derivable from
  other simulated state). All four are "the manual reset type" per the
  SOO — latched, contribute to a new unified `hardSafetyShutdown` flag,
  cleared only via `resetPressed`.
- **Fix — item #22 (freezestat):** `freezestatTripped` (instantaneous,
  only meaningful while `fanRunning` — a real element senses cold air
  actually crossing it) drives a 3-minute (adjustable via
  `freezestatDelaySetpoint`) nuisance-delay timer using the same
  wall-clock pattern as the staged-start sequence (item #8). Once the
  delay elapses, `freezestatShutdown` latches: forces the fan off, forces
  the heating coil valve to 100% open (an explicit, SOO-documented
  exception to the mutual-exclusivity fix in item #1 — the coil is being
  flooded to thaw it, not fighting a cooling call), and requires manual
  reset. `FREEZESTAT_TRIP_TEMP` (38°F) is flagged as an assumption — the
  SOO describes the element's location and behavior in detail but gives
  no numeric trip setpoint; 38°F is a standard real-world freezestat
  value, adjustable like every other setpoint in this file.
  **Bug found and fixed during this batch:** the first implementation
  gated the manual-reset guard on `freezestatTripped` itself — but that
  flag always reads `false` once the fan has already shut down (no
  airflow across the element to sense), meaning reset would have always
  succeeded unconditionally the instant it was pressed, regardless of
  actual risk. Fixed by gating the reset guard on outdoor air temperature
  directly instead (`oaTemperature >= FREEZESTAT_TRIP_TEMP`) — the
  practical field signal a technician actually checks, and physically
  correct since a real freezestat element senses coil-area temperature
  independent of airflow.
- **Fix — item #23 remainder (VFD fault + damper-request):**
  `supplyFanVFDFault`/`returnFanVFDFault` (field conditions, contribute to
  `hardSafetyShutdown`) — distinct from the bypass points already shipped
  in item #12/Fixed-12, built alongside rather than duplicating.
  `supplyFanVFDDamperRequest`/`returnFanVFDDamperRequest` tied to
  `systemStarting` (active throughout a staged start, per the SOO's own
  damper-travel-then-ramp sequence) rather than left as decorative,
  always-false fields.
- **Fix — item #24 (reset/lockout):** `resetPressed` (momentary — clears
  every latched trip whose underlying condition has cleared, then
  self-clears within the same tick) wired to the sidebar's existing
  "RESET" button, which was previously a placeholder that did nothing.
  `softwareLockout` (sustained) forces `hardSafetyShutdown` regardless of
  `runSchedule`.
- **Architecture:** added a single derived `hardSafetyShutdown` field (OR
  of fire alarm, freezestat shutdown, all four DPS trips, software
  lockout, and both VFD faults) computed once at the top of
  `recalculate()`, replacing the old direct `fireAlarmShutdown` checks in
  both the staged-start rising-edge detector and the fan-logic block —
  one point of truth instead of repeating the growing condition list in
  two places.
- **Fault engine:** added M-08 (filter dirty, low priority, non-critical)
  through M-13 (software lockout). M-09 and M-12 needed a `getValue()`
  override on the rule object — `evaluate()`'s existing value logic
  (`rule.sourceField ? state[rule.sourceField] : manualKeys(modes)`) was
  written for M-07's Manual-override case and would have silently shown
  the wrong value (currently-Manual keys, unrelated) for any rule with
  `sourceField: null` that isn't M-07. Both now list which specific
  switch/drive is responsible, same pattern as M-07 listing Manual keys.
- **UI:** new sidebar sections (Pressure Switch Safeties, Freezestat,
  Software Lockout, plus two new rows in the existing Fan VFD Status
  section) in `AHU46ControlsSidebar.jsx`; six new fault banners (M-08
  through M-13) in both `AHU46VectorOverlay.jsx` and
  `AHU46ImageOverlay.jsx`, following the established priority-color
  convention (muted gray for M-08's non-critical status, red for
  high/urgent, amber for medium, and a distinct darker-red "🛑" treatment
  for M-11 specifically since the SOO calls it a "critical alarm" — the
  strongest banner on this screen). `output.css` rebuilt via the
  Tailwind CLI for the six new `mt-42` through `mt-72` spacing utilities
  the new banners use — same rebuild step item #12 needed.
- **Verified:** 20 new regression tests in `AHU46Controller.test.mjs`
  (freezestat: instant-trip-vs-delayed-shutdown, forced-heat/fan-off
  once latched, nuisance-delay-resets-if-trip-clears-early,
  reset-refused-while-still-cold, reset-succeeds-once-warm,
  not-evaluated-while-fan-already-off; DPS: filter-dirty-no-shutdown,
  each-of-four-DPS-points-individually via `it.each`,
  reset-clears-all-four-at-once; VFD-fault-supply, VFD-fault-return,
  software-lockout-holds-off, lockout-clear-allows-staged-restart;
  damper-request-active-during-staging, damper-request-false-at-rest) —
  all using `vi.useFakeTimers()` for the wall-clock-dependent freezestat
  tests, same convention as the staged-start tests in item #8. Plus 13
  new tests in `AHU46FaultEngine.test.mjs` for M-08 through M-13
  (including the `getValue()` fix, verified by asserting the exact
  switch/drive names returned, not just that the rule fired) and an
  updated "has N fault rules" sanity test (7 → 13). Found and fixed two
  test-writing mistakes of my own along the way (not code bugs): two
  `getValue()` assertions initially read a stale cached alarm value from
  a prior test in the same file, since `evaluate()`'s `activeAlarms`
  cache is module-level and persists across `it()` blocks — fixed by
  inserting a clearing `evaluate()` call before each assertion that
  expects a different value payload than the test before it, matching
  how the existing M-07 tests already handle this. Full suite: 554
  passed, 36 failed (same pre-existing, unrelated failures confirmed
  throughout this entire tracking log — VAVController/AHU44NewFaultEngine).
  Not yet manually verified end-to-end in the running browser app (unlike
  most other Fixed items above) — recommend a manual pass over the new
  sidebar sections and banners before considering this fully closed.

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
