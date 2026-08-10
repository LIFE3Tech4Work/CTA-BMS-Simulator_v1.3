# CTA BMS Simulator — Instructor Answer Key & Group Project Guide

## Climate Tech Academy · NYSERDA PON 3981
### Session 5: Building Systems, Efficiency & Operations

---

## How to Use This Document

**For Instructors:**
- Part 1 is your answer key — expected values and correct responses for every exercise
- Part 2 is a feature verification checklist to confirm the simulator works before class
- Part 3 is the group project structure (6 students per team, deliverable they can present)

**For Students:**
- They receive Part 3 only (the group project brief)
- Parts 1 and 2 stay with the instructor

---

# PART 1: ANSWER KEY

## Exercise 1 — Point Type Classification

**Task:** Students hover over each point on the AHU-4-4 graphic and record its BACnet type.

| Point on Graphic | Expected Badge | BACnet Address | Why This Type |
|---|---|---|---|
| OA Damper Position | AO | AO104@DEV4004 | Command going OUT to the damper actuator |
| Preheat Coil Valve | AO | AO103@DEV4004 | Command going OUT to the valve actuator |
| CHW Coil Valve | AO | AO102@DEV4004 | Command going OUT to the valve actuator |
| Supply Fan Speed | AO | AO101@DEV4004 | Speed command going OUT to the VFD |
| Supply Air Temp | AI | AI301@DEV4004 | Sensor reading coming IN from the duct sensor |
| Return Air Temp | AI | AI201@DEV4004 | Sensor reading coming IN from the duct sensor |
| Return Air CO₂ | AI | AI401@DEV4004 | Sensor reading coming IN from the CO₂ sensor |
| Branch Static Pressure | AI | AI501@DEV4004 | Sensor reading coming IN from the pressure transducer |
| Run Schedule | BI | BI601@DEV4004 | Binary status (ON/OFF) — occupied or unoccupied |

**Key Teaching Point:** AI and BI = data going INTO the controller (sensors). AO and BO = commands going OUT from the controller (actuators). Students who confuse input/output direction need to review the "body analogy" — eyes (AI) read, arms (AO) move.

---

## Exercise 2 — Manual Override Demonstration

**Task:** Students override a point, observe the consequences, then release it.

**Steps & Expected Results:**

1. In Controls Sidebar, click SA Fan Speed (white box) → type `50` → press Enter
   - **Expected:** Box turns purple, value shows 50.0%
   - **Expected:** Fan icon on graphic changes to match new speed
   - **Expected:** Simulation engine STOPS updating this point (frozen at 50%)

2. Navigate to EBI Point Detail (click the point on the graphic)
   - **Expected:** Left panel shows "Manual" with purple background
   - **Expected:** Overridden status dot = filled purple
   - **Expected:** PV field shows 50.00

3. Check Recent Events Tab
   - **Expected:** A "Mode Transition" event appears: "Auto → Manual"

