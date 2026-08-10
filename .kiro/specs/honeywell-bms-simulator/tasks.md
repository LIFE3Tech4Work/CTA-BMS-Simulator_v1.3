# Implementation Plan: Honeywell BMS Simulator

## Overview

A single-page React/JSX browser application replicating Honeywell SymmetrE R410.2 and EBI R700 BMS interfaces for CTA training. Implementation proceeds in dependency order: raw data conversion → simulation engine → UI chrome → EBI detail screens → alarm/schedule/report screens → pedagogical modes → integration wiring.

## Tasks

- [x] 1. Data conversion and static data layer
  - [x] 1.1 Convert 27 BMS Excel exports to JavaScript arrays
    - Write a Node.js conversion script that reads each `.xlsx` file from `BMS Exports/` and outputs a JS module in `src/data/points/` with the point metadata (address, name, type, units, min, max, covIncrement, sensorOffset, subsystem) and a `data` array of 1,017 numeric values
    - Include the two pedagogical variants: corrected CO2 series (169 rows, May 13–20) and edited RunSchedule (169 rows, May 13–20, all values = 1)
    - Export a `POINT_CATALOG` index from `src/data/points/index.js` listing all 27 points with their metadata
    - _Requirements: 16.6, 23.1, 23.2, 23.3_

  - [x] 1.2 Parse TMY3 EPW file to JavaScript array
    - Write a Node.js script that reads the EPW file from `BMS TMY/` and outputs `src/data/weather/tmy3_central_park.js` with 8,760 rows containing: hour, dryBulb, dewPoint, relHumidity, wetBulb, enthalpy
    - _Requirements: 24.1_

  - [x] 1.3 Extract LL84 constants and peer benchmarks from Excel
    - Parse `LL84 Data Four Seasons Hotel NYC Downtown (1).xlsx` and output `src/data/building/ll84_constants.js` with annual site energy, electric, steam, GHG, floor area, and year-over-year data
    - Create `src/data/building/peer_benchmarks.js` with at least 4 archetype building profiles including LL97 carbon intensity limits
    - _Requirements: 24.2, 24.3_

  - [x] 1.4 Create reference data modules
    - Create `src/data/reference/companionSlides.js` with 41 slide objects (slide number, title, prompt text, scenario reference)
    - Create `src/data/reference/scenarios.js` with 14 Free Explore scenario definitions (id, name, description, startRow, pointOverrides)
    - Create `src/data/reference/faultRules.js` with 6 fault rule definitions (F-01 through F-06) including condition functions
    - Create `src/data/reference/chapters.js` with 14 CTA Reference Guide chapter index entries
    - _Requirements: 17.1, 20.3, 21.3, 26.1, 26.4_

- [x] 2. Project scaffolding and entry point
  - [x] 2.1 Create index.html with React, ReactDOM, Babel standalone, and Tailwind CDN
    - Single entry point that loads the JSX app via Babel standalone transform
    - Include jsPDF library bundled or loaded from local file
    - Set up the full directory structure matching the design spec file tree
    - _Requirements: 27.1, 27.2, 27.4_

  - [x] 2.2 Create App.jsx with root context providers and hash router
    - Wrap the app in 5 context providers: AuthContext, PointRegistryContext, SimulationContext, ModeContext, AlarmContext
    - Implement lightweight hash-based router listening to `hashchange` events supporting routes: `#/auth`, `#/symmetre`, `#/symmetre/:ahuId`, `#/ebi/:pointId`, `#/ebi/:pointId/:tab`, `#/alarms`, `#/schedule`, `#/reports`, `#/instructor`
    - Default route to `#/auth` on initial load
    - _Requirements: 27.5_

