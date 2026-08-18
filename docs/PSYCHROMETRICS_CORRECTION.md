# Psychrometrics correction — what changed in the simulator

The temperature/humidity → enthalpy calculation was wrong, and three files each
carried their own copy of it. This records what the fix changed in behaviour, so
nothing here comes as a surprise in front of a class.

## The error

The approximation's saturation-pressure term returned about **3.8x** the true
value — 1.481 where the correct figure at 72 °F is 0.389 psia. That flowed
through the humidity ratio and roughly **doubled** every enthalpy:

| Condition | Was | Correct |
| --- | --- | --- |
| 72 °F / 50% RH (design return air) | 53.4 BTU/lb | **26.4** |
| 75.9 °F / 91% RH (hot, humid) | 56.9 | **27.3** |
| 55 °F / 40% RH (free cooling) | 44.4 | **17.2** |

For reference, the fixed constant the live calculation replaced was 26.7 BTU/lb —
the correct value for design return air. The live version was reading twice that.

## Now a single shared helper

`src/simulation/Psychrometrics.js` — ASHRAE Fundamentals Ch. 1: Eq. 5/6 for
saturation pressure (with the separate over-ice branch below freezing, which
matters for winter lessons), Eq. 20 for humidity ratio, Eq. 30 for enthalpy.
Verified against published table values to within 1% on saturation pressure.

It replaced duplicate formulas in:

- `AHU46Controller.liveReturnAirEnthalpy()`
- `WeatherOverride.enthalpyFromTAndRH()`
- `boardPoints.returnEnthalpy()`

Loaded from `index.html` before anything that uses it. Controllers fall back to
the design baseline if it is missing rather than producing a wrong number.

## Behaviour changes

**1. The economizer enthalpy check actually discriminates now.** This is the
significant one. Because outdoor enthalpy comes from the TMY3 file as a *true*
value while return-air enthalpy was inflated, the comparison was biased so far
toward "favourable" that it was effectively always true:

| Outdoor condition | Old flag | Correct flag |
| --- | --- | --- |
| 75.9 °F / 91% RH — hot, humid | favourable | **not favourable** |
| 68 °F / 95% RH — mild but saturated | favourable | **not favourable** |
| 88 °F / 20% RH — hot, dry | favourable | **not favourable** |
| 55 °F / 40% RH — textbook free cooling | favourable | favourable |

The unit was only ever kept off the economizer by its dry-bulb changeover
setpoint. That is precisely the failure mode an enthalpy changeover exists to
prevent, so the mild-but-humid case is now a teachable demonstration rather than
a wrong answer.

Lev's free-cooling scenario (55 °F / 40% RH) still engages — the correction does
not undo what it was added for.

**2. "Enthalpy OK For Economizer" on the sidebar reads differently.** It now
shows Off in conditions where it previously showed On. On the default 81.6 °F
day it reads **Off** — correct, since 35.1 BTU/lb outdoor air is worse than
26.4 BTU/lb return air.

**3. Return Air Enthalpy on the diagram halves.** Roughly 26 BTU/lb instead of
roughly 53. The old figure was not physically achievable for room-condition air.

**4. Manual Weather Control produces correct enthalpy.** Typing 55 °F / 40% RH
now yields 17.2 BTU/lb instead of 44.4, so a hand-set condition and a TMY3 row
are finally on the same scale.

**5. Fan speed and CFM restored to the reference operating point.** Not caused by
the psychrometrics fix, but found while tracing the suite: the duct static
pressure loop was calibrated against a cooling coil that saturated at 100% open.
Once the coil was sized to reach its setpoint it settles at 56%, which silently
dropped the default from the screenshot's **75% / 6,901 CFM** to 63% / 5,796 CFM.
Re-calibrated, with the assumed load now a named constant so the dependency is
visible if the coil model changes again.

**6. ALARM RESET works again.** Also found while tracing. The operator-override
latch re-applied commanded values after every pass, which meant:

- `resetPressed` could never self-clear — it is a momentary contact, so the latch
  held the button down forever.
- A DPS trip set by an operator could not be cleared by the reset, because the
  latch restored it on the next pass.

Momentary points are now written straight through without latching, and a reset
releases the override on any latched safety it clears. Verified end to end: trip
raises `hardSafetyShutdown`, reset clears the trip, the button self-clears, and
the override is released.

**7. Deep-cold return air settles at its floor, not its ceiling.** At −20 °F OAT
`returnAirTemp` now lands on its 60 °F floor with the preheat coil saturated,
rather than being pushed to the 85 °F ceiling by the old coil's fixed +20 °F
overshoot. The sensible direction for a unit that cannot make enough heat.

## Alarms

No fault rule thresholds changed. Two indirect effects worth knowing:

- **N-03 (simultaneous heating and cooling)** only fires when the economizer is
  active *and* the chilled water valve is open. Since the economizer now engages
  in fewer conditions, N-03 fires in fewer conditions — which is correct: it was
  previously reachable on hot humid days where the economizer should never have
  been on at all.
- **N-01 (supply air outside its design band)** is unchanged and still fires on
  the AHU-4-4 default state, as its own test documents.

## Tests

`Psychrometrics.test.mjs` is new and asserts against **published** values, not
against the implementation. That distinction is the point: the old test mirrored
the old formula, which is exactly why a 2x error survived. `AHU46Controller`'s
changeover tests now derive their thresholds from the shared helper rather than
restating a formula.

Suite status after the change (traced assertion by assertion):

| Suite | Result |
| --- | --- |
| `Psychrometrics.test.mjs` | 24 / 24 |
| `AHU46Controller.test.mjs` | 149 / 149 |
| `AHU44NewController.test.mjs` | 28 / 28 |
| `AHU44_Screenshot_Verification.test.mjs` | 15 / 15 |
| `VAVController.test.mjs` | 43 / 43 |

Two pre-existing problems were fixed along the way, both of which had kept whole
suites from running at all:

- `AHU44NewController.test.mjs`, `AHU44_Screenshot_Verification.test.mjs` and
  `VAVController.test.mjs` used `__dirname` without declaring it. These are ESM
  `.mjs` files, where Node does not provide it, so every one of those suites
  threw before reaching an assertion.
- `VAVController.test.mjs` tested a `VAV-4-4-01` ("Pre-Function") zone that no
  controller in the repo has ever defined. Retargeted to the two zones that do
  exist, with the four assertions that assumed identically-seeded zones rewritten
  to assert independence instead — they are different boxes serving different
  spaces, so they carry different design values.

These results come from tracing each assertion against the implementation, not
from a `vitest` run. **Please still run `npm test`** — see the caveats at the end
of `VERIFICATION_STEPS.md`.
