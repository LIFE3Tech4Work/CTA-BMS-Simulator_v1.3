# Reference Documents

This folder contains source reference documentation for the Honeywell SymmetrE/EBI R410 system that the CTA BMS Simulator replicates.

## Documents

1. **Symmetre Operator User Manual** (TECSystems) — End-user operator guide covering:
   - What is SymmetrE and Station
   - BACnet point types glossary (AI, AO, BI, BO, AV, BV, MSV)
   - Starting and logging onto Station
   - Front End View layout (Menu Bar, Navi Bar, Tool Bar, Command Line)
   - Status Bar (Alarm, System, Message, Download indicators)
   - Alarm Summary and 9-state alarm icon classification
   - Responding to alarms
   - Events and Event Summary viewing
   - Points: commanding, set points, BACnet point commanding
   - Point status lights (Alarm, Fault, Overridden, Out of Service)
   - Alarm conditions configuration (High/Low limit, deadband, time delay)
   - Search functions (Command Line + F12, wildcard *)
   - Quick View
   - Trends and History Collection (Standard/Extended/Fast intervals)
   - Creating and viewing Trend Displays
   - Outputting trends to Excel (Ctrl+C → Ctrl+V)
   - BACnet Schedules (Weekly Schedule, Exception Schedule)
   - Adding an Operator (security levels)

2. **Station Training Guide** (TECSystems, Rev 1.1, R. Schwartz) — Technician-level guide covering:
   - EBI/SymmetrE Overview (EBI = Branch, SymmetrE = Distributor)
   - Station architecture (Server, Quick Builder, HMIWeb Display Builder)
   - Front End View with annotations
   - Alarm management and filtering (Location Panel, Filter Bar)
   - Events (alarms, operator actions, state changes)
   - Points: C-Bus and BACnet commanding differences
   - Manual vs Out of Service distinction
   - Search functions and Quick View
   - Trends: History Assignment, Trend Display creation, Excel export
   - Global Time Schedules (Excel 5000, Honeywell Server)
   - BACnet Schedules (Weekly + Exception)
   - Operator Based Security (adding operators, security levels)
   - Alarm Paging (email, specific alarms, system alarms)
   - Reports (All Points, Alarm and Event, Alarm Duration, Point State Changes)
   - Customize Station Settings (Connection Properties, Display Paths)
   - Troubleshooting (BACnet/IP, C-Bus, LON, Graphics)

## Key Concepts from Real System Applied to Simulator

### Status Lights (Point Detail Left Panel)
- Alarm: Red when active alarm condition exists
- Fault: Amber when communication or hardware fault
- Overridden: Amber when point is in Manual Override
- Out of Service: Gray when point is taken OOS

### 9-State Alarm Classification
Priority (Urgent/High/Low) × State (Active-Unack/Active-Ack/Inactive-Unack):
- Flashing = unacknowledged
- Solid = acknowledged  
- Filled = active
- Outline = inactive

### Set Point Box Colors
- White boxes: operator-editable set points
- Grey boxes: system outputs (read-only)
- Green text: point is in Manual mode

### BACnet Point Types
- AI (Analog Input): Physical sensor readings (temperature, pressure, humidity)
- AO (Analog Output): Actuator commands (valve position %, fan speed)
- BI (Binary Input): On/Off status feedback (fan running, pump status)
- BO (Binary Output): On/Off commands (start/stop signals)
- AV (Analog Value): Virtual setpoints controlled by operator
- BV (Binary Value): Virtual on/off controlled by operator
- MSV (Multistate Value): Multiple states (Lead/Lag1/Lag2/Standby/Disabled)

### Manual vs Out of Service
- Manual: Controller still reads auto value but uses operator's value. Relinquish button returns to auto.
- Out of Service: Controller ignores the point entirely. Must uncheck OOS to restore.

### Station Layout (Real System)
- Title bar: "Station - Default - [Building]: [Display Name]"
- Menu bar: Station, Edit, View, Action, Configure, Help, LogOut
- Tool bar: Navigation arrows, zoom, command line
- Navi Bar: Site-specific navigation tabs
- Status Bar: Honeywell SymmetrE R410.2 | Date | Time | Alarm | System | Download | Server | Station | Security Level
