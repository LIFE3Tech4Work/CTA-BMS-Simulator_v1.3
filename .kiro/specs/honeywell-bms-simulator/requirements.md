# Requirements Document

## Introduction

This document specifies the requirements for a browser-based simulator that faithfully replicates two related Honeywell Building Management Systems (BMS) as presented in Lev Chesnov's CTA training slides. The simulator combines a Honeywell SymmetrE R410.2 graphical AHU operator display (Station/HMIWeb interface) with a Honeywell EBI R700 Enterprise Buildings Integrator point detail/history view. Both systems coexist in the context of a Four Seasons Hotel facility — SymmetrE for graphics and EBI for point detail. The simulator operates entirely in-browser with no external API dependencies, using baked-in historical BMS data for 27 real points across AHU-4-4, AHU-4-6, Outdoor, and Cooling Tower subsystems.

## Glossary

- **Simulator**: The browser-based application replicating Honeywell SymmetrE R410.2 and EBI R700 systems
- **SymmetrE_Station**: The Honeywell SymmetrE R410.2 graphical AHU operator display interface tab
- **EBI_Point_Detail**: The Honeywell EBI R700 Enterprise Buildings Integrator point detail/history view tab
- **Auth_Screen**: The sign-on dialog requiring operator credentials before granting system access
- **Security_Level**: One of six authorization tiers: View Only, Ack Only, Oper, Supv, Engr, Mngr
- **AHU_Graphic**: The main Air Handling Unit schematic showing isometric airflow diagrams with all associated points
- **Point**: A BACnet-addressed data value representing a sensor reading (AI), actuator output (AO), binary input (BI), or binary output (BO)
- **Point_Registry**: The central registry of all 27 BMS points with BACnet technical addresses and metadata
- **Simulation_Clock**: The virtual time controller that drives data playback through historical point files
- **Fault_Engine**: The subsystem executing 6 fault detection rules (F-01 through F-06) every simulation tick
- **Alarm_Summary**: The screen listing active and historical alarms with 9-state icon classification
- **Schedule_Screen**: The interface for viewing weekly and exception schedules for AHU systems
- **Companion_Mode**: Simulator mode with a slide companion panel occupying 30% of the right viewport, sim clock paused
- **Free_Explore_Mode**: Simulator mode with no companion panel, sim clock running at 60x, scenario selector available
- **Capstone_Mode**: Simulator mode with a worksheet panel occupying 35% of the right viewport, auto-save, and PDF export
- **Scenario**: A predefined BMS operating condition selectable in Free_Explore_Mode, drawn from 14 available scenarios
- **OAT**: Outside Air Temperature sensor reading
- **COV**: Change of Value — BACnet reporting mechanism triggered when a point value changes by a configured increment
- **LL97**: Local Law 97 — NYC carbon emissions legislation requiring annual GHG tracking
- **TMY3**: Typical Meteorological Year version 3 — hourly weather dataset for Central Park (8,760 rows)
- **Manual_Override**: A state in which an operator has forced a point value, indicated by amber background and "Manual" text
- **CTA_Reference_Guide**: The 14-chapter training reference guide whose content the simulator must represent

## Requirements

### Requirement 1: User Authentication

**User Story:** As a BMS operator, I want to sign on with credentials and receive appropriate access privileges, so that security levels are enforced for different operator roles.

#### Acceptance Criteria

1. WHEN the Simulator loads, THE Auth_Screen SHALL display a Honeywell-style sign-on dialog with an operator name text field (maximum 32 characters) and a masked password input field (maximum 64 characters).
2. WHEN the operator submits valid credentials, THE Auth_Screen SHALL grant access at the Security_Level associated with those credentials and navigate to the SymmetrE_Station within 1 second.
3. IF the operator submits credentials that do not match any configured demo account, THEN THE Auth_Screen SHALL display an error message indicating invalid credentials, clear the password field, and remain on the sign-on dialog.
4. THE Auth_Screen SHALL provide pre-populated demo credentials: "cta_student" with password "bms2026" at Oper Security_Level, and "cta_instructor" with password "bms2026" at Engr Security_Level.
5. THE Simulator SHALL enforce six Security_Levels in ascending privilege order where each level includes all privileges of lower levels: View Only (read-only access to point values and graphics), Ack Only (acknowledge alarms), Oper (adjust setpoints and issue commands), Supv (modify schedules), Engr (configure points and fault rules), Mngr (manage operator accounts and security assignments).
6. WHILE the operator is authenticated at View Only Security_Level, THE Simulator SHALL disable all write controls including setpoint fields, command buttons, and override toggles, and permit only read access to point values and graphics.
7. WHILE the operator is authenticated at Ack Only Security_Level, THE Simulator SHALL enable alarm acknowledgment controls but disable setpoint fields, command buttons, and override toggles.

