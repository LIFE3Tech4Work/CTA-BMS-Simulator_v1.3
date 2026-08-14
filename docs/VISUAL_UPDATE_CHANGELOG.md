# v1.3 → SymmetrE visual update — change log

Applied on top of **CTA-BMS-Simulator v1.3**, using the CTA BMS Claude Design
project as the UI/visual reference and the source of the point-detail modal
interactions. v1.3 remains the functional source of truth: no simulation logic,
control sequence, point data, alarm rule, route, or menu structure was replaced.

---

## 1. New files

| File | What it is |
|---|---|
| `src/assets/vector/boardArt.js` | The two SymmetrE vector boards as template strings (1613×878): `MAIN` (shared AHU-4-3 / 4-6 / 4-4 schematic) and `U23` (AHU-23-1). Ported from the design project's artwork sources. Includes a 40-line resolver for `{{hole}}` and `<!--IF:name-->` blocks — no dependencies. |
| `src/ui/symmetre/boardPoints.js` | Chip schema + point metadata. Maps each fixed board coordinate to an **existing v1.3 controller state key**, with labels/units taken from v1.3's own controllers and `*ImageOverlay.jsx` hotspot lists. |
| `src/ui/symmetre/SymmetreBoard.jsx` | The board component: fixed 1613×878 stage scaled to fit, artwork + live value chips + fan command blocks + alarm pill stacks. |
| `src/ui/ebi/PointDialog.jsx` | EBI Point Detail / command dialog — General, Command Priorities, History, Recent Events; thermometer gauge, present value, Auto/Manual, SET. |

## 2. AHU diagrams (AHU-4-6, AHU-4-4, AHU-23-1)

* Replaced the PNG-screenshot backgrounds and percentage-positioned hotspots
  with the vector artwork and fixed-coordinate chips. The old hotspot
  percentages were hand-calibrated against a different PNG layout and no longer
  landed on the right places (documented in `AHU46VectorOverlay.jsx`'s own
  header); fixed coordinates on a fixed stage remove that class of drift.
* Chip vocabulary now matches the reference: dark pill = actual value, white box
  = editable setpoint, grey box = commanded output, magenta + `M` badge =
  manual override, red ring = in alarm.
* Fan blocks render the reference START/SHUTDOWN command block with live
  ON/OFF and interlock state; alarm pill stacks (INTERLOCK TAMPER, FAIL, HI
  SUCTION/PRESSURE, VFD FAULT, FREEZE) light from each unit's existing
  fault-engine/controller state.
* Airflow dashes and fan wheels animate while the unit is running.
* Every chip resolves to a real v1.3 point. Slots on the artwork with no
  corresponding v1.3 point were left empty rather than filled with a stand-in
  (e.g. AHU-4-6 has no return-fan Hz point, AHU-4-4 has no duct-static point).
* The old overlays (`AHU44NewImageOverlay`, `AHU46ImageOverlay`,
  `AHU46VectorOverlay`, `AHUImageOverlay`) are **still present and still load** —
  `App.jsx` prefers `SymmetreBoard` and falls back to them if it is unavailable.
  VAV-4-4-02 continues to use `VAVGraphic` unchanged.

## 3. Diagram modals

Clicking any numeric value, text field, or fan block on a diagram opens the
point-detail modal for that point:

* **General** — attributes read from v1.3's `POINT_CATALOG` where the point
  exists there (real BACnet address, units, range, COV increment, sensor
  offset, subsystem); otherwise from `boardPoints.js` metadata.
* **Command Priorities** — BACnet 16-level priority array, with priority 8
  (Manual Operator) highlighted while an override is active.
* **History** — plots the catalog's **recorded hourly data** when the point has
  it (e.g. `AHU04_06SATemp`, 1017 samples); for controller-only points it plots
  a deterministic series seeded from the live value. Period/Interval selectors,
  drag-to-inspect cursor, EXPORT CSV.
* **Recent Events** — value-change and mode-transition entries logged by the
  board when an operator commands a point.
* **SET / AUTO / MANUAL** — writes through the unit's own
  `controller.setValue()` / `clearMode()`.

**Which points are commandable** follows v1.3's control logic rather than
guessing: only keys the controllers actually honour on a Manual override are
offered as commandable. `oaDamperPosition` and the setpoints are; the coil
valves, fan speed and fan status are recomputed on every `recalculate()` tick,
so they are presented as read-only outputs. The fan block's START/SHUTDOWN
toggle commands `runSchedule` — the operator input that actually starts and
stops a unit in v1.3.

## 4. Main simulator UI — styling only

* **Header** (`ui/symmetre/AppChrome.jsx`) — reference station title bar, menu
  bar and toolbar. Same six menu items, same dropdowns, same routes, same
  toolbar actions. The alarm toolbar button became the reference bell with an
  unacknowledged-count badge (same `#/alarms` destination).
* **Tabs + Outside Air strip** (`ui/symmetre/ZoneTabs.jsx`) — reference tab
  treatment and the blue TMY weather strip. Same four tabs, same five weather
  cells, same routes.
* **Left controls panel** — restyled through a scoped `.sym-panel` stylesheet in
  `index.html`; the sidebar components themselves were not touched, so every
  row, label, value and control is exactly as it was. Column width 304px.
* **Alarm Summary** (`alarm/AlarmSummary.jsx`) — reference dark treatment, node
  tree with count badges, priority/action colouring, monospace source links, and
  the acknowledge action moved into a footer bar next to the row counts. Columns,
  sorting, filtering, acknowledge privileges and engine merging are unchanged.

## 5. Small additive changes to existing files

* `AHU46Controller.js`, `AHU44NewController.js`, `AHU23Controller.js` — added
  `clearMode(key)` to release one point's Manual override (the modal's AUTO
  button). `AHU23Controller` also gained the `modes` / `getModes()` bookkeeping
  the other two already had. Existing behaviour of `setValue`, `getModes`,
  `clearModes` and `recalculate` is unchanged.
* `ui/symmetre/AppChrome.jsx` — fixed a pre-existing crash: `MenuBar` called
  `useEffect` but the file only destructured `useContext, useState, useCallback`
  from React, which threw and took down the whole SymmetrE screen.
* `index.html` — Barlow webfont, board keyframes, the `.sym-panel` stylesheet,
  script tags for the four new files, and a JSX loader fallback (see below).

## 6. JSX loader fallback

`@babel/standalone` normally fetches and executes every
`<script type="text/babel" src="…">` itself. Some hosts block the `blob:`/inline
script it injects for the compiled output, which silently leaves every JSX
module unloaded and `#root` empty. `index.html` now detects that case (App.jsx
never defined `window.App`) and loads the same files, in the same order, with the
Babel already on the page. The tags and the file layout are unchanged — this is
purely a delivery fallback and is a no-op wherever Babel's own loader works.

## 7. Known behaviour worth flagging

* Commanding a value that the controller recomputes (e.g. a coil valve) registers
  the override — the `M` badge appears — but the value snaps back on the next
  `recalculate()`. That is v1.3's existing logic, left untouched; the board now
  simply doesn't invite those commands.
* `tailwind is not defined` appears in the console on load. Pre-existing in v1.3:
  `index.html` sets `tailwind.config` but ships a prebuilt `output.css` instead of
  the Tailwind CDN. Harmless, and left alone.
