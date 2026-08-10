# CTA BMS Simulator — Platform Requirements Document

## 1. Overview

The CTA BMS Simulator is a browser-based training platform that replicates two Honeywell Building Management System interfaces — **SymmetrE R410.2** (graphical AHU operator station) and **EBI R700** (Enterprise Buildings Integrator point detail). Built for the **Four Seasons Hotel NYC Downtown** (715,320 sqft), it uses real historical BMS data (27 points, May–June 2026) and TMY3 weather data from Central Park. The platform operates fully offline after initial page load.

---

## 2. User Roles

### 2.1 Student (cta_student / bms2026)
- **Security Level**: Oper
- **Can**: View all screens, adjust setpoints, issue commands, acknowledge alarms, navigate freely, complete capstone worksheet
- **Cannot**: Modify schedules, configure points, access Instructor Dashboard

### 2.2 Instructor (cta_instructor / bms2026)
- **Security Level**: Engr
- **Can**: Everything a student can do, plus modify schedules, configure points, access Instructor Dashboard, unlock/lock Capstone mode, view student submissions

### 2.3 Security Level Hierarchy
| Level | Cumulative Privileges |
|-------|----------------------|
| ViewOnly | Read-only access to all screens |
| AckOnly | + Acknowledge alarms |
| Oper | + Write setpoints, override points, issue commands |
| Supv | + Modify weekly/exception schedules |
| Engr | + Configure points, access Instructor Dashboard, unlock Capstone |
| Mngr | + Manage operator accounts |

---

## 3. Screens & Navigation

### 3.1 Sign On Screen (`#/auth`)
- Honeywell EBI-style dialog with operator name (max 32 chars) and masked password (max 64 chars)
- Demo credentials displayed below form
- Error message on invalid credentials; password cleared on failure
- Successful login navigates to SymmetrE Station within 1 second

### 3.2 SymmetrE Station (`#/symmetre` or `#/symmetre/{ahuId}`)
The primary BMS operator interface containing:
- Title bar, menu bar, toolbar, content area, status bar
- AHU Graphic (center), Controls Sidebar (left), Zone Tabs + OA Strip (top), LL97 Panel (bottom-left)
- Mode panel (right, 30% or 35%) when in Companion or Capstone mode

### 3.3 EBI Point Detail (`#/ebi/{pointId}/{tab}`)
Detailed point inspection with 4 tabs:
- General, Alarms, History, Recent Events

### 3.4 Alarm Summary (`#/alarms`)
Centralized alarm list with filter tree and sortable columns

### 3.5 Schedule Manager (`#/schedule`)
Weekly and exception schedule viewing/editing for AHU systems

### 3.6 Point Attribute Report (`#/reports`)
Search for points in abnormal states (Manual, Out of Service, Alarm Suppressed)

### 3.7 Instructor Dashboard (`#/instructor`)
View submitted capstone worksheets, unlock/lock Capstone mode

---

## 4. SymmetrE Station UI Components

### 4.1 App Chrome (Outer Shell)
| Element | Contents |
|---------|----------|
| Title Bar | "SymmetrE R410.2 — Station [operator_name]" + window controls |
| Menu Bar | Station, View, Action, Help, Sign Off |
| Toolbar | Back, Forward, Reload, Home, System Menu, Alarms, Events + Mode Selector + Chapters |
| Status Bar | Simulation timestamp │ Selected point BACnet path │ "Honeywell SymmetrE R410.2" |

**Menu Actions:**
- Station → AHU-4-4 Overview, AHU-4-6 Overview, Schedule Manager
- View → Alarm Summary, Point Attribute Report, Instructor Dashboard
- Action → Start/Pause Simulation, Speed 1×/60×/3600×
- Help → About dialog
- Sign Off → Ends session, returns to auth screen

> **Note:** Edit and Configure menus were removed as they had no functional actions in the simulator context.

### 4.2 Zone Tabs & Outside Air Strip
- **Tabs**: 💧 Zone Overview, 🌀 AHU-4-4, 🌀 AHU-4-6
- **OA Strip**: OA Temp (°F), OA Humidity (%RH), OA Wetbulb (°F), OA Dewpoint (°F), OA Enthalpy (BTU/lb)
- Values sourced from TMY3 weather data via simulation row interpolation
- **OA Strip visibility**: The OA Strip is ONLY visible on the SymmetrE Station screen, not on EBI or other screens
- **Troubleshooting**: If OA Strip shows "--.-" values on initial load, toggle simulation speed to 60× briefly to initialize the weather interpolation