### Requirement 2: SymmetrE Station Interface Chrome

**User Story:** As a BMS operator, I want the SymmetrE Station screen to replicate the authentic Honeywell interface layout, so that training closely matches real-world system interaction.

#### Acceptance Criteria

1. THE SymmetrE_Station SHALL display chrome elements in the following vertical order from top to bottom: title bar, menu bar, toolbar row, main content area, and status bar.
2. THE SymmetrE_Station SHALL display a Windows XP-style title bar at the top of the viewport showing the application window title.
3. THE SymmetrE_Station SHALL display a menu bar with entries in this order: Station, Edit, View, Action, Configure, Help, Sign Off.
4. THE SymmetrE_Station SHALL display a toolbar row with navigation buttons in this order: Back, Forward, Reload, Home, System Menu, Alarms, Events.
5. THE SymmetrE_Station SHALL display a bottom status bar containing the current Simulation_Clock timestamp, the BACnet path of the selected point (or empty when no point is selected), and alarm/system tabs.
6. WHILE the operator is viewing the SymmetrE_Station, THE Simulator SHALL display the text "Honeywell SymmetrE R410.2" within the status bar area.
7. WHILE the operator is viewing the EBI_Point_Detail, THE Simulator SHALL display the text "Honeywell | EBI R700" within the status bar area.
8. WHEN the operator clicks "Sign Off" in the menu bar, THE Simulator SHALL end the current session and navigate back to the Auth_Screen.
9. WHEN the operator clicks the "Alarms" toolbar button, THE Simulator SHALL navigate to the Alarm_Summary screen.

### Requirement 3: Outside Air Data Strip

**User Story:** As a BMS operator, I want to see current outdoor conditions at a glance, so that I can assess ambient environmental factors affecting AHU operation.

#### Acceptance Criteria

1. THE SymmetrE_Station SHALL display an Outside Air data strip showing live values with engineering units for: OAT (°F), OA Humidity (%RH), OA Wetbulb (°F), OA Dewpoint (°F), and OA Enthalpy (BTU/lb).
2. WHEN the Simulation_Clock advances, THE SymmetrE_Station SHALL update the Outside Air data strip values to reflect the corresponding row in the historical point data arrays.
3. THE Outside Air data strip SHALL display numeric values with one decimal place precision for temperature and enthalpy readings, and one decimal place for humidity readings.

### Requirement 4: Zone and AHU Tab Navigation

**User Story:** As a BMS operator, I want tab icons representing zones and AHUs, so that I can quickly switch between different mechanical subsystems.

#### Acceptance Criteria

1. THE SymmetrE_Station SHALL display a horizontal tab icon row containing: one water droplet icon representing the zone/cooling overview, and one fan icon for each AHU in the Point_Registry (AHU-4-4 and AHU-4-6).
2. WHEN the operator selects an AHU tab icon, THE SymmetrE_Station SHALL display the AHU_Graphic for the selected Air Handling Unit and visually indicate that tab as active by highlighting it distinct from inactive tabs.
3. WHEN the SymmetrE_Station first loads after authentication, THE SymmetrE_Station SHALL display the AHU-4-4 tab as the default active selection and show the corresponding AHU_Graphic.
4. WHEN the operator selects the water droplet zone tab icon, THE SymmetrE_Station SHALL display the zone/cooling overview graphic and visually indicate that tab as active.

### Requirement 5: Controls Sidebar

**User Story:** As a BMS operator, I want a dedicated controls panel for AHU parameters, so that I can view and adjust setpoints and operational modes.

#### Acceptance Criteria

