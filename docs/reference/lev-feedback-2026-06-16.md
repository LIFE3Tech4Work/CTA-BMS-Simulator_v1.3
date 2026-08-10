# Lev's Feedback on BMS Simulator (June 16, 2026)

## Summary
Lev's feedback centers on making the simulator more realistic and aligned with actual Honeywell/EBI conventions.

## Key Changes Required

### 1. Manual Override Color: Purple/Reddish-Purple (NOT Blue)
- Blue is incorrect for manual override
- Purple or reddish-purple is the correct BMS convention
- Red is acceptable but conflicts with alarm/fault

### 2. Red = Alarm/Fault/Critical Condition
- Reserve red for alarm states and broken conditions
- Do not use red for manual override if possible

### 3. Gray = Offline/Unavailable/Lost Communication/Bad Sensor
- Gray should NOT mean "read-only"
- Gray means: point offline, sensor bad, lost communication, value unavailable

### 4. Black = Normal Operating Condition
- Black text/indicators for normal point status
- Standard BMS values displayed in black

### 5. Anonymize Building References
- Remove "Four Seasons Hotel" name
- Replace with generic building name

### 6. Capstone Should Simulate Real BMS Navigation
- Start from main dashboard → drill into equipment pages → identify issues
- Not isolated questions or static screens

### 7. Companion Mode Needs Step-by-Step Guidance
- Clear, realistic guidance through BMS diagnostic activities