### 4.3 Controls Sidebar (Left, 280px, collapsible)
**9 Collapsible Sections:**
1. Schedule — Run Schedule status
2. System Settings — System Mode, Occupancy
3. Supply Air Temp Control — SAT Setpoint, SAT Actual
4. Plenum Air Temp Control — Preheat Coil Valve
5. Economizer Control — OA Damper Position
6. OA Damper Control — Min/Max Damper Position
7. Fan Tracking — SA Fan Speed, Return Fan Speed (AHU-4-4 only)
8. Fire Alarm System — Fire Alarm Status
9. Alarms — Active alarm count + link to Alarm Summary

**Field Styling:**
- White box: Operator-editable (AO/BO at Oper+ security)
- Grey box: Read-only (AI/BI or insufficient security)
- Blue box: Manual Override active

**Edit Behavior**: Click → input mode → Enter/blur validates [min, max] → PointRegistry.setValue()

**ASHRAE References**: Expandable callout cards for Standards 55, 62.1, 90.1, 36

### 4.4 AHU Graphic (Center)
Isometric airflow diagram showing:
- Outside Air Intake with Damper Visual (angled blades indicating position)
- Filters
- Preheat Coil (PHT) with valve position %
- Chilled Water Coil (CHW) with valve position %
- Supply Fan / VFD with Running/Stopped indicator and speed %
- Supply Air path with temperature
- Zone with Return Air Temperature and CO₂ (ppm)
- Branch Static Pressure (in.W.C.)
- Return Air path

**Zone Subtitle & Label:**
Each AHU graphic displays a subtitle below the main title indicating which zone/space the AHU serves, plus a labeled zone box on the graphic:
- **AHU-4-4**: Subtitle "Serves: Hotel Guest Rooms — Floors 4–12", zone box labeled "GUEST ROOMS"
- **AHU-4-6**: Subtitle "Serves: Meeting Rooms & Conference — Level 4", zone box labeled "MEETING ROOMS"

**Interactions:**
- Hover any point → show point type badge (AI/AO/BI/BO, color-coded)
- Click a point value → navigate to EBI Point Detail (`#/ebi/{address}/general`)

### 4.5 Simultaneous Heat/Cool Warning
- Amber overlay appears when PHT Valve >20% AND CHW Valve >20%
- Shows ⚠ "SIMULTANEOUS HEATING AND COOLING" banner
- Disappears when either valve ≤20%

### 4.6 LL97 Compliance Panel
Displays accumulator values updated each simulation hour:
- Total Energy (kBTU)
- Electric (kWh)
- Steam (kBTU)
- GHG Emissions (mtCO₂e)
- Compliance status badge (Green=COMPLIANT, Amber=APPROACHING LIMIT >75%, Red=NON-COMPLIANT)
- Progress bar showing % of LL97 limit consumed

### 4.7 Mode Selector (Toolbar)
Three mode buttons + Chapters dropdown:
- 📖 Companion (70%/30% split, clock paused)
- 🔍 Explore (100% width, clock at 60×)
- 📝 Capstone (65%/35% split, worksheet panel)
- 📚 Chapters → dropdown with 14-chapter navigation index

### 4.8 Collapse Controls
- **Left sidebar**: ◀/▶ toggle in header to collapse to 32px strip
- **Right panel** (Companion/Capstone): ▶/◀ circular toggle to collapse to 40px strip

---

## 5. EBI Point Detail Components

### 5.1 Breadcrumb Navigation
Format: `System > Subsystem > Point Name`
- Clicking System → SymmetrE home
- Clicking Subsystem → that AHU graphic
- URL format uses BACnet address with `@` character (e.g., `#/ebi/AI301@DEV4004/general`)
- The router decodes URL-encoded `%40` back to `@` for proper PointRegistry lookup

### 5.2 Left Panel (Point Sidebar)
- Vertical bar chart (cyan fill on black background) showing present value as % of range
- Status dots: Alarm (red), Fault (amber), Overridden (purple), Out-of-Service (gray)
- Present Value with engineering units
- Mode indicator: "Auto" with green text on white background / "Manual" with PURPLE background

