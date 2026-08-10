---
inclusion: auto
description: Honeywell SymmetrE/EBI interface conventions and BMS color coding standards for the simulator
---

# Honeywell SymmetrE/EBI R410 Reference

This simulator replicates the Honeywell SymmetrE R410.2 and EBI R700 interfaces. When implementing UI or behavior, follow these conventions from the real system documentation (located in docs/reference/).

## Station Interface Layout

The real SymmetrE Station displays in this order (top to bottom):
1. Title bar: "Station - Default - [Building]: [Display Name]"
2. Menu bar: Station, Edit, View, Action, Configure, Help, LogOut
3. Toolbar: Back, Forward, Reload, Home (arrows), Building Management icon, Alarm icon, checkmarks, zoom controls, Command line
4. Navigation bar (site-specific tabs)
5. Main content area (graphic displays)
6. Status bar: Product branding | Date | Time | Alarm indicator | System indicator | Download | Server ID | Station number | Security level

## Point Types and Behavior

### BACnet Object Types
- **AI** (Analog Input): Read-only sensor values. Can only be changed if put Out of Service first.
- **AO** (Analog Output): Commandable actuator outputs. Changing PV puts point in Manual mode. Relinquish button returns to Auto.
- **BI** (Binary Input): Read-only binary status. Can only be changed if put Out of Service.
- **BO** (Binary Output): Commandable binary outputs. Changing PV puts point in Manual.
- **AV** (Analog Value): Virtual setpoints. Commandable like AO.
- **BV** (Binary Value): Virtual binary. Commandable like BO.
- **MSV** (Multistate Value): Multiple named states (e.g., Lead/Lag1/Lag2/Standby/Disabled).

### Point Parameters
- PV (Present Value / Point Value): Current value
- SP (Set Point / SetPointValue): Desired value
- Mode (MD / ModeState): Auto, Manual, or Out of Service

### Manual vs Out of Service
- **Manual**: Auto value still calculated by controller but operator's value used. Select Relinquish to return to Auto.
- **Out of Service**: Controller completely ignores the point. Must uncheck OOS checkbox to restore.

### Point Display (EBI Point Detail)
Left panel shows:
- Vertical bar chart (black bg, cyan fill showing PV as % of range)
- Status lights: Alarm (red), Fault (amber), Overridden (amber), Out of Service (gray)
- PV with editable field (for AO/BO/AV/BV)
- Mode indicator (Auto/Manual/Out of Service)

Tabs: General, Command Priorities, Alarms, History, Recent Events

### Set Point Display Styling
- **White box**: Editable by operator (setpoints the user can change)
- **Grey box**: System outputs (read-only, controlled by controller)
- **Green text on point values**: Point is currently in Manual mode

## Alarm System

### 9-State Icon Classification
| Icon State | Flashing? | Active/Inactive | Priority | Acknowledged |
|---|---|---|---|---|
| Filled + Flashing | Yes | Active | Urgent | Not acknowledged |
| Filled + Flashing | Yes | Active | High | Not acknowledged |
| Filled + Flashing | Yes | Active | Low | Not acknowledged |
| Outline + Flashing | Yes | Inactive | Urgent | Not acknowledged |
| Outline + Flashing | Yes | Inactive | High | Not acknowledged |
| Outline + Flashing | Yes | Inactive | Low | Not acknowledged |
| Filled + Solid | No | Active | Urgent | Acknowledged |
| Filled + Solid | No | Active | High | Acknowledged |
| Filled + Solid | No | Active | Low | Acknowledged |

### Alarm Summary Layout
- Location panel (left): Filter by controller/alarm group
- Sorting bar: Click column headers to sort
- Columns: Icon, Date & Time, Source, Condition, Priority, Description, Value, Units, Count
- Bottom: Unacknowledged count, Acknowledged count, Pause/Resume, Acknowledge Page button

### Status Bar Alarm Indicators
- Alarm box: Blank (no alarms), Flashing red (unacknowledged), Red solid (all acknowledged)
- System box: Blank (no system alarms), Flashing cyan (unacknowledged), Cyan solid (all acknowledged)

## Trends and History

### History Collection Types
| Type | Sample Intervals | Retention |
|---|---|---|
| Standard | 1-min snapshot, 6-min avg, 1-hr avg, 8-hr avg, 24-hr avg | 24hrs to 1 year |
| Extended | 1-hr snapshot, 8-hr snapshot, 24-hr snapshot | 7 days to 1 year |
| Fast | 1-30 second intervals | 2-72 hours |

### Trend Display
- Up to 32 points per trend (R410 improvement over R310's 8)
- Black background with colored traces
- Reference Value shows value at selected time point
- Export: Ctrl+C on chart → Ctrl+V into Excel

## BACnet Schedules

### Weekly Schedule
- Day, Time (HH:MM:SS), Value (Active/Inactive)
- Edit area at bottom: Day dropdown, Time spinner, Value dropdown, Insert/Modify buttons
- Right-click to Delete Time

### Exception Schedule
- Override weekly pattern for holidays/special events
- Period types: specific day, week, month, or BACnet Calendar
- Priority for: sets command priority level

## Security Levels (ascending privilege)
1. View Only
2. Ack Only (acknowledge alarms)
3. Oper (adjust setpoints, issue commands)
4. Supv (modify schedules)
5. Engr (configure points, alarms, history)
6. Mngr (manage operator accounts, full access)

## Search Functions
- Command Line + F12: Search for point by name
- Wildcard *: "CH02*" finds all points starting with CH02, "*temp" finds all ending with temp
- Command Line + Enter: Navigate to graphic display by name
- View > Quick View: Search with wildcards, shows all matching points with values and modes
