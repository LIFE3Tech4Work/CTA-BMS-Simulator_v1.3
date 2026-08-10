# CTA BMS Simulator — Instructor Guide

## Quick Start

1. **Launch the server** from your terminal:
   ```bash
   cd /Users/drn_o/Desktop/CTA-BMS-Simulator/src
   python3 -m http.server 3000
   ```
2. **Open** `http://localhost:3000` in Chrome or Safari
3. **Sign in** with instructor credentials:
   - Operator: `cta_instructor`
   - Password: `bms2026`
   - This grants you **Engr** security level (full access)

---

## Application Overview

The simulator replicates two Honeywell BMS interfaces used at the Four Seasons Hotel NYC Downtown:

| Interface | Purpose | Route |
|-----------|---------|-------|
| **SymmetrE R410.2** | Graphical AHU operator display | `#/symmetre` |
| **EBI R700** | Point detail, history, alarms | `#/ebi/{pointId}` |
| **Alarm Summary** | All active/inactive alarms | `#/alarms` |
| **Schedule Screen** | Weekly + exception schedules | `#/schedule` |
| **Point Attribute Report** | Find overrides/faults | `#/reports` |
| **Instructor Dashboard** | View student submissions | `#/instructor` |

---

## Three Teaching Modes

### 1. Companion Mode (Instructor-Led)
- **Layout**: 70% BMS interface / 30% right panel with slides
- **Clock**: Paused — you advance slides manually
- **How to use**: Walk students through the 41-slide curriculum. Each slide loads a relevant scenario on the BMS interface. Students follow along on their own screens.
- **Best for**: First-time walkthroughs, structured lessons

### 2. Free Explore Mode (Self-Paced)
- **Layout**: 100% BMS interface (full width)
- **Clock**: Running at 60× speed by default (adjustable)
- **How to use**: Students pick from 14 predefined scenarios (normal operation, economizer lockout, simultaneous heat/cool, CO₂ faults, etc.) and investigate independently.
- **Best for**: Lab time, self-directed learning, practice

### 3. Capstone Mode (Assessment)
- **Layout**: 65% BMS interface / 35% worksheet panel
- **Clock**: Running (student controls speed)
- **How to use**: Students complete a 5-section written assessment while analyzing the live BMS. Auto-saves every 2 seconds. When finished, they export to PDF and submit.
- **Best for**: Final evaluation, graded assessments

---

## Instructor Workflow

### Before Class

1. Sign in as `cta_instructor`
2. Verify the simulator loads correctly (you should see the SymmetrE Station with AHU-4-4 schematic)
3. Test mode switching (use the mode selector buttons in the toolbar: 📖 Companion, 🔍 Explore, 📝 Capstone)

### During Class — Companion Mode

1. Select **Companion** mode
2. The right panel shows Slide 1/41
3. Click **Next →** to advance through the curriculum
4. Each slide shows:
   - Instructional text explaining what to observe
   - The BMS interface automatically loads the relevant scenario
5. Students should be signed in on their own machines (as `cta_student`) following along
6. Point type badges (AI/AO/BI/BO) appear on the AHU graphic when relevant slides are active

### During Class — Free Explore

1. Switch to **Free Explore** mode
2. Click **📋 Scenarios** to open the scenario selector
3. Choose a scenario (e.g., "Simultaneous Heating and Cooling")
4. The simulation jumps to the relevant time period and applies fault conditions
5. Students investigate using:
   - SymmetrE Station (AHU graphic, controls sidebar)
   - EBI Point Detail (click any point → history, alarms, events)
   - Alarm Summary (toolbar alarm button 🔔)
   - Point Attribute Report (find overrides)

### During Class — Capstone Assessment

1. **Unlock capstone** from the Instructor Dashboard (`#/instructor` or toolbar → Sign Off path):
   - Navigate to `#/instructor`
   - Click **🔓 Unlock Capstone**
   - Student tabs will detect the unlock flag
2. Students switch to **Capstone** mode
3. They complete 5 worksheet sections:
   - Section 1: Building Overview & Energy Performance
   - Section 2: BMS Data Analysis
   - Section 3: Fault Detection & Diagnosis
   - Section 4: LL97 Compliance Assessment
   - Section 5: Recommendations & Action Items
4. Each section has a prompt and a 2000-character text area
5. Auto-saves to their browser's localStorage
6. When complete, they click **Submit** → stored for your review

### After Class — Reviewing Submissions