- [x] 3. Simulation engine core
  - [x] 3.1 Implement PointRegistry.js reactive store
    - Create `src/simulation/PointRegistry.js` with Map-based point storage keyed by BACnet address
    - Implement subscribe/unsubscribe pattern for UI components, getValue, setValue (with source parameter), getMetadata, getAll, and query(filter) methods
    - Load all 27 point modules on initialization and populate the registry
    - _Requirements: 23.2, 23.4_

  - [x] 3.2 Implement Engine.js simulation clock
    - Create `src/simulation/Engine.js` with tick loop using requestAnimationFrame or setInterval
    - Implement speed control (1x, 60x, 3600x, pause), start/pause/setSpeed methods
    - Implement jumpToDate with range validation (May 1–June 12, 2026 only)
    - Implement linear interpolation between adjacent hourly samples: `data[i-1] + f * (data[i] - data[i-1])`
    - Fire tick events to all subscribers with (rowIndex, interpolationFraction)
    - Auto-pause at row 1017 with end-of-data indication
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 17.3_

  - [ ]* 3.3 Write property tests for simulation engine
    - **Property 17: Speed Change Continuity** — verify playback continues from current row on speed change
    - **Property 18: Date Jump Range Validation** — verify out-of-range dates are rejected
    - **Property 19: Linear Interpolation** — verify correct interpolation formula between adjacent samples
    - **Validates: Requirements 16.3, 16.5, 17.3**

  - [x] 3.4 Implement FaultEngine.js
    - Create `src/simulation/FaultEngine.js` that evaluates 6 fault rules on every tick
    - Generate alarm entries when conditions become true (no duplicates for already-active alarms)
    - Transition alarms to inactive when conditions clear, preserving acknowledgment state
    - _Requirements: 17.1, 17.2, 17.4, 17.5_

  - [ ]* 3.5 Write property tests for fault engine
    - **Property 20: Fault Alarm Generation** — verify exactly one alarm generated per new fault
    - **Property 21: Fault Clearing Preserves Acknowledgment** — verify inactive transition preserves ack state
    - **Validates: Requirements 17.2, 17.4, 17.5**

  - [x] 3.6 Implement ThermalModel.js
    - Create `src/simulation/ThermalModel.js` with exponential approach drift function
    - Enforce max drift rate of 2°F per simulated minute
    - Settle within 30 simulated minutes to target (within 0.5°F)
    - Handle mid-transition scenario changes by restarting from current intermediate value
    - _Requirements: 19.1, 19.2, 19.3_

  - [ ]* 3.7 Write property tests for thermal model
    - **Property 24: Thermal Drift Rate Cap** — verify drift never exceeds 2°F/min
    - **Property 25: Thermal Settling Convergence** — verify convergence within 30 minutes
    - **Validates: Requirements 19.1, 19.2**

  - [x] 3.8 Implement TMY3Projector.js and LL97 Accumulators
    - Create `src/simulation/TMY3Projector.js` for weather data lookup by hour
    - Create `src/simulation/HDHCDHCounter.js` for Heating/Cooling Degree Hour accumulation
    - Create LL97 accumulator logic (totalEnergy, electric, steam, GHG) with tick increment and reset on scenario load
    - _Requirements: 18.1, 18.2, 18.3_

  - [ ]* 3.9 Write property tests for LL97 accumulators
    - **Property 22: LL97 Accumulator Increment** — verify correct hourly increment from point data and LL84 constants
    - **Property 23: LL97 Accumulator Reset** — verify all four values zero after reset
    - **Validates: Requirements 18.2, 18.3**

- [x] 4. Checkpoint - Ensure all engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Authentication layer
  - [x] 5.1 Implement SignOn.jsx and AuthContext
    - Create `src/auth/SignOn.jsx` with Honeywell-style sign-on dialog: operator name (max 32 chars), masked password (max 64 chars)
    - Implement credential validation against demo accounts: "cta_student"/"bms2026" → Oper, "cta_instructor"/"bms2026" → Engr
    - Display error message and clear password on invalid credentials
    - Create `src/auth/AuthContext.js` with security level state and privilege check methods (canWrite, canAcknowledge, canModifySchedules, canConfigurePoints, canManageAccounts)
    - Navigate to `#/symmetre` on successful login within 1 second
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 5.2 Write property tests for authentication
    - **Property 1: Invalid Credentials Rejection** — verify any non-demo credentials are rejected
    - **Property 2: Security Level Privilege Hierarchy** — verify higher levels include all lower-level privileges
    - **Validates: Requirements 1.3, 1.5**