1. THE SymmetrE_Station SHALL display a left-side Controls Sidebar with dark charcoal background containing 9 collapsible sections in the following order: Schedule, System Settings, Supply Air Temp Control, Plenum Air Temp Control, Economizer Control, OA Damper Control, Fan Tracking, Fire Alarm System, Alarms.
2. WHEN the operator clicks a section header in the Controls Sidebar, THE SymmetrE_Station SHALL toggle that section between expanded and collapsed states, showing or hiding its contained fields.
3. THE SymmetrE_Station SHALL render operator-editable fields as white boxes, program-controlled fields as grey boxes, and manually overridden fields as blue highlighted boxes, where editability is determined by the point type and the operator's Security_Level.
4. WHILE a Point is in Manual_Override state, THE SymmetrE_Station SHALL display that point's value box with blue highlight to indicate override.
5. WHEN the operator submits a new value for an editable field, THE SymmetrE_Station SHALL update the corresponding Point in the Point_Registry and reflect the new value within 1 second.
6. IF the operator enters a value outside the point's configured range defined in the Point_Registry, THEN THE SymmetrE_Station SHALL reject the input and display an error indication identifying the acceptable range.

### Requirement 6: AHU Schematic Graphic

**User Story:** As a BMS operator, I want a detailed AHU airflow schematic, so that I can visualize the mechanical system components and their current states.

#### Acceptance Criteria

1. THE AHU_Graphic SHALL display a full isometric airflow diagram including: OA Plenum, Filters, Preheat Coil (PHT), Chilled Water Coil (CHW), VFD/Fan, Return Air path, Supply Air path, and Zone temperature readings, with each component displaying its associated point value and engineering units.
2. WHEN the Simulation_Clock advances, THE AHU_Graphic SHALL update all displayed point values within the same rendering frame to reflect the current simulation tick data.
3. WHEN the operator hovers over a point element on the AHU_Graphic, THE Simulator SHALL display the point type badge (AI, AO, BI, or BO) adjacent to the element, and SHALL hide the badge when the pointer leaves the element.
4. IF both the Preheat Coil output exceeds 20% and the Chilled Water Coil output exceeds 20% simultaneously, THEN THE AHU_Graphic SHALL display an amber warning overlay indicating simultaneous heating and cooling, and SHALL remove the overlay when either value falls to 20% or below.
5. THE AHU_Graphic SHALL indicate the operational state of binary components (Fan running/stopped, dampers open/closed) using distinct visual representations for each state.

### Requirement 7: EBI Point Detail Navigation

**User Story:** As a BMS operator, I want to drill down into individual point details, so that I can inspect configuration, history, and alarm status for any BMS point.

#### Acceptance Criteria

1. WHEN the operator selects a point on the AHU_Graphic or navigates via the breadcrumb path, THE Simulator SHALL display the EBI_Point_Detail screen for that point within 1 second, with the General tab selected by default.
2. THE EBI_Point_Detail SHALL display a breadcrumb navigation bar below the toolbar showing the hierarchical path to the current point in the format: System > Subsystem > Point Name, derived from the point's BACnet technical address in the Point_Registry.
3. WHEN the operator clicks a breadcrumb segment, THE Simulator SHALL navigate to the corresponding level in the hierarchy (e.g., clicking the Subsystem segment shall display the AHU_Graphic for that subsystem).
4. THE EBI_Point_Detail SHALL display a tab bar with tabs in the following fixed order: General, Command Priorities, Alarms, History, Recent Events, Advanced.
5. WHEN the operator selects a tab on the EBI_Point_Detail tab bar, THE Simulator SHALL display the content panel for that tab and visually indicate the selected tab as active.

### Requirement 8: EBI Point Detail Left Panel

**User Story:** As a BMS operator, I want a summary panel showing point status at a glance, so that I can quickly assess a point's current state.

#### Acceptance Criteria

1. THE EBI_Point_Detail SHALL display a left panel containing: a vertical bar chart with black background and cyan fill showing the present value mapped to a percentage of the point's configured range, status indicator dots for Alarm, Fault, Overridden, and Out-of-Service states, the numeric Present Value with engineering units, and a Mode indicator.
2. THE EBI_Point_Detail left panel SHALL display each status indicator dot as a hollow gray circle when the corresponding state is inactive, and as a filled colored circle (red for Alarm, amber for Fault, amber for Overridden, gray for Out-of-Service) when the state is active.
3. WHILE a Point is in Manual_Override state, THE EBI_Point_Detail left panel SHALL display an amber background with "Manual" text on the Mode indicator and fill the Overridden status dot with amber.
4. WHILE a Point is in Auto mode, THE EBI_Point_Detail left panel SHALL display "Auto" text on the Mode indicator with no background highlight.