4. Run Point Attribute Report (#/reports) → check "In Manual" → Run Report
   - **Expected:** SA Fan Speed appears in results with "In Manual" state

5. Return to Controls Sidebar → click the overridden value → set back to any value within range
   - **Note:** In the simulator, any new value from the simulation tick will restore it once the point is no longer in Manual. The point remains Manual until the simulation engine's next interpolation cycle overrides it back.

**Key Teaching Point:** Every manual override creates a responsibility. If you override a fan to 50% and walk away, that point stays at 50% until someone releases it — even if the building needs full cooling at 2 PM. This is the #1 source of energy waste Lev finds on real job sites.

---

## Exercise 3 — Fault Identification (Scenarios)

**Task:** Students load a scenario and diagnose the fault using only the BMS interface.

### Scenario 3: Simultaneous Heating + Cooling

| Question | Expected Answer |
|---|---|
| What fault is occurring? | Both the Preheat Coil and CHW Coil are open simultaneously |
| What are the two values? | PHT Valve >20% AND CHW Valve >20% (exact values vary by row ~35%/45%) |
| What visual indicator confirms this? | Amber "SIMULTANEOUS HEATING AND COOLING" overlay banner |
| Which fault rule triggers? | F-01 (Urgent priority) |
| Which ASHRAE standard does this violate? | ASHRAE 90.1 — limits on simultaneous heating and cooling |
| What is the energy impact? | Building is heating and cooling the same airstream — 100% waste on overlapping portion |
| Recommended fix | Check control sequence: either reset SAT setpoint deadband, or verify the changeover logic is properly staged (PHT should close before CHW opens) |

### Scenario 5: CO₂ Sensor Fault

| Question | Expected Answer |
|---|---|
| What is the CO₂ reading? | ~45 ppm (varies by exact row) |
| Why is this impossible? | Outdoor ambient CO₂ is ~420 ppm. Indoor CO₂ cannot be lower than outdoor. |
| What does this indicate? | Sensor failure, disconnected wiring, or severe calibration drift |
| Which fault rule triggers? | F-06 triggers if reading >800 ppm, but the real issue here is the implausibly LOW reading indicating hardware failure |
| What should the operator do? | 1. Put point Out of Service. 2. Dispatch technician to check wiring and sensor. 3. Verify with portable CO₂ meter. |

### Scenario 6: PHT Valve Stuck

| Question | Expected Answer |
|---|---|
| What is the PHT valve reading? | ~25% (stuck between 24.9–25.1%) |
| How long has it been stuck? | 3+ hours (visible in History Tab — flat line) |
| What does this indicate? | Mechanical failure: seized actuator, stripped linkage, or frozen valve stem |
| Which fault rule triggers? | F-04 (after 3+ consecutive hours in the stuck range) |
| What is the energy impact? | Preheat coil partially open when not needed → heating supply air unnecessarily → CHW coil then works harder to compensate |
| Recommended fix | 1. Verify actuator power. 2. Check actuator linkage physically. 3. If stuck mechanically, replace actuator. |

### Scenario 8: Cooling Tower Fault

| Question | Expected Answer |
|---|---|
| What is the CT running at? | 100% speed |
| What is the OA Temp? | ~48°F (mild conditions) |
| Why is this a fault? | At OAT <55°F, free cooling is possible — the CT should reduce speed or cycle off |
| Which fault rule triggers? | F-05 (Economizer not active when OAT permits) |
| What is the energy impact? | CT running at full speed wastes pump and fan energy when outdoor conditions could provide free cooling |
| Recommended fix | Check CT VFD control sequence — should have an OAT lockout that reduces CT speed below 55°F OAT |

---

## Exercise 4 — Schedule Analysis

**Task:** Compare AHU-4-4 schedule (normal) with AHU-9-2 schedule (fault).

| Question | Expected Answer |
|---|---|
| AHU-4-4 occupied hours (weekday) | 08:00 – 18:00 (10 hours/day) |
| AHU-4-4 weekly run hours | 50 hours (10 hrs × 5 days) |
| AHU-9-2 occupied hours | 00:01 – 23:59 every day (24/7) |
| AHU-9-2 weekly run hours | 168 hours (24 × 7) |
| Excess hours per week | 118 hours (168 - 50) |
| % of runtime that is wasted | 70.2% (118 ÷ 168) |
| Annual energy waste estimate | If the AHU uses 50 kW average: 118 hrs/week × 52 weeks × 50 kW = 306,800 kWh/year wasted |
| LL97 carbon impact | At NYC grid factor (~0.000288 mtCO₂e/kWh): ~88 mtCO₂e/year unnecessary |

**Key Teaching Point:** Lev's AHU-23-1 case study at Memorial Sloan Kettering is the real-world version of this — a boiler room unit with no cooling coil running 24/7 chasing an impossible setpoint. The fix is free (change the schedule), and the savings are immediate.

---

## Exercise 5 — LL97 Compliance Check

**Task:** Students read the LL97 panel and determine compliance status.

| Question | Expected Answer |
|---|---|
| Building gross floor area | 715,320 sqft |
| LL97 2024 limit (kgCO₂e/sqft) | 15.0 |
| Annual carbon cap (mtCO₂e) | 15.0 × 715,320 ÷ 1000 = 10,730 mtCO₂e |
| Building's actual annual GHG | 5,038.5 mtCO₂e (from LL84 data) |
| 2024 compliance status | COMPLIANT (5,038.5 < 10,730) |
| LL97 2030 limit (kgCO₂e/sqft) | ~4.3 (hotel) / 3.35 (residential) → weighted ~3.66 |
| 2030 annual carbon cap | ~2,620 mtCO₂e |
| 2030 compliance status | NON-COMPLIANT (5,038.5 >> 2,620) |
| Penalty at 2030 rates | (5,038.5 - 2,620) × $268 = ~$648,000/year |

**Key Teaching Point:** The building passes 2024 easily but faces massive penalties by 2030 without decarbonization. This creates urgency for the recommendations in Capstone Section 5.

---

## Exercise 6 — Trend Analysis & CSV Export

**Task:** Export Supply Air Temp data, open in Excel, and identify a pattern.

| Question | Expected Answer |
|---|---|
| What period should you select? | 3 Months (captures full May–June range) |
| What interval for daily patterns? | 1 hr avg (shows hourly oscillation) |
| Expected SAT pattern (normal operation) | ~55°F during occupied hours, rises during unoccupied |
| What columns appear in the CSV? | Date, Time, Hour_Number, Month, OA_Temp_F, HDH, CDH, [sensor], [unit] |
| How does this connect to Session 4? | Same format as the TMY3 exercise — HDH/CDH calculated the same way |

---

# PART 2: FEATURE VERIFICATION CHECKLIST

Run through this before each class to confirm the simulator is working correctly.

| # | Test | Expected Result | ✓ |
|---|---|---|---|
| 1 | Open the URL in browser | Sign On screen appears | |
| 2 | Login as cta_student / bms2026 | Lands at SymmetrE Station within 1 sec | |
| 3 | Check OA Strip values | All 5 show numeric values (not --.-) | |
| 4 | Check status bar timestamp | Shows a date in May/June 2026, advancing | |
| 5 | Click AHU-4-6 tab | Graphic switches to AHU-4-6 | |
| 6 | Hover a point on graphic | Type badge (AI/AO/BI) appears | |
| 7 | Click a point value | Navigates to EBI Point Detail | |
| 8 | EBI History Tab | Black chart with cyan data renders | |
| 9 | Open Alarm Summary (#/alarms) | 6 pre-loaded faults visible | |
| 10 | Open Schedule Manager (#/schedule) | AHU-4-4 weekday schedule visible | |
| 11 | Switch to Companion Mode | Right panel appears, sim pauses | |
| 12 | Advance slides (Next →) | Slide number increments, content changes | |
| 13 | Switch to Explore Mode | Full width, 60× speed, scenario cards visible | |
| 14 | Load Scenario 3 | Amber overlay appears (simultaneous heat/cool) | |
| 15 | Switch to Capstone Mode | Worksheet panel appears on right | |
| 16 | Type in Section 1 textarea | Character counter increments | |
| 17 | LL97 Panel values | Non-zero, incrementing over time | |
| 18 | Login as cta_instructor / bms2026 | Access Instructor Dashboard (#/instructor) | |
| 19 | Unlock Capstone button | Status changes to "Capstone Unlocked" | |
| 20 | Controls Sidebar collapse toggle | Sidebar collapses to narrow strip | |

---

# PART 3: GROUP PROJECT BRIEF

## (Distribute to Students)

---

# CTA BMS Simulator — Group Diagnostic Project

## Climate Tech Academy · Session 5 Assessment

**Team Size:** 6 students
**Duration:** 90 minutes in-class + optional take-home refinement
**Deliverable:** 10-minute team presentation + submitted Capstone worksheet (1 per team)

---

### Your Role

Your team has been hired as energy consultants. A building owner has given you access to their BMS front-end (the simulator). They've reported high energy bills and want answers. Your job:

1. Identify what's going wrong
2. Quantify the waste
3. Recommend fixes with estimated savings
4. Present your findings to the building owner (the class)

---

### Team Roles (assign one per member)

| Role | Responsibility |
|---|---|
| **Navigator** | Drives the simulator — handles screen navigation, clicking, typing |
| **Data Analyst** | Records values, exports CSV data, compiles trend evidence |
| **Fault Detective** | Reads alarms, checks Point Attribute Report, identifies overrides |
| **Schedule Auditor** | Reviews all schedules for faults, calculates wasted runtime |
| **Compliance Officer** | Reads LL97 panel, calculates carbon intensity, checks 2030 risk |
| **Presenter** | Organizes findings into the presentation, ensures all sections covered |

(Teams with fewer than 6: combine Data Analyst + Compliance Officer, or Navigator + Presenter)

---

### Phase 1: Initial Building Assessment (20 min)

As a team, answer these questions using only the simulator:

1. What is today's outdoor temperature? (Read the OA Strip)
2. What time/date is the building operating at? (Read the Status Bar)
3. Is the building in occupied or unoccupied mode? (Check Run Schedule in Controls Sidebar)
4. Are there any active alarms? How many? (Check Alarm Summary)
5. Are any points currently in Manual Override? (Run Point Attribute Report)
6. What is the current LL97 compliance status? (Read the LL97 Panel)

---

### Phase 2: Fault Diagnosis (30 min)

Your instructor will load a scenario. Using the 6-step troubleshooting framework:

1. **Identify Symptoms** — What looks wrong on the AHU graphic? What alarms are active?
2. **Isolate Subsystem** — Is this an airside issue (AHU), waterside issue (chiller/CT), or controls issue (sensor/actuator)?
3. **Investigate Related Points** — Click the suspect point → check History Tab. When did this start? Is the trend normal before that?
4. **Physical Verification** — What would you check in the field? (Describe — you can't physically go there, but explain what you'd verify)
5. **Root Cause** — What is the most likely cause of this fault?
6. **Corrective Action** — What specific change would you make? (Setpoint change? Schedule fix? Maintenance work order?)

---

### Phase 3: Energy & Compliance Impact (20 min)

Quantify the problem:

1. **Energy Waste Estimate** — How many kWh or kBTU per year is this fault wasting? (Use the schedule hours, LL84 constants, or trend data to estimate)
2. **Carbon Impact** — How many mtCO₂e does this add annually?
3. **LL97 Penalty Risk** — Will this push the building over its 2030 carbon cap? By how much? What's the annual penalty?
4. **Cost of Inaction** — $ penalty + $ energy waste per year

---

### Phase 4: Recommendations & Presentation Prep (20 min)

Complete the Capstone worksheet (one per team) and prepare a 10-minute presentation:

**Presentation Structure:**
1. Building overview (30 sec) — what building, what systems
2. What we found (3 min) — faults identified, with evidence (screenshot or data)
3. Root cause analysis (2 min) — why is this happening
4. Energy and carbon impact (2 min) — quantified waste
5. Recommendations (2 min) — specific, actionable fixes with estimated savings
6. Q&A (remaining time)

**Grading Criteria:**
- Did the team correctly identify the fault? (technical accuracy)
- Did they use BMS data as evidence? (data literacy)
- Did they quantify energy/carbon impact? (analytical rigor)
- Are recommendations specific and actionable? (professional quality)
- Can each team member explain the findings? (individual understanding)

---

### Scenario Assignments (Instructor assigns one per team)

| Team | Scenario | Difficulty |
|---|---|---|
| A | Scenario 3: Simultaneous Heat + Cool | Medium |
| B | Scenario 5: CO₂ Sensor Fault | Medium |
| C | Scenario 6: PHT Valve Stuck | Medium-Hard |
| D | Scenario 8: Cooling Tower Fault | Medium |
| E | Scenario 11: Weekend Scheduling Fault | Easy-Medium |
| F | Scenario 4: Manual Override Active (unoccupied) | Easy-Medium |

If fewer than 6 teams: assign the Medium scenarios first, then add Easy-Medium for remaining teams.

---

### What to Submit

1. **Capstone Worksheet** — completed in the simulator, exported as PDF (one per team)
2. **Presentation slides** (optional — can present directly from the simulator instead)
3. **Each team member** must be able to answer questions about any section (not just their role)

---

### Connection to Your Career

This exercise replicates exactly what Lev and his technicians do every day at TEC Systems:

- They log into real BMS front-ends at hotels, hospitals, and office buildings
- They identify faults from graphics, alarms, and trends
- They quantify energy waste for building owners
- They write work orders for corrective action
- They present findings to facility managers who sign off on the repairs

The only difference: you're using simulated data. The interface, the workflow, and the diagnostic logic are identical to what you'll encounter on a real job site.

---

*Climate Tech Academy · NYSERDA PON 3981 · Data Analytics & Building Energy Track*