- [x] 6. SymmetrE Station UI
  - [x] 6.1 Implement AppChrome.jsx for SymmetrE Station
    - Create `src/ui/symmetre/AppChrome.jsx` with title bar, menu bar (Station, Edit, View, Action, Configure, Help, Sign Off), toolbar (Back, Forward, Reload, Home, System Menu, Alarms, Events), and status bar
    - Create `src/ui/symmetre/BottomStatusBar.jsx` displaying simulation clock timestamp, selected point BACnet path, and "Honeywell SymmetrE R410.2" text
    - Sign Off navigates to Auth_Screen; Alarms toolbar button navigates to `#/alarms`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9_

  - [x] 6.2 Implement ZoneTabs.jsx and Outside Air data strip
    - Create `src/ui/symmetre/ZoneTabs.jsx` with water droplet icon and fan icons for AHU-4-4 and AHU-4-6
    - Default to AHU-4-4 on first load; highlight active tab
    - Implement Outside Air data strip showing live OAT, humidity, wetbulb, dewpoint, enthalpy with 1 decimal precision, updated on each simulation tick
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4_

  - [ ]* 6.3 Write property test for OA data strip
    - **Property 3: OA Data Strip Values Match Simulation Row** — verify interpolated values match display at any row/fraction
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 6.4 Implement ControlsSidebar.jsx
    - Create `src/ui/symmetre/ControlsSidebar.jsx` with dark charcoal background, 9 collapsible sections: Schedule, System Settings, Supply Air Temp Control, Plenum Air Temp Control, Economizer Control, OA Damper Control, Fan Tracking, Fire Alarm System, Alarms
    - Implement white boxes (editable), grey boxes (read-only/insufficient security), blue boxes (manual override)
    - Validate operator input against point min/max range; reject out-of-range with error tooltip
    - Update Point Registry on valid value submission within 1 second
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 6.5 Write property tests for controls sidebar
    - **Property 4: Field Box Styling by State and Security** — verify correct box color for any point/security/override combination
    - **Property 5: Out-of-Range Input Rejection** — verify values outside [min, max] are rejected
    - **Validates: Requirements 5.3, 5.4, 5.6**

  - [x] 6.6 Implement AHUGraphic.jsx
    - Create `src/ui/symmetre/AHUGraphic.jsx` with isometric airflow diagram showing OA Plenum, Filters, Preheat Coil, CHW Coil, VFD/Fan, Return Air path, Supply Air path, Zone temps
    - Display live point values with engineering units, updated on each simulation tick
    - Implement hover badge (AI/AO/BI/BO) showing within 200ms and hiding within 200ms
    - Indicate binary component states (fan running/stopped, dampers open/closed)
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 28.1, 28.2_

  - [x] 6.7 Implement SimultaneousHeatCool.jsx overlay
    - Create `src/ui/symmetre/SimultaneousHeatCool.jsx` amber warning overlay visible when PHT > 20% AND CHW > 20%
    - Remove overlay when either value falls to 20% or below
    - _Requirements: 6.4_

  - [ ]* 6.8 Write property test for simultaneous heat/cool
    - **Property 6: Simultaneous Heat/Cool Warning** — verify overlay visibility for any PHT/CHW value pair
    - **Validates: Requirements 6.4**

