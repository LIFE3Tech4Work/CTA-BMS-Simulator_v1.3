# BMS-Aligned Requirements: Lecture → Simulator Reinforcement

## Climate Tech Academy · NYSERDA PON 3981
### Mapping Lev's BMS Training Lecture to Simulator Exercises

This document maps each concept from Lev Chesnov's BMS training lecture (BMS_Training_CTA_Annotated.pptx + Slide Companion) to specific actions instructors and students can perform in the CTA BMS Simulator to reinforce that concept.

---

## 1. What Is a BMS? — The Body Analogy

**Lecture Concept:** The BMS is like a human body. Sensors are the eyes (they read conditions). The controller is the brain (it makes decisions). Actuators are the arms (they physically move equipment). The server stores everything like long-term memory.

### Instructor Actions (Simulator)
- Use **Companion Mode Slide 1–2** to introduce the simulator as the "Station" interface students will use
- Navigate to **SymmetrE Station → AHU-4-4** graphic and point out the three categories visible on screen:
  - **Sensors (AI):** RA Temp, SA Temp, CO₂, Branch Static Pressure — hover to show green "AI" badge
  - **Actuators (AO):** CHW Valve, PHT Valve, OA Damper, Fan Speed — hover to show blue "AO" badge
  - **Status (BI):** Run Schedule — hover to show yellow "BI" badge
- Open the **Controls Sidebar** and show how setpoints (the "desired values") compare to actual sensor readings

### Student Actions (Simulator)
- Hover over each point on the AHU graphic to identify its type badge (AI/AO/BI/BO)
- In EBI Point Detail → General Tab, identify: which points are inputs (sensors) vs. outputs (actuators)
- Record in Capstone Section 2 which points represent "eyes" (AI), "arms" (AO), and "status" (BI)

---

## 2. BACnet Point Types: AI, AO, BI, BO

**Lecture Concept:** AI = analog input (temperature, pressure readings going INTO the controller). AO = analog output (valve %, fan speed commands going OUT). BI = binary input (on/off status INTO). BO = binary output (on/off command OUT). Values shown in red on a real BMS screen indicate manual override.

### Instructor Actions (Simulator)
- Use **Companion Mode Slides 10–11** (BACnet type badges appear persistently on the AHU graphic)
- Click a specific point (e.g., AI301@DEV4004 = Supply Air Temp) → navigate to **EBI General Tab** → show "Point Type: AI"
- Click an actuator (e.g., AO102@DEV4004 = CHW Valve) → show "Point Type: AO"
- Click a binary (e.g., BI601@DEV4004 = Run Schedule) → show "Point Type: BI" and note it shows Active/Inactive instead of a numeric value
- In the **Controls Sidebar**, demonstrate: edit a white-box AO value → point goes to Manual (purple indicator) → this is the "red override" Lev showed on real screens

