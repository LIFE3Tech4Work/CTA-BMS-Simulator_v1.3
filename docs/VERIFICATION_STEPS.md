# How to check this build yourself

Every item below is something you can confirm from the running app in a minute
or two. Expected values are what this build actually produced on 17 Aug 2026 —
if you see something different, that is a real finding worth sending back.

**Sign in:** `cta_instructor` / `bms2026`

A note on two console messages you can ignore: `tailwind is not defined` and a
row of `Script error.` lines. Both are pre-existing in v1.3 (the CDN Tailwind
shim and cross-origin Babel), unrelated to any change here.

---

## 1. Merge with Omar's latest — his three fixes are still in

Omar's 2026-08-16 walkthrough fixes were kept, not overwritten.

**1a. Economizer can be turned on by clicking the graphic**
1. Open **AHU-4-6**.
2. Click the **ECONOMIZER SIGNAL** box on the diagram (left of the mixing section).
3. In the modal choose **MANUAL**, pick the ON state, press **SET**.
4. Watch the **outdoor air damper** — it should drive to **100%** and outdoor CFM
   should climb.

*Why it matters:* `economizerActive` is a readback with no drive of its own.
Clicking it used to change nothing. It now redirects to the OA damper — the
same thing the AUTO sequence drives when it engages the economizer.

**1b. Economizer engages under free-cooling conditions**
1. Still on AHU-4-6, open **Manual Weather Control** and set **OAT 55 / RH 40**.
2. Press **Set**.
3. Expect the economizer to engage on its own: **OA damper well above minimum**,
   both coils closed or nearly so.

*Why it matters:* the changeover used to compare outdoor enthalpy against a
fixed baseline, so changing return conditions could never move the decision.
It now computes return-air enthalpy from the air's actual temperature and
humidity.

**1c. Downstream values follow Manual Weather Control**
1. Set **OAT 85 / RH 70**, press **Set**.
2. Mixed air, supply air, and supply RH should all move within a second or two.
3. Press **↻ Release to Live TMY** and they should drift back.

---

## 2. Tab order, AHU-4-3, VAV-02-03

**2a. Order** — the tab bar should read, left to right:

`VAV-02-03 (Mtg Rm 214)` · `VAV-4-4-02 (Ballroom)` · `AHU-23-1` · `AHU-4-6` · `AHU-4-4` · `AHU-4-3`

Simple terminal box first, then the small single-coil unit, then the two large
mixing-box units, with AHU-4-3 beside its twin.

**2b. AHU-4-3 is a real unit, not an alias of AHU-4-4**
1. Open **AHU-4-3**. The left panel should read **Controls — AHU-4-3** and the
   board header **AHU-4-3**.
2. Set its **Cooling Coil Active Setpoint** to **57**.
3. Switch to **AHU-4-4** — its cooling setpoint should still be **60**.
4. Switch back to AHU-4-3 — still 57.

**2c. VAV-02-03**
1. Open **VAV-02-03**. You should get a VAV box diagram in the same visual
   language as the AHU boards (flat background, same panel fills, same header).
2. Drop the **zone cooling setpoint** to **70 °F**.
3. The damper should open toward **100%** and airflow rise to about **1,200 CFM**
   — this box's own maximum, not the Ballroom's.
4. Open **VAV-4-4-02** and confirm the Ballroom's values did not move.
5. Click any value on the VAV diagram — the point modal should open titled
   e.g. **VAV-02-03 · Damper Position**.

> Known gap, deliberate: AHU-4-3 has no point export of its own yet, so its
> seeds are AHU-4-4's with airflow scaled down, and no fault engine is attached.
> VAV-02-03's zone values come from the design source, not the building. Both
> are one-line swaps when Lev's data arrives.

---

## 3. Lev's control-logic items

**3a. Supply air converges on its setpoint** — the headline fix.

| Set OAT to | Expect supply air | Expect in control |
|---|---|---|
| 88 °F | **60.0 °F** | Cooling setpoint |
| 70 °F | **60.0 °F** | Cooling setpoint |
| 58 °F | **60.0 °F** | Cooling setpoint |
| 35 °F | **55.0 °F** | Heating setpoint |

On AHU-4-6, set each value in Manual Weather Control and read **Supply Air
Temperature** off the diagram. Previously 35 °F OAT gave a stable, wrong
**80 °F** supply against a 60 °F setpoint.

At 35 °F you should also see the preheat coil open and the **chilled water
valve closed** — not both open.

**3b. Which setpoint is in control**
1. Left panel → **Control Mode** section.
2. Click **Season Mode** to cycle **Auto → Winter → Summer**.
3. **Active Season**, **Setpoint In Control** and **Active SA SP (limit)** should
   change with it.
4. In **Winter**, "Setpoint In Control" should read **Heating (minimum)**; in
   **Summer**, **Cooling (maximum)**.

*Why the wording:* a heating setpoint is a floor and a cooling setpoint is a
ceiling, not a target the air parks on. That distinction is the answer to Lev's
"which setpoint actually controls the unit."

**3c. One zone setpoint instead of two coil setpoints**
1. Left panel → **Zone (Space) Control**.
2. Turn **Zone SP Overrides Coils** on, set **Zone Temp Setpoint** to **70**.
3. The two coil setpoints should become **68 / 72** (±half of the 4 °F deadband).
4. Turn it **off** — they must return to **55 / 60**, the values you started with.

