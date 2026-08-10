# CTA BMS Simulator — v1.1

Browser-based Building Management System training simulator for Climate Tech Academy, replicating a Honeywell SymmetrE R410.2 / EBI R700 operator workstation. Used in Session 5 (Building Systems, Efficiency & Operations) and the WBL capstone project.

This repo is a fixed fork of [`LIFE3Tech4Work/CTA-BMS-Simulator`](https://github.com/LIFE3Tech4Work/CTA-BMS-Simulator), built originally with AWS Kiro. v1.1 closes a set of defects found during a manual code audit — most notably, **the simulation clock was never actually connected to live point values**, and **every one of the 15 training scenarios silently failed to apply its fault conditions** due to a BACnet address-naming mismatch between the scenario data and the point registry.

## What changed in v1.1

| File | What was wrong | What changed |
|---|---|---|
| `src/App.jsx` | `SimulationEngine.onTick` was never connected to `PointRegistry.interpolate()` or `FaultEngine.evaluate()`. The clock advanced visibly, but no point value ever progressed through the dataset during normal playback, and faults never fired automatically. | Added a tick-driver `useEffect` that wires the engine clock to point interpolation, fault evaluation, and React state in one place. |
| `src/data/reference/scenarios.js` | Every scenario's `pointOverrides` used a legacy address format (e.g. `AO_OAD_44@DEV4004`) that didn't exist in the real point catalog (`AO104@DEV4004`). `PointRegistry.setValue()` silently no-ops on an unknown address, so **all 15 scenarios were non-functional** — loading one moved the simulation clock to the right row but never staged the actual fault condition. | All addresses corrected to match `POINT_CATALOG`. Scenario 8 (Cooling Tower Fault) also had a type mismatch — it set an analog speed value on what is actually a binary run-status point — corrected and re-described to match real data. |
| `src/simulation/FaultEngine.js` | Same address mismatch as above, plus three of the six fault rules (F-02, F-03, F-05) referenced points that don't exist anywhere in the data model (a phantom setpoint point, a phantom fan-status point, a phantom economizer-enable point) — these rules could never fire under any circumstances. | Addresses corrected. F-02, F-03, and F-05 redesigned to evaluate against real, available points (SAT design band, fan-speed + RunSchedule, cooling-tower status + OAT + OA damper). |
| `src/data/reference/faultRules.js` | A second, parallel definition of fault rules F-01–F-06 existed in this file with yet another address scheme and different conditions under the same IDs as `FaultEngine.js`. It was never imported anywhere — fully dead code, but a source of confusion since it implies a different (wrong) behavior than what's live. | Left in place but marked clearly as unused dead code, pending a decision to delete or consolidate. |
| `src/modes/ModeController.js` | `'freeExplore'` was missing from both `VALID_MODES` and `LAYOUT_CONFIGS` — one of the three core teaching modes was not a recognized mode string, and would have silently fallen back to Companion Mode's 70/30 layout. | Added `freeExplore` to both, with the 100%/0% layout used consistently elsewhere in the project documentation. |
| `src/simulation/FaultEngine.test.mjs` | Tests exercised the file in isolation using its own (wrong) made-up addresses, so they passed despite the file being disconnected from the real point catalog. This is *why* the bug shipped undetected. | Rewritten to use real catalog addresses and the redesigned rule conditions. |
| `src/simulation/ScenarioPointRegistry.integration.test.mjs` *(new)* | No test existed that connected `scenarios.js`, `FaultEngine.js`, and the real `PointRegistry`/`POINT_CATALOG` together. | New integration test suite — loads the real scenario data and real point catalog together and asserts every override actually lands. Verified to catch the original bug by deliberately reintroducing it and confirming the test fails with a precise error. |

**Test suite: 251/251 passing** (up from 222/245 in the original, after also fixing the `ModeController` defect found along the way).

## Verification

```bash
npm install
npm test
```

If `npm install` fails on puppeteer trying to download Chrome (a devDependency used only by the screenshot scripts, not the running app):

```bash
PUPPETEER_SKIP_DOWNLOAD=true npm install
npm test
```

## Running locally

```bash
npm start
```

Then open `http://localhost:3000` (or whatever port `server.js` / `Procfile` configures). Default credentials: `cta_instructor` / `cta_student`, password `bms2026`.

To confirm the fix is working: open Free Explore mode and load any scenario. Point values on the AHU graphic should now visibly change as the clock advances, and the alarm count in the toolbar should update live as fault conditions are met.

## What hasn't been verified yet

- Scenario `startRow` values have not been cross-checked against the original BMS export data to confirm the historical row actually contains the fault pattern each scenario claims (e.g., confirming row 300 is genuinely a simultaneous heat/cool event in the source data, not just a row number chosen without verification).
- The redesigned F-02 (SAT design band), F-03 (fan + schedule), and F-05 (cooling tower + economizer) conditions are engineering judgment calls made to get the rules functioning against real available points — not yet checked against Honeywell SymmetrE/EBI specification documents or HVAC controls reference material.
- `src/data/reference/faultRules.js` dead code has not been deleted, pending confirmation nothing else depends on it.

## Architecture notes

No bundler — all modules load via `<script>` tags and attach to `window`, or via Babel standalone JSX transform. This is a deliberate simplicity tradeoff so the app can run from a single `index.html` with zero build step, which matters for classroom reliability. See `PLATFORM_REQUIREMENTS.md` and `INSTRUCTOR_GUIDE.md` for full platform and curriculum documentation.