- [x] 7. EBI Point Detail screens
  - [x] 7.1 Implement EBI AppChrome.jsx with breadcrumb and tab bar
    - Create `src/ui/ebi/AppChrome.jsx` with breadcrumb navigation (System > Subsystem > Point Name derived from BACnet address) and status bar showing "Honeywell | EBI R700"
    - Implement tab bar with 6 tabs: General, Command Priorities, Alarms, History, Recent Events, Advanced
    - Clicking breadcrumb segments navigates to corresponding hierarchy level
    - _Requirements: 2.7, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 7.2 Write property test for breadcrumb derivation
    - **Property 7: Breadcrumb Path Derivation** — verify correct hierarchical path for any point's BACnet address
    - **Validates: Requirements 7.2**

  - [x] 7.3 Implement PointSidebar.jsx (left panel)
    - Create `src/ui/ebi/PointSidebar.jsx` with vertical bar chart (black bg, cyan fill), status dots (Alarm, Fault, Overridden, Out-of-Service), present value with units, and mode indicator
    - Hollow gray circles when state inactive; filled colored circles when active (red/amber/amber/gray)
    - Amber background + "Manual" text when overridden; "Auto" text with no highlight when in auto
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 7.4 Write property test for status dots
    - **Property 8: Status Dot Rendering** — verify correct rendering for any combination of boolean states
    - **Validates: Requirements 8.2, 8.3, 8.4**

  - [x] 7.5 Implement GeneralTab.jsx
    - Create `src/ui/ebi/GeneralTab.jsx` displaying point metadata as read-only labels
    - For analog points (AI/AO): name, address, type, units, range, COV increment, sensor offset
    - For binary points (BI/BO): name, address, type only — omit range, COV, sensor offset
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 7.6 Write property test for general tab
    - **Property 9: General Tab Metadata Display** — verify correct field display by point type
    - **Validates: Requirements 9.1, 9.2, 9.3**

  - [x] 7.7 Implement HistoryTab.jsx with Canvas 2D chart
    - Create `src/ui/ebi/HistoryTab.jsx` with black background canvas, cyan area fill (#00BFFF)
    - Implement period dropdown (2 Weeks, 4 Weeks, 3 Months, Custom) and interval dropdown (6 min avg, 1 hr avg, 8 hr avg, 1 day avg)
    - Support overlay of up to 4 series (cyan, green, yellow, magenta) with "Add sensor" button
    - Display data table below chart sorted newest-first
    - Implement scroll/zoom controls (mouse wheel + drag) for time axis navigation
    - Show empty chart with "no data" annotation for points without trending data
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 7.8 Write property test for history table ordering
    - **Property 10: History Table Temporal Ordering** — verify descending timestamp sort for any data set
    - **Validates: Requirements 10.4**

  - [x] 7.9 Implement RecentEventsTab.jsx
    - Create `src/ui/ebi/RecentEventsTab.jsx` with chronological event log sorted newest-first
    - Display: timestamp, event type (value change, mode transition, alarm state change), previous value/state, new value/state
    - Maximum 200 entries with vertical scrolling; "no recent events" message when empty
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]* 7.10 Write property test for recent events
    - **Property 11: Recent Events Sorted with Complete Fields** — verify sort order and field completeness
    - **Validates: Requirements 11.1, 11.2**

  - [x] 7.11 Implement AlarmsTab.jsx
    - Create `src/ui/ebi/AlarmsTab.jsx` showing alarm config (type, limit, deadband, priority, enable state) and current alarm state (9-state lifecycle/acknowledgment)
    - Display "no alarms configured" message when point has no alarm config
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ]* 7.12 Write property test for alarm tab
    - **Property 12: Alarm Tab Configuration and State Display** — verify correct display for any alarm config
    - **Validates: Requirements 12.1, 12.2**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Alarm, Schedule, and Report screens
  - [x] 9.1 Implement AlarmSummary.jsx
    - Create `src/alarm/AlarmSummary.jsx` with location/filter tree on left and sortable alarm list (icon, Date/Time, Source, Condition, Operator, Action, Priority, Description, Value)
    - Pre-load 6 real fault records from Four Seasons Hotel data
    - Implement 9-state icon system (urgent/high/low × active-unack/active-ack/inactive-unack)
    - Column header click sorts ascending first, toggles descending on re-click
    - Tree node selection filters alarms to selected group and descendants
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ]* 9.2 Write property tests for alarm summary
    - **Property 13: 9-State Alarm Icon Distinctness** — verify unique icon per state combination
    - **Property 14: Alarm List Sort Toggle** — verify ascending/descending toggle behavior
    - **Property 15: Alarm Filter Tree Selection** — verify correct filtering by tree node
    - **Validates: Requirements 13.3, 13.5, 13.6**

  - [x] 9.3 Implement Schedule screen
    - Create `src/schedule/WeeklySchedule.jsx` with Day/Time/Value table, Insert and Modify buttons
    - Create `src/schedule/ExceptionSchedule.jsx` for holiday/special-event entries
    - Display AHU-4-4 as normal pattern (weekday 08:00–18:00) and AHU-9-2 as fault condition (24/7 active)
    - Visually distinguish fault schedule entries from normal entries
    - Include System Configuration navigation tree for selecting schedule objects
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x] 9.4 Implement PointAttributeReport.jsx
    - Create `src/reports/PointAttributeReport.jsx` with filter checkboxes: In Manual, Out of service, Alarm suppressed
    - Results table: Point Name, BACnet Address, Point Type, Current Value, matching abnormal state
    - OR-logic filtering; error message if no filters selected; "no matching points" message if none match
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [ ]* 9.5 Write property test for point attribute report
    - **Property 16: Point Attribute Report OR-Logic Filtering** — verify OR-logic results for any filter/state combo
    - **Validates: Requirements 15.2**