**Color Conventions (per Lev's feedback):**
- Purple / reddish-purple = Manual Override
- Red = Alarm / Fault
- Gray = Offline / Bad sensor
- Black = Normal

### 5.3 General Tab
Read-only metadata fields:
- Name, BACnet Address, Point Type (AI/AO/BI/BO)
- Engineering Units, Range (min–max), COV Increment, Sensor Offset
- Binary points: omit Range, COV, Sensor Offset

### 5.4 History Tab
- Canvas 2D trend chart (black background, cyan area fill)
- Period selector: 2 Weeks, 4 Weeks, 3 Months, Custom
- Interval selector: 6 min avg, 1 hr avg, 8 hr avg, 1 day avg
- Multi-series overlay (up to 4 sensors: cyan, green, yellow, magenta)
- "Add sensor" button to select additional points
- Scroll/zoom via mouse wheel + drag
- Data table below chart (newest-first, max 200 rows)
- "Export to CSV" button

### 5.5 Alarms Tab
- Alarm configuration: type (PV High/Low/Deviation/Rate of Change), limit, deadband, priority, enable state
- Current alarm state with 9-state icon
- "No alarms configured" message when no rules apply

### 5.6 Recent Events Tab
- Chronological event log (max 200 entries, newest-first)
- Event types: Value Change, Mode Transition, Alarm State Change
- Each entry: Timestamp, Event Type badge, Previous Value, New Value
- Events are tracked live as state changes occur during simulation playback

**Seed Events on Mount:**
- If point is already in Manual mode when the tab mounts, a seed "Mode Transition: Auto → Manual" event is shown
- If point has an active alarm when the tab mounts, a seed "Alarm State Change" event is shown

---

## 6. Alarm Summary Screen

### 6.1 Layout
- Left: Location filter tree (All Alarms, AHU-4-4, AHU-4-6, Outdoor)
- Right: Sortable alarm table + footer

### 6.2 Alarm Table Columns
Icon, Date/Time, Source, Condition, Operator, Action, Priority, Description, Value

### 6.3 9-State Alarm Icons
| Priority | Active + Unack | Active + Ack | Inactive + Unack |
|----------|---------------|-------------|-----------------|
| Urgent (red) | Filled + blink animation | Filled solid (no animation) | Outline only |
| High (amber) | Filled + blink animation | Filled solid (no animation) | Outline only |
| Low (blue) | Filled + blink animation | Filled solid (no animation) | Outline only |

**Flashing Behavior:**
- Unacknowledged alarms use a distinct blink animation (opacity oscillates 100% → 15% every 0.8s)
- Acknowledged alarms show solid filled with no animation
- This makes the state change clearly visible when an alarm is acknowledged

### 6.4 Interactions
- Click column header → sort ascending; click again → descending
- Click alarm row → select
- Right-click → context menu (Acknowledge, Close)
- ✓ Acknowledge button in toolbar (requires AckOnly+ security)
- ← Back button returns to SymmetrE Station
- Click a Source address in the alarm table → navigates to EBI Point Detail for that point
- Acknowledge state persists across the 2-second alarm refresh cycle (not reset on refresh)

### 6.5 Pre-loaded Faults (6 records)
| Fault | Source Address | Description |
|-------|---------------|-------------|
| F-01 | AO103@DEV4004 | Preheat Coil Valve — Simultaneous heating and cooling |
| F-02 | AI301@DEV4004 | Supply Air Temp — SAT deviation from setpoint |
| F-03 | BI601@DEV4004 | Run Schedule — AHU running unoccupied |
| F-04 | AO104@DEV4004 | OA Damper — Closed during occupied hours |
| F-05 | AI701@DEV5000 | Outside Air Temp — Economizer inactive when OAT permits |
| F-06 | AI401@DEV4004 | Return Air CO₂ — CO₂ exceeds threshold |

---

## 7. Schedule Manager

### 7.1 Navigation Tree
- AHU-4-4 Schedule (normal)
- AHU-4-6 Schedule (normal)
- AHU-9-2 Schedule (fault — red indicator dot)

### 7.2 Weekly Schedule Tab
- Table: Day, Start Time, End Time, Value (Active/Inactive)
- Normal pattern: weekday 08:00–18:00
- Fault pattern (AHU-9-2): 24/7 active, red row highlighting
- Insert / Modify / Delete buttons (Supv+ required)
- Modal dialogs for insert/modify

### 7.3 Exception Schedule Tab
- Table: Date, Description, Value (Override Active/Inactive)
- Pre-loaded: 8 US holidays
- Add / Delete buttons (Supv+ required)

---

## 8. Three Pedagogical Modes

### 8.1 Companion Mode (Instructor-Led)
- **Layout**: 70% main BMS + 30% slide panel
- **Clock**: Paused on activation
- **41 Slides**: Each with title, instructional prompt, associated scenario
- **Navigation**: ← Previous / Next → buttons with bounds checking
- **Scenario loading**: Auto-loads scenario on slide advance (jumps simulation row + applies point overrides)
- **Badge persistence**: Point type badges shown on AHU graphic for slides covering BACnet types (slides 10, 11, 13, 17)
- **Paused indicator**: Yellow pulsing dot + "Simulation paused — advance slides to progress"

### 8.2 Free Explore Mode (Self-Paced)
- **Layout**: 100% main BMS width
- **Clock**: 60× speed default (adjustable: pause, 1×, 60×, 3600×)
- **Scenario Selector**: 14 predefined scenarios in card grid (click to load)
- **Speed Controls**: Button group in toolbar
- **Confirmation**: Green banner "Scenario loaded: {name}" for 4 seconds
- **Chapter Index**: Always available at bottom panel

### 8.3 Capstone Mode (Assessment)
- **Layout**: 65% main BMS + 35% worksheet panel
- **5 Sections**:
  1. Building Overview & Energy Performance
  2. BMS Data Analysis
  3. Fault Detection & Diagnosis
  4. LL97 Compliance Assessment
  5. Recommendations & Action Items
- **Per section**: Title, instructional prompt, textarea (max 2000 chars), character counter
- **Auto-save**: localStorage, 2-second debounce after last keystroke
- **Progress**: X/5 sections complete badge + progress bar
- **Section nav**: Sidebar with ✓/number indicators + prev/next arrows
- **Troubleshooting Framework**: Ch. 14 reference card below worksheet content
- **Storage warning**: Yellow banner if localStorage unavailable
- **Footer**: Auto-save status + section navigation

---

## 9. Simulation Engine

### 9.1 Data Playback
- 1,017 hourly rows (May 1, 2026 00:00 – June 12, 2026 08:00)
- Linear interpolation between adjacent hourly samples
- requestAnimationFrame-based tick loop

### 9.2 Speed Controls
| Speed | Rate | Description |
|-------|------|-------------|
| Pause | 0 | Clock halted |
| 1× | 1 sim hour / 3600 real seconds | Real-time |
| 60× | 1 sim hour / 60 real seconds | 1 minute = 1 hour |
| 3600× | 1 sim hour / 1 real second | Fast forward |

### 9.3 Jump to Date
- Accepts any Date within May 1 – June 12, 2026
- Rejects out-of-range dates with error
- Notifies all listeners of new position

### 9.4 End of Data
- Pauses automatically at row 1017
- Can be restarted (resets to row 1)

---

## 10. Point Registry

### 10.1 Structure (27 points)
- **AHU-4-4** (10 points): SA Fan Speed, CHW Coil Valve, PHT Coil Valve, OA Damper, RA Temp, SA Temp, RA CO₂, Branch Static, Run Schedule, RA Fan Speed
- **AHU-4-6** (11 points): SA Fan Speed, CHW Coil Valve, PHT Coil Valve, OA Damper, RA Temp, SA Temp, RA CO₂, RA Humidity, Branch Static, Run Schedule, Meeting Room 1 Temp
- **Outdoor** (5 points): OA Temp, OA Dewpoint, OA Humidity, OA Wetbulb, OA Enthalpy
- **Cooling Tower** (1 point): CT-02 Run Status
- **Pedagogical variants** (2): Corrected CO₂ (169 rows), Edited RunSchedule (169 rows)

### 10.2 Point Metadata
BACnet address (format: [type][instance]@DEV[device]), name, type (AI/AO/BI/BO), units, min, max, COV increment, sensor offset, subsystem

### 10.3 COV Filtering
- Analog points: notify subscribers only when |delta| ≥ covIncrement
- Binary points: notify on any change
- Manual mode: interpolation skipped (operator-controlled values preserved)

---

## 11. Fault Detection Engine

### 11.1 Six Rules (evaluated every tick)
| Rule | Description | Priority | Trigger |
|------|-------------|----------|---------|
| F-01 | Simultaneous heating and cooling | Urgent | PHT >20% AND CHW >20% |
| F-02 | Supply air temp deviation | High | \|SAT - Setpoint\| > 5°F |
| F-03 | AHU running unoccupied | High | Fan ON + Schedule OFF |
| F-04 | OA damper closed during occupied | Urgent | OAD <5% + Schedule ON |
| F-05 | Economizer not active when OAT permits | High | OAT <55°F + OAD <50% + CHW >20% |
| F-06 | CO₂ exceeds threshold | Urgent | CO₂ >800 ppm |

### 11.2 Behavior
- Condition TRUE + no active alarm → generate new alarm
- Condition FALSE + active alarm → transition to inactive (preserve ack state)
- Never generates duplicates for same rule

---

## 12. Weather & Energy Data

### 12.1 TMY3 Weather (Central Park Observatory)
- 8,760 hourly rows (full year)
- Fields: hour, dryBulb (°F), dewPoint (°F), relHumidity (%), wetBulb (°F), enthalpy (BTU/lb)
- Mapped to simulation rows: Row 1 = TMY3 index 2880 (May 1, 00:00)

### 12.2 LL84 Building Constants (Four Seasons Hotel)
- Annual site energy: 58,970,483 kBTU
- Annual electric: 7,807,556 kWh
- Annual steam: 31,986,007 kBTU
- Annual GHG: 5,038.5 mtCO₂e
- Gross floor area: 715,320 sqft
- Energy Star Score: 34 (2023)
- Site EUI: 82.4 kBTU/sqft (2023)

### 12.3 LL97 Accumulator
- Increments each simulated hour: hourly rate = annual / 8,760 × seasonal factor
- Seasonal factor: 1.0 at 55°F base, increases with |OAT - 55°F| deviation (range 0.7–1.5)
- Compliance check: accumulated GHG vs. limit (15.0 kgCO₂e/sqft × 715,320 sqft)

### 12.4 Peer Benchmarks (4 buildings)
- Luxury Hotel (Peer A): 8.07 kgCO₂e/sqft, compliant 2024, non-compliant 2030
- Mixed-Use Tower (Peer B): 6.23 kgCO₂e/sqft
- Class A Office (Peer C): 9.53 kgCO₂e/sqft, non-compliant 2024
- Residential High-Rise (Peer D): 4.86 kgCO₂e/sqft

---

## 13. 14 Scenarios (Free Explore)

| # | Scenario | Start Row | Description |
|---|----------|-----------|-------------|
| 1 | Normal Summer Operation | 240 | Typical daytime cooling, economizer active |
| 2 | Economizer Lockout | 480 | High OAT, OA damper at minimum |
| 3 | Simultaneous Heat + Cool | 300 | Fault: PHT and CHW both open |
| 4 | Manual Override Active | 22 | RunSchedule forced during unoccupied |
| 5 | CO₂ Sensor Fault | 250 | CO₂ < 100 ppm (sensor failure) |
| 6 | PHT Valve Stuck | 150 | Valve at ~25% for 3+ hours |
| 7 | Free Cooling Opportunity | 50 | OAT < 55°F, economizer should open |
| 8 | Cooling Tower Fault | 60 | CT at 100% despite mild OAT |
| 9 | High Humidity | 500 | Elevated return air humidity |
| 10 | Nighttime Override | 3 | AHU during unoccupied hours |
| 11 | Weekend Scheduling Fault | 144 | 24/7 schedule (no unoccupied) |
| 12 | VFD Modulation (Healthy) | 260 | Fan speed 40–70% normal |
| 13 | Peak Cooling Load | 750 | Max summer, CHW near 100% |
| 14 | Transition Season | 100 | Mild conditions, economizer swings |
| 15 | AHU-4-6 Normal Cooling (No Fault) | 300 | PHT closed, CHW at 60% — no simultaneous heat/cool |

---

## 14. 14-Chapter CTA Reference Guide

| Ch | Title | Route | ASHRAE |
|----|-------|-------|--------|
| 1 | What is a BMS? | #/symmetre | — |
| 2 | BAS Architecture | #/symmetre | — |
| 3 | Sensors and Input Devices | #/ebi | 62.1 |
| 4 | Actuators and Output Devices | #/ebi | — |
| 5 | Point Types | #/ebi | — |
| 6 | Setpoints, Alarms, and SOO | #/alarms | 55 |
| 7 | ASHRAE Standards | #/symmetre | 55, 62.1, 90.1, 36 |
| 8 | Data Availability | #/ebi | — |
| 9 | Common Operational Issues | #/alarms | 90.1 |
| 10 | Variable Frequency Drives | #/symmetre | 90.1 |
| 11 | Free Cooling and Economizers | #/symmetre | 90.1 |
| 12 | Building Documentation | #/schedule | — |
| 13 | Calibration | #/ebi | — |
| 14 | Troubleshooting Exercises | #/capstone | 36 |

---

## 15. Export Capabilities

### 15.1 CSV Export (from EBI History Tab)
- Columns: Date, Time, Hour_Number, Month, OA_Temp_F, HDH, CDH, [sensor name], [unit]
- UTF-8 with BOM (Excel compatible)
- Filename: `[point_name]_[start_date]_[end_date].csv`
- Supports interval averaging (1hr, 8hr, 24hr)

### 15.2 PDF Export (from Capstone)
- A4 portrait document via jsPDF
- Header: "CTA BMS Training — Capstone Assessment", student name, date
- 5 sections with titles, prompts (italic gray), and student responses
- Auto-pagination for long responses
- Filename: `CTA_Capstone_Worksheet_[student_name].pdf`

---

## 16. Instructor Workflow

### 16.1 Before Class
1. Sign in as `cta_instructor`
2. Verify simulator loads (SymmetrE Station with AHU-4-4)
3. Test mode switching

### 16.2 During Class — Companion Mode
1. Select Companion mode (simulation pauses)
2. Advance through 41 slides (each loads relevant scenario)
3. Students follow on their own machines

### 16.3 During Class — Free Explore
1. Switch to Explore mode
2. Open scenario selector, choose scenario
3. Students investigate independently

### 16.4 Capstone Assessment
1. Navigate to `#/instructor`
2. Click 🔓 Unlock Capstone
3. Students switch to Capstone mode and complete 5 sections
4. Students submit when complete

### 16.5 Reviewing Submissions
1. Navigate to `#/instructor`
2. View list of submissions (name + timestamp)
3. Click any submission to expand all 5 sections
4. Dashboard auto-refreshes every 5 seconds

---

## 17. Student Workflow

### 17.1 Getting Started
1. Sign in as `cta_student` / `bms2026`
2. Arrive at SymmetrE Station in Companion Mode
3. Follow instructor's slide progression

### 17.2 Available Actions (Oper level)
- Navigate between AHU-4-4 and AHU-4-6 via zone tabs
- Click points on AHU graphic → EBI Point Detail
- Expand/collapse Controls Sidebar sections
- Edit white-box fields (setpoints): click → type → Enter
- View alarm summary (toolbar 🔔 button)
- Acknowledge active alarms
- View point history with zoom/pan/multi-series overlay
- Export historical data to CSV
- View schedules (read-only; cannot modify)
- Run Point Attribute Report
- Switch between Companion/Explore/Capstone modes
- Select scenarios in Free Explore mode
- Control simulation speed (when in Explore mode)
- Complete 5-section capstone worksheet
- Export worksheet to PDF
- Submit worksheet for instructor review

### 17.3 Cannot Do (Oper level)
- Modify weekly/exception schedules (Supv+ required)
- Access Instructor Dashboard (Engr+ required)
- Unlock Capstone mode (Engr+ required)

---

## 18. ASHRAE Standard References

| Standard | Title | Context |
|----------|-------|---------|
| ASHRAE 55 | Thermal Comfort | Zone temperature setpoints, return air temp |
| ASHRAE 62.1 | Ventilation | OA damper control, CO₂ monitoring, minimum ventilation |
| ASHRAE 90.1 | Energy Efficiency | Economizer control, simultaneous heat/cool limits |
| ASHRAE 36 | High-Performance Sequences | Fan tracking, cooling tower sequencing, AHU control logic |

Each appears as an expandable callout card in the Controls Sidebar with relevance notes and screen context.

---

## 19. Technical Constraints

- **Runtime**: React 18 (UMD), Babel standalone (JSX transform), Tailwind CSS CDN
- **No bundler**: All files loaded via `<script>` tags in index.html
- **Fully offline**: No network requests after initial page load
- **Data**: All 27 point arrays + TMY3 (8,760 rows) baked into JavaScript modules
- **Storage**: localStorage for capstone auto-save, submissions, and capstone unlock flag
- **Browsers**: Chrome, Firefox, Safari, Edge (current stable)
- **Serving**: Static file server (e.g., `python3 -m http.server 3000`)
