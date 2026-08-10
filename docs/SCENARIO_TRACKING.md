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

---

## Open — control logic gaps (`AHU46Controller.js`)

| # | Scenario | Source | Notes |
|---|---|---|---|
| 5 | Economizer enable/disable is a pure manual toggle | SOO Item 4c-e | Real logic needs asymmetric enthalpy hysteresis (enable RA-5.0 BTU/lb, disable RA-2.5 BTU/lb) plus OAT floor/ceiling (enable >38°F, disable <35°F) |
| 6 | Minimum plenum temp is static 40°F, not OAT-reset | SOO Item 2 | Schedule: 60°F OAT→40°F floor, 40°F OAT→50°F floor (linear reset) |
| 7 | No VFD-in-bypass alarm | SOO General #16, Points List item 33 | Field doesn't exist on controller state at all |
| 8 | No staged fan-start sequence | SOO System Start #1-2 | Currently instant on/off; real sequence is 90s damper delay → 2-min SF ramp → RF follows with 30s delay + 2-min ramp → 2-min VAV poll hold |
| 9 | No duct static-pressure control loop | SOO Closed Loop Controller #5 | `fanSpeedSetpoint` is a raw operator number, zero automatic modulation from any pressure feedback |
| 10 | No return-fan flow-tracking control | SOO Closed Loop Controller #6 | Return fan has no independent speed/CFM logic; should track 90% of supply flow |
| 11 | Only 2 of 3 mixing-box dampers modeled | SOO Item 11a, Points List DA-2/DA-3 | Return Air damper and Spill Air damper aren't separately represented |
| 12 | Return air conditions incomplete | Points List AFMS-2, THS-4 (humidity) | No return CFM or return humidity fields; `returnAirTemp` is a hardcoded constant |
| 13 | No RH-driven automatic cooling-setpoint reset | SOO Item 6 ("Automatic" mode) | Model only has the manual mode |

## Open — fault engine gaps (`AHU46FaultEngine.js`)

| # | Scenario | Source | Notes |
|---|---|---|---|
| 14 | M-04's 60% threshold doesn't match SOO's own CFM ratio | SOO min/max CFM table | 4,500/9,000 CFM = 50%, not 60%; provenance of 60% unconfirmed |
| 15 | M-03 has no direct SOO citation | — | Reasonable pattern (economizer + mechanical cooling together) but not sourced from a specific SOO clause |
| 16 | "Manual override itself creates an alarm" not modeled | Lev Chesnov, BMS training session (07-31-26) | Stated rule: forcing any point to Manual should itself be alarm-worthy, independent of value |

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