- [x] 10. CSV Export
  - [x] 10.1 Implement CSVExporter.js and Export button
    - Create `src/reports/CSVExporter.js` generating UTF-8 CSV with columns: Date, Time, Hour_Number, Month, OA_Temp_F, HDH, CDH, [sensor name], [unit]
    - Trigger browser file download with filename `[point_name]_[start_date]_[end_date].csv`
    - Add "Export to Excel" button on EBI History tab
    - Display "no data available" message if point/period has no data
    - _Requirements: 25.1, 25.2, 25.3, 25.4_

  - [ ]* 10.2 Write property test for CSV export
    - **Property 27: CSV Export Format Correctness** — verify header, row count, and filename pattern
    - **Validates: Requirements 25.1, 25.2, 25.4**

- [ ] 11. Pedagogical modes
  - [x] 11.1 Implement ModeContext and mode selection UI
    - Create `src/modes/ModeController.js` with currentMode state (companion, freeExplore, capstone)
    - Implement layout configuration: companion → 70%/30%, capstone → 65%/35%, freeExplore → 100%/0%
    - Add mode selection mechanism accessible from the main interface
    - _Requirements: 20.1, 21.1, 22.1_

  - [x] 11.2 Implement CompanionMode.jsx
    - Create `src/modes/CompanionMode.jsx` with 30% right panel displaying slide companion
    - 41-slide prompt system showing slide number, total, and instructional text
    - Advancing/retreating loads associated scenario and updates slide counter
    - Bounds check: stay within [1, 41]
    - Simulation clock paused in Companion Mode; operator must manually advance
    - Persistent point type badges on AHU graphic when active slide covers BACnet point types
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 28.3, 28.4_

  - [ ]* 11.3 Write property test for companion mode navigation
    - **Property 26: Companion Slide Navigation Bounds** — verify slide stays within [1, 41]
    - **Validates: Requirements 20.5**

  - [x] 11.4 Implement FreeExplore.jsx
    - Create `src/modes/FreeExplore.jsx` with full-width layout and scenario selector
    - Default 60x simulation speed; operator can adjust
    - 14 predefined scenarios with name and description; loading configures point values/fault conditions with confirmation message
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

  - [ ] 11.5 Implement CapstoneModeShell.jsx and worksheet
    - Create `src/modes/CapstoneModeShell.jsx` with 35% right panel
    - Create 5 WorksheetSection components (`src/capstone/WorksheetSection1-5.jsx`) with title, prompt, and text input (max 2000 chars each)
    - Create `src/capstone/WorksheetSidebar.jsx` with section navigation and progress tracker
    - Implement auto-save to localStorage within 2 seconds of last keystroke
    - Display warning if localStorage unavailable
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

  - [ ] 11.6 Implement Capstone PDF export and submission
    - Create `src/capstone/PDFExporter.js` using jsPDF: A4 document with header (title, student name, timestamp), 5 sections with titles, prompts, and responses
    - Create `src/capstone/Verifier.js` to check all 5 sections have input before enabling export
    - Implement submit function persisting to `localStorage["capstone_submissions"]` with confirmation
    - _Requirements: 22.5, 22.6_

  - [ ] 11.7 Implement Instructor Dashboard
    - Create `src/instructor/Dashboard.jsx` listing submitted worksheets (participant ID, timestamp) with viewer
    - Create `src/instructor/UnlockCapstone.jsx` writing `capstone_unlocked: true` flag
    - Poll localStorage every 5 seconds for new submissions; gate access to Engr+ security level
    - Display full worksheet content on selection
    - _Requirements: 22.7_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. CTA Reference Guide and ASHRAE integration
  - [ ] 13.1 Implement ASHRAE callout sidebars and chapter index
    - Create `src/ui/shared/ASHRAECallout.jsx` displaying ASHRAE standard references (55, 62.1, 90.1, 36)
    - Place at least one sidebar per standard on relevant screens
    - Implement chapter index navigation allowing 2-click access from mode selection to any of 14 chapters
    - Add Chapter 14 troubleshooting framework as collapsible card in Capstone worksheet
    - _Requirements: 26.1, 26.2, 26.3, 26.4_