Step 4 is the one to actually do. An earlier build left them stuck at 68/72.

**3d. Safety still overrides a manual hold**
1. On AHU-4-6, set the **OA damper** to **10%** (it should hold at 10).
2. Turn **Run Schedule** off.
3. The damper must go to **0** — safety wins — while the point still reads
   **MANUAL**.
4. Turn Run Schedule back on; the 10% hold resumes.

**3e. Supply humidity reflects outdoor air**
Set **OAT 35 / RH 25** and read supply RH. It should be a plausible dry-winter
number, not the old fixed-baseline **87%**.

**3f. Alarms**
1. Open **Alarm Summary**.
2. Acknowledge a returned-to-normal alarm — it should be acknowledgeable, and
   the row should **stay on the list** reading *Acknowledged*.

---

## 4. Full-year TMY weather

**4a. The app opens in the right season**

Check the station clock in the status bar. On **17 Aug** it should read
**17 Aug** — this build opened on **Sun Aug 17 2025** at **77 °F / 84% RH**.
The fiscal year runs **1 Jul 2025 → 30 Jun 2026**, and the opening row is
whichever hour matches today's month/day/hour, so this stays true whenever you
open it.

Previously the clock always started **1 May 2026** and could only run to
**12 Jun 2026** — 1,017 hours. It is now the full **8,760**.

**4b. Winter is now reachable**
1. Run the simulation at **3600×** for a few minutes, or use the date jump.
2. Confirm you can reach **January** and see genuinely cold outdoor air.

Measured across the year in this build:

| Date | Outdoor dry bulb |
|---|---|
| 15 Jan | 41 °F |
| 15 Apr | 68 °F |
| 15 Jul | 76 °F |
| 15 Oct | 70 °F |

**4c. Optional — check it without waiting**

Open the browser console (F12) and paste:

```js
var E = window.SimulationEngine, P = window.TMY3Projector;
({
  today:      new Date().toDateString(),
  opensOn:    E.getCurrentTimestamp().toDateString(),
  fiscalYear: E.BASE_DATE.toDateString() + '  ->  ' + E.END_DATE.toDateString(),
  totalHours: E.TOTAL_ROWS,
  jan15: P.getWeatherForRow(P.seasonalRowFor(new Date(2030,0,15,12))).dryBulb,
  jul15: P.getWeatherForRow(P.seasonalRowFor(new Date(2030,6,15,12))).dryBulb
})
```

`opensOn` should be today's month and day. `totalHours` should be `8760`.

---

## 5. Automated tests

The vitest suite could not be executed here, so please run it:

```
npm test
```

Changed in this round, and the reason:

- `Engine.test.mjs` — every May-2026 date and the 1,017-row bound moved to the
  fiscal year. Two tests renamed: the clock no longer starts at row 1, it starts
  on the seasonally-current row.
- `TMY3Projector.test.mjs` — row-to-hour mapping now starts at Jul 1
  (index 4344) and wraps at New Year. New coverage for `seasonalRowFor` and for
  the wrap at row 4417.
- `AHU46Controller.test.mjs` — the two economizer-changeover tests now compute
  the threshold live (Omar's versions, correct once live return-air enthalpy is
  in). The two supply-humidity tests stayed mine, because supply RH is derived
  from the mixed-air condition rather than passed through from return air.

If something fails, the failure text plus the test name is enough for me to fix
it without you digging.

---

## 6. Psychrometrics correction

**6a. The economizer refuses hot humid air**
1. AHU-4-6 → Manual Weather Control → **68 °F / 95% RH**, press Set.
2. Left panel: **Enthalpy OK For Economizer** should read **Off**. Mild outdoor
   air that is nearly saturated carries more heat than the return air, so free
   cooling would make things worse — this used to read On.
3. Now set **55 °F / 40% RH**. It should read **On** and the economizer engage.

**6b. Return Air Enthalpy is physically plausible**
Check the Return Air Enthalpy value on the diagram — roughly **26 BTU/lb** for
room-condition air. It previously read about **53**, which is not reachable for
air at 72 °F / 50% RH.

**6c. Fan speed is back on the reference operating point**
On AHU-4-6's default state: **fan speed 75%**, **≈6,900 CFM**. It had drifted to
63% / 5,796 CFM.

**6d. ALARM RESET works**
1. Trip a pressure switch (e.g. set **DPS-3** true from the sidebar or a modal).
   The unit should shut down on a hard safety.
2. Press **ALARM RESET**.
3. The trip should clear, and the reset button should not stay latched.

## What is deliberately not addressed

Blocked on data only Lev can pull, and unchanged here:

- Return-fan tracking validation against real readings.
- The real VFD-speed / CFM correlation for AHU-4-6.
- Dew point calculation.
- The 12 modal points with no export behind them.

One item worth raising separately: **AHU-4-4 and AHU-4-3 receive no relative
humidity from TMY3, and AHU-23-1 receives no weather at all** — its outdoor
temperature sits at its seeded default. That is a pre-existing wiring gap, not a
data gap, and it is fixable without Lev. Wiring it changes AHU-23-1's calibrated
behaviour, so it needs a decision before I touch it.