### Requirement 9: EBI General Tab

**User Story:** As a BMS operator, I want to view point metadata and configuration, so that I can understand point addressing, ranges, and reporting behavior.

#### Acceptance Criteria

1. WHEN the General tab is selected, THE EBI_Point_Detail SHALL display the following fields sourced from the Point_Registry for the selected point: object name, BACnet technical address, point type (AI/AO/BI/BO), engineering units, value range (minimum and maximum), COV reporting increment, and sensor offset (calibration value).
2. WHEN the General tab is selected for a binary point (BI or BO), THE EBI_Point_Detail SHALL display the object name, BACnet technical address, and point type, and SHALL omit the range, COV reporting increment, and sensor offset fields that are not applicable to binary points.
3. WHILE the General tab is displayed, THE EBI_Point_Detail SHALL render all metadata fields as read-only labels regardless of the operator's Security_Level.

### Requirement 10: EBI History Tab

**User Story:** As a BMS operator, I want to view historical trend data for any point, so that I can analyze past performance and identify patterns.

#### Acceptance Criteria

1. WHEN the History tab is selected, THE EBI_Point_Detail SHALL display a trend chart with black background (#000000) and cyan area fill (#00BFFF) showing historical values for the selected point.
2. THE EBI_Point_Detail History tab SHALL provide a period dropdown with options: 2 Weeks, 4 Weeks, 3 Months, Custom; and an interval dropdown with options: 6 min avg, 1 hr avg, 8 hr avg, 1 day avg.
3. THE EBI_Point_Detail History tab SHALL support overlay of up to 4 data series simultaneously on the trend chart, each rendered in a distinct color (cyan, green, yellow, magenta).
4. THE EBI_Point_Detail History tab SHALL display a data table below the trend chart showing timestamped point values for the selected period, sorted newest-first.
5. THE EBI_Point_Detail History tab SHALL provide scroll and zoom controls for navigating the trend chart time axis.
6. WHEN the History tab is selected for a point that has no trending data configured (e.g., AHU9_2FanSpeedSignal), THE EBI_Point_Detail SHALL display an empty black chart area with an annotation indicating no data is available for the selected period.
7. WHEN the History tab displays the "Add sensor" button, THE Simulator SHALL allow the operator to select additional points from the Point_Registry for multi-series overlay.

### Requirement 11: EBI Recent Events Tab

**User Story:** As a BMS operator, I want to see a chronological log of point state changes, so that I can trace operational transitions.

#### Acceptance Criteria

1. WHEN the Recent Events tab is selected, THE EBI_Point_Detail SHALL display a list of state-change events for the selected point sorted from most recent to oldest, where a state-change event is any of: a COV exceeding the point's configured COV increment, a mode transition (Auto to Manual or Manual to Auto), or an alarm state transition.
2. THE EBI_Point_Detail Recent Events tab SHALL display each event entry with the following fields: timestamp, event type (value change, mode transition, or alarm state change), previous value or state, and new value or state.
3. THE EBI_Point_Detail Recent Events tab SHALL display a maximum of 200 event entries and SHALL provide vertical scrolling when entries exceed the visible area.
4. IF no state-change events exist for the selected point within the current simulation period, THEN THE EBI_Point_Detail Recent Events tab SHALL display a message indicating that no recent events are available.

### Requirement 12: EBI Alarms Tab

**User Story:** As a BMS operator, I want to view alarm configuration and current alarm state for a point, so that I can understand alerting behavior.

#### Acceptance Criteria

1. WHEN the Alarms tab is selected, THE EBI_Point_Detail SHALL display the alarm configuration for the selected point including: alarm type (PV High, PV Low, Deviation, Rate of Change), alarm limit threshold value, deadband value, priority level (Urgent, High, Low, Journal), and enable/disable state.
2. WHEN the Alarms tab is selected, THE EBI_Point_Detail SHALL display the current alarm state for the selected point matching the 9-state classification: lifecycle (active/inactive) and acknowledgment (acknowledged/unacknowledged).
3. IF the selected point has no alarm configuration defined, THEN THE EBI_Point_Detail Alarms tab SHALL display a message indicating that no alarms are configured for this point.

### Requirement 13: Alarm Summary Screen

**User Story:** As a BMS operator, I want a centralized alarm list with filtering and sorting, so that I can prioritize and respond to system faults.

#### Acceptance Criteria

1. THE Alarm_Summary SHALL display a location/filter tree on the left side with alarm groups for hierarchical filtering.
2. THE Alarm_Summary SHALL display a sortable alarm list with columns: icon, Date/Time, Source, Condition, Operator, Action, Priority, Description, Value.
3. THE Alarm_Summary SHALL classify each alarm using a 9-state icon system combining urgency level (urgent, high, low) with lifecycle-acknowledgment state (active-unacknowledged, active-acknowledged, inactive-unacknowledged), resulting in one distinct icon per combination.
4. THE Alarm_Summary SHALL be pre-loaded with 6 real fault records derived from Four Seasons Hotel operational data.
5. WHEN the operator clicks a column header in the alarm list, THE Alarm_Summary SHALL sort the alarm list by that column in ascending order on the first click and toggle to descending order on the next click of the same column header.
6. WHEN the operator selects a node in the location/filter tree, THE Alarm_Summary SHALL display only the alarms that belong to the selected group or its descendant groups in the alarm list.

### Requirement 14: Schedule Screen

**User Story:** As a BMS operator, I want to view and understand AHU operating schedules, so that I can identify scheduling faults and normal patterns.

#### Acceptance Criteria

1. THE Schedule_Screen SHALL display a System Configuration navigation tree for selecting schedule objects.
2. WHEN the operator selects a schedule object from the navigation tree, THE Schedule_Screen SHALL display the corresponding schedule data in the Weekly Schedule and Exception Schedule tabs.
3. THE Schedule_Screen SHALL display a Weekly Schedule tab containing a table with columns for Day (Monday through Sunday), Time (HH:MM:SS format), and Value (Active/Inactive), along with Insert and Modify buttons.
4. THE Schedule_Screen SHALL display an Exception Schedule tab listing holiday and special-event schedule entries, each showing the date, time range, and scheduled value.
5. THE Schedule_Screen SHALL display the AHU-4-4 schedule as a reference example of a normal operating pattern, showing weekday occupied periods (08:00–18:00) with unoccupied nights and weekends.
6. THE Schedule_Screen SHALL display the AHU-9-2 schedule showing Active value for all days at 00:01:00 (24/7) to illustrate a scheduling fault condition where the AHU never turns off.
7. IF a schedule object contains a fault condition such as a 24/7 occupied schedule with no unoccupied periods, THEN THE Schedule_Screen SHALL visually distinguish the fault entry from normal schedule entries.

### Requirement 15: Point Attribute Report

**User Story:** As a BMS operator, I want to search for points in abnormal states, so that I can identify maintenance issues and manual overrides across the system.

#### Acceptance Criteria

1. THE Simulator SHALL provide a "Find Manual Overrides" report screen with filter checkboxes: In Manual mode, Out of service, Alarm suppressed.
2. WHEN the operator selects one or more filter criteria and executes the report, THE Simulator SHALL display a results table listing all points from the Point_Registry matching any of the selected criteria (OR logic), with columns: Point Name, BACnet Address, Point Type, Current Value, and matching abnormal state.
3. IF the operator executes the report with no filter checkboxes selected, THEN THE Simulator SHALL display an empty results table with a message indicating that at least one filter must be selected.
4. IF the operator executes the report and no points in the Point_Registry match the selected criteria, THEN THE Simulator SHALL display an empty results table with a message indicating no matching points were found.

### Requirement 16: Simulation Engine Data Playback

**User Story:** As a training participant, I want the simulator to play back real BMS data at variable speeds, so that I can observe system behavior across different time periods.

#### Acceptance Criteria

1. THE Simulation_Clock SHALL play back 27 historical BMS point data files spanning May 1 through June 12, 2026, with hourly resolution and 1,017 rows per point, advancing sequentially from row 1 (May 1, 00:00) through row 1,017 (June 12, 08:00).
2. THE Simulation_Clock SHALL provide speed control options: 1x (1 simulated hour per 60 real seconds), 60x (1 simulated hour per 1 real second), 3600x (60 simulated hours per 1 real second), Pause (clock halted), and Jump to a specific date within the May 1–June 12, 2026 range.
3. WHEN the operator changes the playback speed while the Simulation_Clock is running, THE Simulation_Clock SHALL apply the new speed immediately beginning from the current row position without resetting or skipping data.
4. WHEN the Simulation_Clock reaches row 1,017, THE Simulation_Clock SHALL pause playback and indicate that the end of the historical data range has been reached.
5. IF the operator attempts to jump to a date outside the May 1–June 12, 2026 range, THEN THE Simulation_Clock SHALL reject the input and display an error message indicating the valid date range.
6. THE Simulator SHALL store all historical point data as baked-in JavaScript arrays requiring no external API calls.
7. THE Simulator SHALL operate fully offline after initial page load with no network requests required for data retrieval or simulation operation.

### Requirement 17: Fault Detection Engine

**User Story:** As a training participant, I want automatic fault detection running during simulation, so that I can observe how BMS faults manifest and trigger alarms.

#### Acceptance Criteria

1. THE Fault_Engine SHALL execute 6 fault detection rules (F-01 through F-06) on every Simulation_Clock tick.
2. WHEN a fault detection rule condition evaluates to true, THE Fault_Engine SHALL generate an alarm entry in the Alarm_Summary populated with: the Simulation_Clock timestamp, the source point BACnet address, the fault rule identifier as condition, a priority of urgent for safety-related faults and high for operational faults, and a description indicating the violated condition.
3. THE Fault_Engine SHALL evaluate fault conditions against current simulation point values interpolated from the historical data arrays using linear interpolation between adjacent hourly samples.
4. IF a fault detection rule condition that was previously true evaluates to false on a subsequent Simulation_Clock tick, THEN THE Fault_Engine SHALL transition the corresponding alarm entry in the Alarm_Summary from active state to inactive state while preserving its acknowledgment state.
5. THE Fault_Engine SHALL not generate a duplicate alarm entry for a fault rule that is already in active state in the Alarm_Summary.

### Requirement 18: LL97 Energy Accumulator Points

**User Story:** As a training participant, I want to track cumulative energy and emissions data, so that I can understand Local Law 97 compliance metrics.

#### Acceptance Criteria

1. THE Simulator SHALL maintain accumulator points for the LL97 panel displayed within the SymmetrE_Station interface: annual total energy (kBTU), annual electric energy (kWh), annual steam energy (kBTU), and annual greenhouse gas emissions (metric tons CO2e).
2. WHEN the Simulation_Clock advances by one hourly tick, THE Simulator SHALL increment each LL97 accumulator point by the corresponding hourly consumption value derived from the baked-in historical point data arrays and the LL84 Four Seasons Hotel constants.
3. WHEN a new scenario is loaded or the Simulation_Clock is reset to a new start date, THE Simulator SHALL reset all LL97 accumulator points to zero.

### Requirement 19: Thermal Zone Model

**User Story:** As a training participant, I want zone temperatures to drift realistically between scenarios, so that cause-and-effect relationships are observable.

#### Acceptance Criteria

1. THE Simulator SHALL apply a thermal drift model to zone temperature points during transitions between operating scenarios, with a maximum drift rate of 2°F per simulated minute.
2. WHEN a scenario changes AHU operating parameters, THE Simulator SHALL calculate zone temperature drift toward the new target value, settling within 30 simulated minutes.
3. IF a new scenario is activated while a previous thermal transition is still in progress, THEN THE Simulator SHALL restart the drift calculation toward the new target temperature from the current intermediate value.

### Requirement 20: Companion Mode

**User Story:** As a training participant, I want the simulator synchronized with CTA training slides, so that I can follow along with instructor-led content.

#### Acceptance Criteria

1. WHILE the Simulator is in Companion_Mode, THE Simulator SHALL display a slide companion panel occupying 30% of the right viewport.
2. WHILE the Simulator is in Companion_Mode, THE Simulation_Clock SHALL remain paused until the operator manually advances it.
3. THE Companion_Mode SHALL provide a 41-slide prompt system that displays the current slide number, total slide count, and instructional text for the active training exercise.
4. WHEN the operator advances to the next slide prompt, THE Companion_Mode SHALL update the companion panel content with the next prompt's instructional text, load the associated scenario parameters into the simulator, and update the displayed slide number.
5. IF the operator attempts to advance beyond slide 41 or navigate before slide 1, THEN THE Companion_Mode SHALL remain on the current slide and display a message indicating no further slides are available in that direction.
6. WHEN the operator activates Companion_Mode, THE Simulator SHALL enter Companion_Mode starting at slide 1, display the companion panel, and pause the Simulation_Clock.

### Requirement 21: Free Explore Mode

**User Story:** As a training participant, I want unrestricted access to all simulator features with accelerated time, so that I can independently investigate BMS behavior.

#### Acceptance Criteria

1. WHILE the Simulator is in Free_Explore_Mode, THE Simulator SHALL hide the companion panel and display the full-width (100% viewport width) BMS interface.
2. WHILE the Simulator is in Free_Explore_Mode, THE Simulation_Clock SHALL run at 60x speed by default, with the operator able to adjust speed using the standard speed controls.
3. THE Free_Explore_Mode SHALL provide a scenario selector offering 14 predefined BMS operating scenarios, each showing a scenario name and brief description.
4. WHEN the operator selects a scenario, THE Simulator SHALL configure point values and fault conditions to match the selected scenario definition and display a confirmation that the scenario has been loaded.

### Requirement 22: Capstone Mode

**User Story:** As a training participant, I want a structured assessment environment with a guided worksheet, so that I can demonstrate competency through capstone exercises.

#### Acceptance Criteria

1. WHILE the Simulator is in Capstone_Mode, THE Simulator SHALL display a worksheet panel occupying 35% of the right viewport.
2. THE Capstone_Mode worksheet SHALL contain 5 sections, each consisting of a section title, instructional prompt, and a text input area accepting up to 2000 characters per section.
3. WHEN the participant modifies any worksheet input field, THE Simulator SHALL auto-save all worksheet content to browser local storage within 2 seconds of the last keystroke.
4. IF browser local storage is unavailable or the storage write fails, THEN THE Simulator SHALL display a warning indicating that worksheet content is not being persisted.
5. WHEN the participant has provided input in all 5 worksheet sections and activates the export function, THE Simulator SHALL generate a PDF containing all section titles, prompts, and participant responses.
6. WHEN the participant activates the submit function, THE Simulator SHALL persist the worksheet to the instructor dashboard and display a confirmation indicating successful submission.
7. WHILE an instructor is viewing the instructor dashboard, THE Simulator SHALL display a list of all submitted worksheets with participant identifier and submission timestamp, and allow the instructor to view the full content of any selected submission.

### Requirement 23: Point Registry Architecture

**User Story:** As a training participant, I want all BMS points accurately addressed and categorized, so that I can learn real-world BACnet addressing conventions.

#### Acceptance Criteria

1. THE Point_Registry SHALL contain 27 BMS points distributed as: AHU-4-4 (11 points), AHU-4-6 (11 points), Outdoor (5 points), and Cooling Tower (1 point).
2. THE Point_Registry SHALL store for each point: BACnet technical address in the format [type][instance]@DEV[device_number], point type (AI/AO/BI/BO), engineering units, value range (minimum and maximum), and current value.
3. THE Point_Registry SHALL include pedagogical data variants: a corrected CO2 series (169 rows, May 13–20, values 455–950 ppm) and an edited RunSchedule series (169 rows, May 13–20, all values = 1 indicating continuous occupied state).
4. THE Point_Registry SHALL expose each point's current value as a reactive data source such that any UI component displaying that point updates automatically when the Simulation_Clock advances.

### Requirement 24: Weather and Building Reference Data

**User Story:** As a training participant, I want access to TMY3 weather data and building benchmarks, so that I can perform energy analysis exercises.

#### Acceptance Criteria

1. THE Simulator SHALL include TMY3 Central Park (Station 725300) hourly weather data as a baked-in JavaScript array containing 8,760 rows with fields: hour number, dry bulb temperature (°F), dew point (°F), relative humidity (%), wet bulb (°F), and enthalpy (BTU/lb).
2. THE Simulator SHALL include LL84 Four Seasons Hotel constants as a baked-in data object containing: annual site energy (kBTU), annual electric (kWh), annual steam (kBTU), annual GHG (metric tons CO2e), gross floor area (sq ft), and year-over-year values for 2022 and 2023.
3. THE Simulator SHALL include peer cohort benchmark data containing at least 4 archetype building profiles with LL97 carbon intensity limits for comparative analysis.

### Requirement 25: Excel/CSV Export

**User Story:** As a training participant, I want to export historical data to CSV, so that I can perform offline analysis in Excel matching the CTA Session 4 workbook format.

#### Acceptance Criteria

1. WHEN the operator clicks "Export to Excel" on the EBI_Point_Detail History tab, THE Simulator SHALL generate a CSV file (UTF-8, comma-delimited) with columns: Date, Time, Hour_Number, Month, OA_Temp_F, HDH, CDH, [selected sensor name], [unit], covering the currently displayed period and interval selection.
2. THE exported CSV SHALL contain a header row matching the column names exactly, followed by one data row per time interval within the selected period.
3. IF no data is available for the selected point and period, THEN THE Simulator SHALL display a message indicating that no data is available for export rather than generating an empty file.
4. THE Simulator SHALL trigger a browser file download with the filename format: [point_name]_[start_date]_[end_date].csv.

### Requirement 26: CTA Reference Guide Alignment

**User Story:** As a training participant, I want all 14 CTA Reference Guide chapters represented in the simulator, so that every training topic has a corresponding interactive exercise.

#### Acceptance Criteria

1. THE Simulator SHALL provide at least one navigable screen, scenario, or guided exercise corresponding to each of the 14 chapters of the CTA Reference Guide, such that a tester can verify one-to-one chapter coverage.
2. THE Simulator SHALL display ASHRAE standard callout sidebars referencing standards 55, 62.1, 90.1, and 36, with at least one sidebar per standard, placed within the simulator screen whose content relates to the subject matter of the referenced standard.
3. THE Capstone_Mode worksheet SHALL include the Chapter 14 troubleshooting framework as a collapsible card that expands to reveal its full content and collapses to show only its title.
4. THE Simulator SHALL provide a chapter index or navigation mechanism that allows the operator to locate the interactive content associated with any of the 14 CTA Reference Guide chapters within 2 clicks from the mode selection screen.

### Requirement 27: Technology and Deployment Constraints

**User Story:** As a developer, I want clear technology constraints, so that the implementation remains self-contained and portable.

#### Acceptance Criteria

1. THE Simulator SHALL be implemented as a React/JSX browser application that runs in the current stable releases of Chrome, Firefox, Safari, and Edge.
2. THE Simulator SHALL use no external runtime dependencies fetched at page load except the Tailwind CSS CDN, where runtime dependencies are defined as resources loaded via network requests during or after page load excluding build-time tooling.
3. WHEN the initial page load completes and all scripts and stylesheets have been fetched, THE Simulator SHALL operate fully offline with no further network requests required for any application functionality.
4. THE Simulator SHALL use a single index.html file as its entry point.
5. THE Simulator SHALL organize source code such that each of the following directories or files exists at the expected path: src/auth, ui/symmetre, ui/ebi, ui/shared, alarm, schedule, reports, data/points, data/weather, data/building, data/reference, modes, capstone, simulation, instructor, App.jsx.
6. THE Simulator SHALL permit build-time tooling and development dependencies without restriction, provided the production output requires no server-side runtime beyond a static file server.

### Requirement 28: Point Type Visibility

**User Story:** As a training participant, I want to understand the BACnet classification of each point, so that I can learn the difference between analog/binary and input/output point types.

#### Acceptance Criteria

1. WHEN the operator hovers over a point element on the AHU_Graphic, THE Simulator SHALL display a badge adjacent to the point element within 200 milliseconds, indicating the point type as one of: AI (Analog Input), AO (Analog Output), BI (Binary Input), or BO (Binary Output), sourced from the Point_Registry metadata for that point.
2. WHEN the operator moves the pointer away from the point element, THE Simulator SHALL hide the point type badge within 200 milliseconds.
3. WHILE the Simulator is in Companion_Mode and the active slide prompt covers BACnet point types content, THE Simulator SHALL display point type badges persistently on all point elements on the AHU_Graphic without requiring hover interaction.
4. WHEN the operator selects a point element on the AHU_Graphic while point type badges are persistently displayed, THE Simulator SHALL navigate to the EBI_Point_Detail for that point without removing the badge display from the remaining points.