### Student Actions (Simulator)
- Navigate to **EBI Point Detail** for 4 different points and classify each by type
- In the Controls Sidebar, find the Fan Speed (AO) → click to edit → observe it enters Manual Override state (purple)
- Run the **Point Attribute Report** (#/reports) → check "In Manual" → execute → see which points are currently overridden
- Use the **Relinquish** concept: after overriding, note that interpolation stops (the simulation engine no longer drives that value)

---

## 3. The Front-End Station: Layout & Navigation

**Lecture Concept:** The Station interface has a title bar, menu bar, toolbar, navigation bar, and a critical bottom status bar showing OAT, humidity, enthalpy, dewpoint, wetbulb. Check the status bar FIRST when arriving at any building. Building engineers won't babysit you — learn to navigate independently.

### Instructor Actions (Simulator)
- Use **Companion Mode Slide 5** ("SymmetrE Station Layout")
- Point out each element in order: Title Bar → Menu Bar → Toolbar → Zone Tabs → Outside Air Strip → Status Bar
- Emphasize the **Outside Air Strip** as the real-world "first thing you read" — show OA Temp, Humidity, Wetbulb, Dewpoint, Enthalpy
- Demonstrate navigation: Menu Bar > Station > AHU-4-4, Menu Bar > View > Alarm Summary
- Show the **Chapters dropdown** as the navigation map for the full training curriculum

### Student Actions (Simulator)
- Without instructor guidance, navigate from the Sign On screen to:
  1. AHU-4-4 graphic
  2. Switch to AHU-4-6 using zone tabs
  3. Open the Alarm Summary from the toolbar
  4. Return to the Station using the ← Back button
  5. Find the Schedule Manager via Menu Bar > Station
- Record the current OA conditions from the strip in Capstone Section 2
- Use the **Status Bar** timestamp to determine what simulated date/time the building is operating at

---

## 4. Reading an AHU Graphic: Component Identification

**Lecture Concept:** On a real AHU page, you see the airflow path: OA Intake → Filters → Preheat Coil → CHW Coil → Supply Fan → Duct → Zones → Return. Every component shows its current operating value. Values in red = overridden. You must read the screen and identify what's wrong.

### Instructor Actions (Simulator)
- Use **Companion Mode Slide 8** ("Reading the AHU Graphic")
- Walk through the AHU-4-4 graphic left to right: OA Damper → Filters → PHT Coil → CHW Coil → Fan/VFD → Supply Air → Zone → Return Air
- Load **Scenario 3 (Simultaneous Heat + Cool)** → show the amber overlay warning
- Load **Scenario 5 (CO₂ Sensor Fault)** → show CO₂ reading at impossible value (<100 ppm)
- Ask: "What's wrong on this screen?" — have students identify the fault from the graphic alone

### Student Actions (Simulator)
- In **Free Explore Mode**, load each of these scenarios and identify the fault:
  - Scenario 3: What two values are both above 20%?
  - Scenario 5: What is the CO₂ reading and why is it impossible?
  - Scenario 6: What value has the PHT valve been stuck at, and for how long?
- Click the faulty point → open EBI History Tab → look at the trend to see when the fault started
- Document findings in Capstone Section 3

---

## 5. Manual Override vs. Out of Service

**Lecture Concept:** Manual mode = operator forces a value, but the controller still calculates its auto value in the background. Out of Service = controller completely ignores the point. The Relinquish button returns a manual point to auto. A Manual override shows in RED or PURPLE on a real BMS screen. The HOA switch is the physical hardware equivalent.

### Instructor Actions (Simulator)
- In the **Controls Sidebar**, click the SA Fan Speed (white box) → type "50" → press Enter
- Point out: the value changed, the box is now **purple** (Manual Override), and the simulation engine stopped updating this point
- Explain: "In the real building, this is what happens when someone turns the HOA switch to HAND"
- Navigate to **EBI Point Detail** for the same point → show the left panel now says "Manual" with a purple background
- Show the **StatusDots**: the "Overridden" dot is now filled purple
- Run **Point Attribute Report** → show the point appears in the "In Manual" results
- Discuss: Why would an operator leave a point in manual? What are the risks?

### Student Actions (Simulator)
- Override the OA Damper to 100% (simulating "free cooling mode")
- Check: does the simulation engine still update this value? (No — it stays at 100%)
- Navigate to EBI → Recent Events Tab → find the "Mode Transition" event showing when it went Manual
- In Capstone Section 3, describe what happens if an operator forgets to release a manual override

---

## 6. Alarms: The 9-State Classification

**Lecture Concept:** Alarms have three priorities (Urgent, High, Low) and three states (Active+Unacknowledged = flashing, Active+Acknowledged = solid, Inactive+Unacknowledged = outline). The Alarm box in the status bar flashes red when unacknowledged alarms exist. You must acknowledge them to stop the flashing. Double-clicking an alarm takes you to the point detail page.

### Instructor Actions (Simulator)
- Use **Companion Mode Slides 19–21** (Alarm Summary, 9-State Classification, Fault Detection Rules)
- Navigate to **#/alarms** → show the 6 pre-loaded faults
- Point out the icon states: some are flashing (unacknowledged), some are solid (acknowledged)
- Right-click an alarm → Acknowledge → show the icon changes from flashing to solid
- Click a Source address → navigate to the point's EBI detail
- Filter using the Location Panel (left tree) → show only AHU-4-4 alarms

### Student Actions (Simulator)
- Open Alarm Summary → sort by Priority (click column header)
- Identify: how many Urgent vs. High priority alarms are active?
- Acknowledge all visible alarms using the "Acknowledge Page" button
- After acknowledging, check: are any icons still flashing? (Inactive+Unacknowledged ones may still flash)
- In Capstone Section 3, list all active fault conditions and their root causes

---

## 7. Trends and History: Reading Time-Series Data

**Lecture Concept:** The server only stores point history if someone paid for it. Every trended point is a billable subscription. If you see a blank trend line, the data was never collected — it didn't exist. You can copy trend data to Excel with Ctrl+C → Ctrl+V. The trend chart background is black with colored traces.

### Instructor Actions (Simulator)
- Use **Companion Mode Slide 14** ("EBI Point Detail — History Tab")
- Navigate to any point → **History Tab** → show the black background/cyan fill chart
- Demonstrate period selection (2 Weeks, 4 Weeks, 3 Months)
- Demonstrate interval averaging (6 min, 1 hr, 8 hr, 1 day)
- Click **"+ Add sensor"** → overlay a second point → show multi-series comparison
- Click **"Export to CSV"** → show the downloaded file matches the TMY3 format from Session 4
- Explain: "In the simulator, all points have history because the data is baked in. In a real building, you'd need to verify which points are actually being trended."

### Student Actions (Simulator)
- Open Supply Air Temp → History Tab → change period to 3 Months → observe seasonal pattern
- Overlay the CHW Valve on the same chart → identify: when CHW opens, does SAT drop?
- Export the data to CSV → open in Excel → verify columns match the TMY3 exercise format
- In Capstone Section 2, reference specific dates and values from the trend data as evidence

---

## 8. Schedules: The #1 Source of Energy Waste

**Lecture Concept:** A wrong schedule is the most common BMS fault. The AHU-23-1 case study showed a unit running 24/7 on manual override with a setpoint it could never achieve because there was no cooling coil. If the schedule says "occupied" 24/7, the system runs nonstop — wasting energy when nobody is in the building.

### Instructor Actions (Simulator)
- Use **Companion Mode Slides 23–25** (Weekly Schedule, Fault Pattern, Exception Schedule)
- Navigate to **#/schedule** → select AHU-4-4 → show normal weekday 08:00–18:00 pattern
- Select **AHU-9-2** → show the fault: 24/7 Active, all rows highlighted red
- Ask: "How much energy is this building wasting by running the AHU from 6 PM to 8 AM when nobody is here?"
- Show the **Exception Schedule tab** → explain holidays
- Load **Scenario 11 (Weekend Scheduling Fault)** → show the LL97 panel accumulating faster

### Student Actions (Simulator)
- Compare the weekly schedules for AHU-4-4 (normal) and AHU-9-2 (fault)
- Calculate: if the building runs 24/7 vs. 10 hrs/day on weekdays, what % of runtime is wasted?
- In Capstone Section 4, estimate the excess energy consumption from the scheduling fault
- In Capstone Section 5, recommend a corrective schedule and estimate savings

---

## 9. Data Availability: What's Real vs. What's Missing

**Lecture Concept:** "Data is not free — it must be contracted." If you arrive at a site and see a blank trend line, the building owner never paid to collect that point. Options: ask the contractor to activate trending (small fee), or deploy a portable data logger for 2–4 weeks.

### Instructor Actions (Simulator)
- Explain that in the simulator, ALL 27 points have complete history because the data is pre-loaded
- In a real building, students will encounter points with NO history — this is normal, not an error
- Use **Companion Mode Slide 14** to show what a fully-trended point looks like
- Discuss: "Which of these 27 points would you absolutely need trended for an energy audit? Which could you skip?"

### Student Actions (Simulator)
- In Capstone Section 2, list the minimum set of points needed for a basic energy analysis
- For each point, explain WHY it matters (e.g., "OA Temp is needed to calculate HDH/CDH for weather normalization")
- Identify: if you could only trend 5 of the 27 points, which would you choose and why?

---

## 10. The Diagnostic Workflow: Main Page → Equipment → Fault

**Lecture Concept (from Lev's feedback):** The capstone should teach students to navigate from a main BMS dashboard into specific equipment pages to locate issues. This is how real troubleshooting works — you don't get handed the answer; you navigate to find it.

### Instructor Actions (Simulator)
- Use **Companion Mode Slide 40** (Troubleshooting Framework — 6 steps)
- Demonstrate the full diagnostic workflow:
  1. Start at SymmetrE Station → read OA Strip (context)
  2. Check Alarm Summary → identify active faults
  3. Click alarm source → navigate to EBI Point Detail
  4. Check History Tab → when did the fault start?
  5. Check Related Points → is this isolated or systemic?
  6. Determine root cause → recommend corrective action
- Load **Scenario 6 (PHT Valve Stuck)** and walk through all 6 steps live

### Student Actions (Simulator)
- In **Free Explore Mode**, load Scenario 8 (Cooling Tower Fault) and independently:
  1. Read the OA Strip — what's the outdoor temperature?
  2. Check Alarm Summary — which fault rule triggered?
  3. Navigate to the source point
  4. Check the History Tab — how long has this been occurring?
  5. Check the OA Temp trend — does it confirm free cooling should be possible?
  6. Write the root cause and corrective action
- Complete all 6 steps and document in Capstone Section 3

---

## 11. LL97 Compliance: Carbon Tracking in Real Time

**Lecture Concept (from CTA Sessions 1–4):** NYC Local Law 97 sets carbon intensity limits by building type. Buildings exceeding their limit face annual penalties of $268/ton CO₂e. The LL84 benchmarking data (explored in Sessions 1–3) provides the baseline; the TMY3 weather data (Session 4) provides seasonal context.

### Instructor Actions (Simulator)
- Use **Companion Mode Slide 35–37** (LL97 Panel, TMY3 Weather, Peer Benchmarking)
- Point to the **LL97 Panel** in the bottom-left → show accumulating values
- Explain: "Each simulation hour, the building consumes energy based on its LL84 profile, adjusted for outdoor temperature"
- Set simulation to **3600× speed** → watch the progress bar fill toward the limit
- Show **Peer Benchmarks** in the LL84 data → compare against the 4 archetype buildings
- Ask: "At this rate, will the building exceed its 2024 limit? Its 2030 limit?"

### Student Actions (Simulator)
- Record the current LL97 panel values in Capstone Section 4
- Calculate the building's carbon intensity (accumulated GHG ÷ floor area)
- Compare against the LL97 2024 limit (15.0 kgCO₂e/sqft) and 2030 limit
- Identify which emission sources (electric vs. steam) contribute most
- In Capstone Section 5, recommend measures to reduce carbon intensity before the 2030 deadline

---

## 12. ASHRAE Standards in Context

**Lecture Concept:** ASHRAE 62.1 sets minimum ventilation rates (measured via CO₂). ASHRAE 90.1 mandates economizer operation and limits simultaneous heating/cooling. ASHRAE 55 defines thermal comfort zones. ASHRAE 36 provides optimal control sequences.

### Instructor Actions (Simulator)
- In the **Controls Sidebar**, expand the ASHRAE callout cards
- For each standard, connect to a visible point:
  - **62.1**: "See the CO₂ reading at 538 ppm → below the 1000 ppm limit → ventilation is adequate"
  - **90.1**: "The OA Damper is at 15% with OAT at 52°F → the economizer should be open → this violates 90.1"
  - **55**: "Return Air Temp is 72°F → within the 68–79°F comfort range"
  - **36**: "Fan speed modulating at 55% → healthy VFD operation per Guideline 36 sequences"
- Load Scenario 2 (Economizer Lockout) and ask: "Which ASHRAE standard is being violated here?"

### Student Actions (Simulator)
- For each of the 4 ASHRAE standards referenced in the sidebar, find one point value on the current screen that relates to it
- In Capstone Section 3, reference the applicable ASHRAE standard when describing each fault
- In Capstone Section 5, cite ASHRAE standards when recommending operational improvements

---

## Summary: Capstone Section Mapping

| Capstone Section | Primary Lecture Concepts Reinforced | Key Simulator Screens Used |
|---|---|---|
| 1 — Building Overview & Energy Performance | LL84 data, building type, EUI, peer comparison | LL97 Panel, LL84 constants |
| 2 — BMS Data Analysis | Trend reading, point types, data availability | EBI History Tab, OA Strip, Controls Sidebar |
| 3 — Fault Detection & Diagnosis | Manual override, alarm states, diagnostic workflow | Alarm Summary, EBI Recent Events, Point Attribute Report |
| 4 — LL97 Compliance Assessment | Carbon intensity, LL97 limits, 2024 vs 2030 targets | LL97 Panel, peer benchmarks |
| 5 — Recommendations & Action Items | Schedules, setpoints, economizer, ASHRAE standards | Schedule Manager, Controls Sidebar, ASHRAE callouts |

---

## Companion Mode Slide → Lecture Topic Cross-Reference

| Slides | Lecture Topic | Simulator Feature Used |
|---|---|---|
| 1–4 | Intro, security levels, signing on | Sign On screen, security level display |
| 5–6 | Station layout, zone navigation | App Chrome, Zone Tabs |
| 7 | Outside Air conditions | OA Strip (TMY3 data) |
| 8–9 | AHU graphic, Controls Sidebar | AHU Graphic, Sidebar sections |
| 10–11 | BACnet point types (AI/AO/BI/BO) | Point type badges (persistent) |
| 12–17 | EBI Point Detail (all tabs) | EBI General, History, Alarms, Events |
| 18–21 | Alarm system, fault detection | Alarm Summary, 9-state icons, F-01 through F-06 |
| 22–25 | Schedules (normal vs. fault) | Schedule Manager, AHU-9-2 fault |
| 26–27 | Economizer and free cooling | Scenarios 2, 7 |
| 29–33 | Common faults (heat/cool, CO₂, stuck valve, VFD, CT) | Scenarios 3, 5, 6, 8, 12 |
| 35–37 | LL97, TMY3, peer benchmarking | LL97 Panel, OA Strip |
| 38–39 | CSV export, Point Attribute Report | EBI History export, #/reports |
| 40 | Troubleshooting framework (6 steps) | Chapter 14 card in Capstone |
| 41 | Course summary | Mode switching, Capstone submission |