1. Navigate to `#/instructor` (Instructor Dashboard)
2. See a list of all submitted worksheets (participant name + timestamp)
3. Click any submission to expand and read all 5 sections
4. Dashboard polls for new submissions every 5 seconds

---

## Key Features to Demonstrate

### SymmetrE Station (`#/symmetre`)
- **AHU Graphic**: Live airflow schematic with OA Damper, Preheat Coil, CHW Coil, Fan, Supply/Return Air, Zone temps
- **Controls Sidebar**: 9 collapsible sections with editable setpoints (white boxes = editable, grey = read-only, blue = manual override)
- **Outside Air Strip**: Live OAT, humidity, wetbulb, dewpoint, enthalpy from TMY3 weather data
- **Zone Tabs**: Switch between AHU-4-4 and AHU-4-6
- **Simultaneous Heat/Cool Warning**: Amber overlay when both PHT >20% and CHW >20%
- **LL97 Panel**: Running energy/emissions accumulator with compliance status

### EBI Point Detail (`#/ebi/{pointId}`)
- **General Tab**: Point metadata (type, units, range, COV)
- **History Tab**: Canvas trend chart with zoom/pan, period/interval selectors, multi-series overlay, CSV export
- **Alarms Tab**: Alarm configuration and 9-state icon (urgent/high × active/inactive × ack/unack)
- **Recent Events Tab**: Chronological log of value changes, mode transitions, alarm state changes

### Alarm Summary (`#/alarms`)
- Filter tree (All / AHU-4-4 / AHU-4-6 / Outdoor)
- Sortable columns (click header → ascending, click again → descending)
- 9-state alarm icons (flashing = active+unacknowledged)
- Right-click or button to acknowledge alarms

### Schedule Screen (`#/schedule`)
- Weekly schedule table (AHU-4-4 normal: weekday 08–18, AHU-9-2 fault: 24/7)
- Exception schedule (holidays)
- Insert/Modify/Delete buttons (Supv+ security required)

---

## Security Levels

| Level | Privileges |
|-------|-----------|
| ViewOnly | View screens only |
| AckOnly | + Acknowledge alarms |
| **Oper** (student) | + Write setpoints, override points |
| Supv | + Modify schedules |
| **Engr** (instructor) | + Configure points, access Instructor Dashboard |
| Mngr | + Manage accounts |

---

## 14 CTA Reference Guide Chapters

Available via the Chapter Index (accessible from mode toolbar):

1. What is a BMS?
2. BAS Architecture
3. Sensors and Input Devices
4. Actuators and Output Devices
5. Point Types
6. Setpoints, Alarms, and SOO
7. ASHRAE Standards (55, 62.1, 90.1, 36)
8. Data Availability
9. Common Operational Issues
10. Variable Frequency Drives
11. Free Cooling and Economizers
12. Building Documentation
13. Calibration
14. Troubleshooting Exercises (6-step framework)

---

## 6 Fault Detection Rules

The simulator evaluates these in real-time:

| ID | Fault | Priority | Condition |
|----|-------|----------|-----------|
| F-01 | Simultaneous heating and cooling | Urgent | PHT >20% AND CHW >20% |
| F-02 | Supply air temp deviation | High | \|SAT - Setpoint\| > 5°F |
| F-03 | AHU running unoccupied | High | Fan ON + Schedule OFF |
| F-04 | OA damper closed while occupied | Urgent | OAD <5% + Schedule ON |
| F-05 | Economizer not active when OAT permits | High | OAT <55°F + OAD <50% + CHW >20% |
| F-06 | CO₂ exceeds threshold | Urgent | CO₂ >800 ppm |

---

## Simulation Details

- **Data range**: May 1 – June 12, 2026 (1,017 hourly rows)
- **Weather**: TMY3 Central Park Observatory (8,760 hours)
- **Building**: Four Seasons Hotel NYC Downtown (365,000 sqft)
- **Points**: 27 BMS points across AHU-4-4, AHU-4-6, Outdoor, Cooling Tower
- **Speed options**: 1× (real-time), 60× (1 hour/minute), 3600× (1 hour/second), Pause

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Blank screen | Make sure you're serving via HTTP, not opening as file:// |
| "Sign On" won't load | Check browser console for script loading errors |
| Stale data after changes | Hard refresh (Cmd+Shift+R) clears Babel cache |
| localStorage full | Clear site data in browser settings |
| Student can't access Capstone | Instructor must click "Unlock Capstone" first |

---

## Student Account

Share these credentials with your class:
- **Operator**: `cta_student`
- **Password**: `bms2026`
- **Security Level**: Oper (can view, write setpoints, acknowledge alarms)
