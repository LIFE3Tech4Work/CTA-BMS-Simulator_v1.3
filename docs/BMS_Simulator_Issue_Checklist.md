# BMS Simulator — Issue Checklist
*Compiled from all Lev / Katherine / Omar working sessions (mid-July – Aug 15, 2026), plus the July 27 data-audit chat.*

*This copy lives in the repo (`docs/BMS_Simulator_Issue_Checklist.md`) and is updated in the same commit/push as the fix whenever a checklist item is closed out, so it stays the source of truth for what's actually done vs. still open.*

Legend: ✅ Resolved/confirmed · ⚠️ Partially resolved / needs re-check · ⬜ Open / unresolved

---

## A. Point Values & Data Behavior

- [x] ✅ **Fan/schedule shutdown behaves correctly** — turning the run schedule off correctly shows fans off, no airflow (confirmed by Lev).
- [x] ✅ **VFD speed ↔ CFM correlation confirmed** — Lev confirmed it's a direct/linear relationship (faster fan = more CFM), can be built into the formula.
- [x] ✅ **CO2 sensor "lag" after restart is realistic, not a bug** — Lev confirmed real CO2 sensors are slow-acting; the value holding steady after a restart is expected behavior.
- [ ] ⬜ **Can't turn a unit back ON after shutting it off** — flagged directly as a bug ("that's a problem") — needs fix. *Still open: AHU-4-6's freeze/hard-safety shutdown is a genuine one-way latch by design (real freezestats require a manual reset), but there's no clear on-screen indication of that when it's the reason a toggle "does nothing" — needs a UX fix (surface "LOCKED — RESET REQUIRED"), not a logic change. Not touched in the 2026-08-15 pass.*
- [x] ✅ **Interlock indicator shows "on" (red) even after unit is confirmed off** — **Fixed 2026-08-15.** AHU-4-4's `interlockOn`/`exhaustFanOn`/`commonDamperOpen` were set once at init and never reassigned; now tied to `fanRunning` every tick, matching AHU-4-6's existing correct behavior. AHU-23-1 has no interlock indicator at all (not applicable).
- [x] ✅ **CFM doesn't zero out when unit is off** — **Confirmed already correct, 2026-08-15.** All three controllers already zero `cfm` unconditionally when off, and it's safety-protected from stale overrides. No code change was needed; verified live in-browser.
- [x] ✅ **Manual override doesn't actually change the value** — e.g., setting outdoor air damper to 25% turns the box purple (correctly indicating override) but the displayed number doesn't update. Explicitly logged as a bug. — **Fixed 2026-08-15** on all three units: AHU-4-6's staged-start ramp was unconditionally stomping the OA damper override for the whole startup sequence; AHU-4-4 had a stale key-name bug that broke its safety-override bookkeeping; AHU-23-1 had no manual-mode guard on the OA damper at all. Verified live via direct controller calls in the browser.
- [x] ✅ **Dampers marked "read only" that should be editable** — return/outdoor/exhaust dampers should all be adjustable; some are locked. — **Fixed 2026-08-15.** The sidebar's "Calculated Outputs · Read-Only" section header was stale/misleading — the rows underneath (`ReadOnlyRow`) were already fully editable in code. Relabeled to "Calculated Outputs" on AHU-4-6 and AHU-4-4. (AHU-23-1 doesn't model return/exhaust/spill dampers as separate points at all — nothing to relabel there.)
- [x] ✅ **Outdoor air damper and return air damper are bound together** — changing one changes the other; Lev asked for them to be fully independent/separate controls. — **Fixed 2026-08-15** on AHU-4-6 and AHU-4-4: return-air/spill damper values now hold independently once manually overridden instead of being recomputed from the OA damper every tick. (AHU-23-1 has no separate RA/spill damper points, so this doesn't apply there.)
- [x] ✅ **Inconsistent min/max validation** — same value (e.g., VFD %) can't be set below 45 in one place but *can* be changed in another location for the same point. — **Fixed 2026-08-15.** AHU-4-6 already clamped steady-state fan speed to the "Min Fan Speed Lockout" setpoint; AHU-4-4 and AHU-23-1 only honored it during a startup ramp they don't actually implement, making it a no-op at steady state. Now clamped consistently on all three.
- [x] ✅ **Duplicate/superimposed values on the same point** — the original raster-image problem (two numbers shown for one point) is largely being solved by the SVG/React rebuild, but as of the most recent working session (day before launch) duplicate values were still showing on some AHU screens — needs a final pass to confirm it's fully gone everywhere, not just on the pilot AHU (4-6). — **Confirmed resolved, 2026-08-15.** Verified `SymmetreBoard.jsx` (pure vector artwork, no PNG) is the actual live renderer for AHU-4-6, AHU-4-4, and AHU-23-1 — the older PNG-overlay components are dead/unreachable code. Screenshotted all three AHU screens; no duplicate values found on any of them.
- [x] ✅ **CO2 high-limit setpoint (900 ppm) confirmed as *should* be editable** — Lev confirmed conceptually, but Katherine noted the actual editability still needs to be implemented. — **Confirmed already implemented, 2026-08-15.** Editable on the board chip and in all three sidebars via the existing `EditableRow`/click-to-edit pattern. No code change needed.
- [ ] ⬜ **Supply-side relative humidity mostly missing** — only Return RH exists; Supply RH (which depends on outdoor air condition / dehumidification logic) hasn't been added.
- [ ] ⬜ **Dew point calculation not yet implemented** — Lev explained the calculation (from OAT + humidity, sensible/latent heat, enthalpy) but it isn't built into the simulator yet.
- [ ] ⬜ **Exhaust vs. return damper ambiguity** — unclear whether they're the same physical damper or two different ones; Lev himself wasn't sure and needs to check.
- [ ] ⬜ **"Interlock on common damper open" label** — meaning/behavior still unclear, flagged as needing investigation.
- [ ] ⬜ **Economizer signal shows inconsistently in two different places on screen** — same signal appears "on" in one spot and "off" in another during a live test.
- [ ] ⬜ **Freeze alarm/heating coil labeling unclear** — whether "Freeze" should label the heating coil box wasn't definitively resolved; Lev explained the underlying freeze-protection logic (OAT < 35°F trips heating, shuts down cooling) but UI labeling wasn't confirmed fixed.
- [ ] ⬜ **CSV export data doesn't look correct** — when tested live, Lev said the exported values (e.g., economizer signal) didn't make sense as displayed.
- [ ] ⬜ **Trend/History chart not rendering meaningful data** — blank/unclear output when tested, possibly an interval-setting issue.
- [ ] ⬜ **Data/sensor connections not fully "wired up"** — some values aren't yet driven by the underlying logic/sensor chain (Omar flagged needing to "make that connection").
- [ ] ⬜ **AHU 4-3 inclusion is unconfirmed** — appeared in Katherine's rebuilt output referencing reference docs, but Omar couldn't verify it exists in Lev's actual sequence-of-operations materials. Needs to be confirmed with Lev.
- [ ] ⬜ **AHU-4-4 alarm logic doesn't match displayed state** — e.g., a "running while schedule is off" alarm fires even though the schedule shows as on; even Lev was confused by this when shown live.
- [ ] ⬜ **AHU-4-4 has far more alarms than other units** — full alarm set for this unit still needs review; Omar confirmed there are "a lot more" alarms than what currently displays.

## B. Alarms & Acknowledgment

- [x] ✅ **Bulk/multi-select "acknowledge all" feature may contradict real BMS behavior.** Lev explicitly confirmed the real system requires acknowledging *every* alarm individually — there's no one-click "acknowledge all," specifically so lazy engineers can't skip past active alarms. Katherine had built a multi-select/select-all acknowledge feature into the simulator, and AHU-4-4's sidebar separately had a one-click "ALARM RESET" button that bulk-acknowledged every active alarm with no security check at all. — **Reconciled 2026-08-15: removed both.** Decision made (pending final confirmation from Lev if he wants a different call): match real BMS exactly, no bulk-ack path anywhere. Alarm Summary's multi-select checkboxes and the sidebar's "ALARM RESET" button, plus the underlying `acknowledgeAll()` methods on both fault engines, were all deleted. Acknowledging now always targets exactly one alarm at a time.
- [x] ✅ **Some alarms can't be acknowledged at all** — bug identified in the most recent pre-launch test session; root cause not yet found. — **Fixed 2026-08-15.** Root cause: the acknowledge handler only updated local state for alarms with `lifecycle === 'active'`, so the two preloaded demo alarms that seed as `lifecycle: 'inactive'` (F-03, F-05 — both cleared-but-unacknowledged, a normal real-BMS state) could be ticked and "acknowledged" with no visible effect, forever. Now any unacknowledged alarm — active or already cleared — can be acknowledged; only "already acknowledged" blocks it. Verified live: both F-03 and F-05 now acknowledge correctly.
- [x] ✅ **Alarm color logic clarified** — blinking = unacknowledged, solid = acknowledged-but-still-active — confirmed by Lev and matches real BMS.
- [x] ✅ **What triggers alarms clarified** — CO2/RH exceeding setpoints, or any manual override, generates an alarm (informational, confirmed).
- [ ] ⬜ **Alarms should map to real, teachable fault scenarios** — ongoing work item: pull concrete scenarios (unoccupied override, missed economizer, simultaneous heat/cool) directly from Lev's lecture transcripts rather than inventing generic alarms.

## C. Weather / TMY Data

- [ ] ⬜ **Manual outdoor air temperature & humidity control** — Lev's most-repeated request across multiple sessions (first raised early on, still open as of the last transcript before launch). He wants to simulate arbitrary conditions (winter, summer, rainy/dry) rather than being locked to the live TMY schedule.
- [ ] ⬜ **Ability to pause/snapshot the TMY simulation** — related ask, to freeze on a specific condition for a teaching moment instead of it continuously running.
- [ ] ⬜ **Simulating "past weeks" of custom weather** — Lev wanted to be able to fabricate a synthetic 2-week history (e.g., winter vs. summer) for trend-analysis tasks, since he doesn't have live building access for the next 1–2 weeks to pull real data.
- [ ] ⬜ **Return Fan Tracking formula never validated against real data** — blocked because Lev doesn't currently have BMS site access.
- [x] ✅ **Confirmed distinction: TMY (simulated/typical) vs AMY (actual/real) data** — clarified and correctly used; real BMS export files were confirmed to be AMY, not TMY (per the July 27 data-audit session).

## D. Graphics, UI & Branding

- [x] ✅ **Legacy "Unknown — Air Handling Unit Schematic" fallback screen reachable in the live app** — *not from the original transcripts; reported live 2026-08-15 by a user who landed on it via the EBI point-detail breadcrumb.* Any hash segment that didn't exactly match a known unit ID (a stale id, a query string like `?bg=slate` stuck onto the segment, or the literal "Unknown" the breadcrumb falls back to when a point's metadata lookup misses) fell through every specific dispatch branch in App.jsx and landed on the old generic AHUGraphic/ControlsSidebar screen from before the SymmetreBoard rebuild. **Fixed 2026-08-15.** `parseRoute()` now normalizes any unrecognized ahuId to AHU-4-4, so that screen can no longer be reached; the EBI breadcrumb's subsystem link is also no longer clickable when metadata is missing. Verified live in the browser.
- [x] ✅ **Branding/IP separation from Honeywell EBI / Tech Systems' proprietary look** — Lev's company leadership explicitly asked that the simulator not resemble their real product (different background color, icons, and naming — not "EBI"). Katherine has implemented a background-color change and a more "minimalistic" look distinct from the screenshots Lev has been showing. *(Final sign-off from Lev on the updated look wasn't confirmed in the transcripts — worth a quick check.)*
- [x] ✅ **Old/duplicate values embedded directly in raster PNG images fixed at the architecture level** — decision made to fully retire the PNG-based graphics and rebuild each AHU screen as a React SVG component with values driven by state, instead of trying to erase/patch screenshots.
- [ ] ⬜ **Inconsistent damper graphics** — Katherine noticed the same physical damper type rendered as 2–3 visually different icons; Lev confirmed it's the same equipment, just a designer inconsistency — not yet standardized.
- [ ] ⬜ **VAV box graphic** — Lev shared a proper generic VAV box graphic to replace the current abstract rectangle/triangle representation; not yet implemented (VAV work overall is intentionally deferred to a later phase, after AHUs are solid).
- [ ] ⬜ **No visual indication when the economizer turns on/off** — flagged early on as a "missing feature" causing confusion; not confirmed fixed.
- [ ] ⬜ **On/off toggle hotspot not clickable** in the main merged app (present and working in Katherine's separate local build, not yet merged in).
- [ ] ⬜ **New Start/Shutdown toggle UI** (replacing the old "Interlock On/Interlock Off" language with simple On/Off) — built by Katherine locally, not yet pushed/merged into the main GitHub repo.

## E. Point Descriptions, Modals & Access Levels

- [ ] ⬜ **Click-to-open description/modal for each point** — exists in Katherine's standalone HTML build, but not yet present in the main merged simulator across all points/tabs.
- [x] ✅ **Point-type distinction clarified (set point vs. real sensor value vs. control command)** — Lev walked through this in detail: white boxes = editable setpoints, dark/gray = real sensor values, AO (analog output) = control command, AI (analog input) = feedback. This logic is understood and documented — needs to be visually reflected consistently across the UI (indicator system itself not fully implemented).
- [ ] ⬜ **Visual indicator for what colors/box styles mean** (editable vs. read-only vs. sensor) — requested by Katherine as a legend/UI treatment, not yet confirmed built.
- [x] ✅ **Purple = manually overridden** clarified and appears to be implemented and tested live (box turns purple correctly when overridden).
- [ ] ⬜ **Units dropdown should be locked to "%"** — Lev said BMS only ever uses percentage, no other unit should be selectable; minor cleanup, not confirmed done.
- [ ] ⬜ **Engineer-only tabs (Command Priorities, Settings, Alarms detail) need a backend decision** — Lev said these aren't needed for student view, but Omar flagged that any preset values living only in Lev's head still need to be captured and built into the backend logic, or the simulation won't behave correctly even if hidden from students. Not fully resolved — action item was for Lev to list out his preset values, not confirmed received.
- [x] ✅ **History/Trends tab confirmed important for students** — Lev agreed this should stay visible (shows how a unit has actually been run over time, e.g., catching a fan running 100% overnight for no reason).
- [ ] ⬜ **Instructor vs. Student view separation** — acknowledged as needed, not yet built (currently the same view for both).

## F. Real-World Data Validation (from BMS exports audit)

- [x] ✅ **Simultaneous heating/cooling fault validated against real data** — real AHU-4-6 exports showed both CHW and preheat valves open on 100% of readings, confirming the scenario Lev described is a live, ongoing issue (not just hypothetical).
- [x] ✅ **Stuck VFD scenario validated** — real data showed AHU-4-6 fan stuck at exactly 35.0 Hz on 65% of readings, matching the case Lev described in his lecture.
- [x] ✅ **Economizer-eligible hours vs. actual behavior validated** — 82% of spring readings were economizer-eligible, but AHU-4-6 ran both coils anyway, compounding the waste finding above.
- [ ] ⬜ **AHU-4-4 calibration mismatch** — real return air temp is 62°F (not the assumed 72°F) and real fan speed is 38% (not 75%) — this reference correction needs to be reflected in the simulator's baseline values.
- [x] ✅ **Bad/duplicate/empty export files identified and removed** from the working data set (one exact duplicate, one malformed file, one empty file, one subset file).

## G. Dev Workflow / Architecture

- [x] ✅ **Decision to standardize on Claude (not Base44) for continued development** — explicitly tested by asking Claude itself, which advised staying rather than switching tools mid-project.
- [x] ✅ **Legacy features/menu items (e.g., log observation) reconciled** between Katherine's and Omar's parallel codebases during a merge session.
- [x] ✅ **As-built / sequence-of-operations reference documents received from Lev** and used as the source of truth for point behavior rules.
- [ ] ⬜ **Proper Git branching workflow** — still not fully in place; the team has been working with separate folders/repos (v1.2, v1.3) rather than true branches, which has caused confusion and at least one instance of pushing the wrong (HTML-heavy instead of JS-heavy) codebase. Local `git checkout` steps got a session unstuck once, but the underlying workflow gap hasn't been resolved.
- [ ] ⬜ **"QA/QC help queue" for Lev** — planned feature letting Lev review the simulator offline and auto-generate a fix prompt for Claude; discussed as a next step, not confirmed built.
- [ ] ⬜ **Puppeteer-based systematic screenshot/requirements documentation** — in progress, not confirmed complete for all screens.

## H. Deferred / Future Scope (not bugs — explicitly parked)

- [ ] VAV screens/units — intentionally deferred until AHU units are solid.
- [ ] LL97 (carbon penalty) exercise tie-in to the simulator — new feature idea raised by Omar, not yet built.
- [ ] Interactive Q&A "learning companion" mode (ask-a-question style, beyond simple guided navigation) — proposed by Katherine, not yet built.
- [ ] Legacy "Capstone chapters" left over from the original Kiro build — undecided whether to keep, replace, or remove.

---

### Bottom line
**2026-08-15 update:** Section A's point/data-behavior bugs are now mostly closed — 8 of the 13 originally-open items in that section are fixed or confirmed already resolved (interlock indicator, CFM zeroing, manual overrides, damper editability/coupling, VFD min/max consistency, duplicate values, CO2 setpoint editability), committed and pushed to `origin/main`. Still open in Section A: the "can't turn a unit back on" UX gap around AHU-4-6's safety-latch reset, supply-side RH, dew point calc, and everything requiring Lev's direct input (exhaust/return damper identity, interlock/common-damper label meaning, economizer signal display, freeze/heating-coil labeling, CSV export correctness, Trend/History rendering, AHU-4-3 inclusion, AHU-4-4 alarm logic/count).

Section B's alarm-acknowledgment conflict is also now closed — both bulk-ack paths removed (Alarm Summary's multi-select and AHU-4-4's "ALARM RESET" bypass) to match Lev's one-at-a-time rule exactly, and the "some alarms can't be acknowledged" bug is fixed. Still open in Section B: mapping alarms to real teachable fault scenarios from Lev's lecture transcripts.

Remaining big open buckets: (1) manual weather control — Lev's most repeated ask, still not built; (2) finishing the modal/description pop-ups and instructor/student view split (Section E).
