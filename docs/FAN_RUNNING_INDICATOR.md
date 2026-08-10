# Supply Fan Running/Stopped Indicator

## How the Fan Status Works

The Supply Fan visual on the AHU graphic shows one of two states:

| State | Icon | Color | Text | Condition |
|-------|------|-------|------|-----------|
| **RUNNING** | Spinning ✦ | Green | "RUNNING" | Run Schedule value ≥ 0.5 |
| **STOPPED** | Static ✦ | Red | "STOPPED" | Run Schedule value < 0.5 |

The fan status is driven by the **Run Schedule** point (`BI601@DEV4004` for AHU-4-4, `BI601@DEV4006` for AHU-4-6), not the fan speed percentage. This mirrors real BMS behavior — the schedule determines if the unit is commanded to run; the VFD speed is a separate output.

## Why the Fan Shows "STOPPED" on First Load

The simulation starts at **Row 1 = May 1, 2026 00:00** (midnight Thursday/Friday). The Run Schedule data from the real BMS shows the AHU was inactive during this period (the first occupied hours don't begin until approximately row 76 — May 4 at 4:00 AM).

This means if you log in and don't advance the simulation, the fan will show "STOPPED."

## How to See the Fan "RUNNING"

### Method 1: Load a Daytime Scenario (Recommended)

In **Free Explore Mode**, load any of these scenarios — they start during occupied hours:

| Scenario | Start Row | Approx. Date/Time | Fan Status |
|----------|-----------|-------------------|------------|
| **Scenario 1**: Normal Summer Operation | 240 | May 11, 00:00 (advances to weekday) | ✅ RUNNING |
| **Scenario 3**: Simultaneous Heat + Cool | 300 | May 13, 12:00 | ✅ RUNNING |
| **Scenario 12**: VFD Modulation (Healthy) | 260 | May 11, 20:00 → advances to next AM | ✅ RUNNING |
| **Scenario 13**: Peak Cooling Load | 750 | Jun 1, 06:00 (weekday AM) | ✅ RUNNING |
| **Scenario 4**: Manual Override Active | 22 | May 1, 22:00 (override forces ON) | ✅ RUNNING |

**Steps:**
1. Switch to **Explore Mode** (click 🔍 Explore in the toolbar)
2. Click a scenario card (e.g., Scenario 1: Normal Summer Operation)
3. The simulation jumps to that row → the fan visual updates to **green spinning** with "RUNNING"

### Method 2: Advance the Simulation

1. Switch to **Explore Mode**
2. Set speed to **3600×** (Action menu → Speed: 3600×)
3. Wait 3–5 seconds — the simulation advances past the initial weekend
4. When it reaches a weekday occupied hour, the fan switches to "RUNNING"
5. Pause when you see it

### Method 3: Manual Override (Phase 5 Demo)

In the **Controls Sidebar**, manually override the Run Schedule:
1. Find "Run Schedule" in the Schedule section
2. The value will show "Inactive"
3. This point is BI (binary input — read-only), so to simulate it running, use Scenario 4 which forces the override

## Screenshot Reference

The following screenshots should show the fan in each state:

### Fan STOPPED (Default — simulation at Row 1, unoccupied)
- **File**: `screenshots/instructor-symmetre-ahu44.png` (if captured at default start)
- **Visual**: Red ✦ icon (not spinning), red "STOPPED" text, fan speed shows a % value but unit is not running

### Fan RUNNING (Scenario 1 or any occupied period)
- **File**: `screenshots/instructor-symmetre-override.png` or any scenario-loaded screenshot
- **Visual**: Green ✦ icon (spinning animation), green "RUNNING" text, fan speed shows active modulation %

## Technical Details

```
Code: src/ui/symmetre/AHUGraphic.jsx

Fan running logic:
  function onRunSchedule(point) {
    setFanRunning(point.currentValue >= 0.5);
  }

The threshold of 0.5 was chosen because the real BMS data uses:
  - 0 = fully inactive (unoccupied)
  - 13.33, 16.67, 81.67 = partial-hour transitions (% of hour active)
  - 100 = fully active (occupied)

Any value above 0.5 indicates the unit is at least partially active.
```

## Run Schedule Data Pattern (AHU-4-4)

The 1,017 rows of Run Schedule data follow the building's actual operating schedule from May–June 2026:

- **Weekdays**: Active approximately 04:00–16:00 (varies by day)
- **Weekends**: Mostly inactive (all zeros), with occasional partial activations
- **Total active hours**: ~210 out of 1,017 hours (~21% of the simulation period)

This low active percentage is realistic for a hotel AHU that serves guest room floors — guest room conditioning is often handled by FCUs while the AHU handles fresh air and common areas during peak occupancy.