- [ ] 14. Shared UI components and polish
  - [x] 14.1 Implement shared UI components
    - Create `src/ui/shared/PointBadge.jsx` (AI/AO/BI/BO badge for hover or persistent display)
    - Create `src/ui/shared/OverrideIndicator.jsx` (amber background + "Manual" text)
    - Create `src/ui/shared/StatusDots.jsx` (hollow/filled circles for 4 states)
    - Create `src/ui/shared/WhiteBox.jsx` and `src/ui/shared/GreyBox.jsx` for editable/read-only fields
    - _Requirements: 6.3, 8.2, 5.3, 28.1_

  - [x] 14.2 Implement LL97 panel in SymmetrE Station
    - Display LL97 accumulator values (annual energy kBTU, electric kWh, steam kBTU, GHG mtCO2e) within the SymmetrE Station interface
    - Values update on each simulation tick
    - _Requirements: 18.1_

- [ ] 15. Integration wiring and final verification
  - [ ] 15.1 Wire all components together and verify routing
    - Connect all screen components to hash router
    - Verify context providers flow correctly through the component tree
    - Ensure simulation tick events propagate to all subscribed UI components
    - Verify offline operation (no network requests after initial load)
    - _Requirements: 16.7, 27.3_

  - [ ]* 15.2 Write smoke tests for data integrity
    - Verify 27 point files each have 1,017 rows
    - Verify TMY3 has 8,760 rows
    - Verify LL84 constants present
    - Verify 4+ peer benchmarks, 14 scenarios, 41 companion slides, 6 fault rules
    - Verify no network requests after load
    - _Requirements: 16.6, 24.1, 24.2, 24.3_

  - [ ]* 15.3 Write integration tests for mode transitions and auth flow
    - Test login with demo accounts and navigation
    - Test mode switching (Companion/FreeExplore/Capstone) layout changes
    - Test tab navigation defaults and switching
    - _Requirements: 1.2, 1.4, 20.6, 21.1, 22.1_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (27 properties)
- The data conversion tasks (1.x) must complete first since all engine and UI components depend on the baked-in data arrays
- Vitest + fast-check are used for all testing; run with `vitest --run` for single execution
- jsPDF is the only additional library beyond React/Tailwind CDN

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.6", "3.8"] },
    { "id": 4, "tasks": ["3.5", "3.7", "3.9", "5.1"] },
    { "id": 5, "tasks": ["5.2", "6.1", "6.2"] },
    { "id": 6, "tasks": ["6.3", "6.4", "6.6", "6.7", "14.1"] },
    { "id": 7, "tasks": ["6.5", "6.8", "7.1", "7.3", "7.5"] },
    { "id": 8, "tasks": ["7.2", "7.4", "7.6", "7.7", "7.9", "7.11"] },
    { "id": 9, "tasks": ["7.8", "7.10", "7.12", "9.1", "9.3", "9.4"] },
    { "id": 10, "tasks": ["9.2", "9.5", "10.1"] },
    { "id": 11, "tasks": ["10.2", "11.1"] },
    { "id": 12, "tasks": ["11.2", "11.4", "11.5"] },
    { "id": 13, "tasks": ["11.3", "11.6", "11.7", "14.2"] },
    { "id": 14, "tasks": ["13.1", "15.1"] },
    { "id": 15, "tasks": ["15.2", "15.3"] }
  ]
}
```
