# AHU View Migration Guide

## How to Create a New AHU Tab from a Single Honeywell Screenshot

This document explains the process for converting the UI from the current AHU-4-4/AHU-4-6 style (dark theme, HTML/CSS-drawn components) to the AHU-23-1 style (real Honeywell screenshot + interactive overlays + Honeywell-themed controls).

---

## Overview: Two UI Approaches

| Component | AHU-4-4 / AHU-4-6 (Current) | AHU-23-1 (New) |
|-----------|------------------------------|----------------|
| **AHU Graphic** | HTML/CSS drawn (React components, Tailwind) | Real Honeywell screenshot as `<img>` with hotspot overlays |
| **Controls Sidebar** | Generic dark-theme collapsible sections pulling from PointRegistry | Honeywell blue-theme recreated in HTML/CSS matching real screenshot |
| **OA Strip** | Dark bar: OA Temp, Humidity, Wetbulb, Dewpoint, Enthalpy | Honeywell blue/dark bar: OA TEMPERATURE, OA RH, OA ENTHALPY, CWS TEMPERATURE, OA WETBULB |
| **LL97 Panel** | Shown (accumulates energy/carbon) | Hidden (demo/reference unit) |
| **Data Source** | Live from PointRegistry (1017 rows of real BMS data) | Reactive state model driven by Controls Sidebar inputs |

---

## What You Provide: A Single Screenshot

To create a new AHU view like AHU-23-1, provide **one screenshot** that shows the complete Honeywell SymmetrE interface including:

```
┌─────────────────────────────────────────────────────────────────┐
│  [A] OA Strip (blue bar with weather readings)                  │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                    │
│  [B] Controls│   [C] AHU Graphic Schematic                      │
│  Sidebar     │   (ductwork, coils, fan, valves, pipes)          │
│  (blue       │                                                    │
│   theme)     │                                                    │
│              │                                                    │
│              │                                                    │
├──────────────┴──────────────────────────────────────────────────┤
│  [D] Status Bar (optional — we use our own)                      │
└─────────────────────────────────────────────────────────────────┘
```

From this single screenshot, the following pieces are extracted:

| Region | What's Extracted | How It's Used |
|--------|-----------------|---------------|
| **[A] OA Strip** | Labels, units, layout style | Recreated as HTML/CSS component (crisp at any resolution) |
| **[B] Controls Sidebar** | Section names, field labels, values, editable/read-only styling | Recreated as HTML/CSS component with interactive fields |
| **[C] AHU Graphic** | The schematic image itself | Saved as PNG, used as `<img>` background with hotspot overlays |
| **[D] Status Bar** | Ignored | Our simulator provides its own status bar |

---

## Step-by-Step Process

### Step 1: Save the Screenshot Image

Crop the screenshot to isolate just the **AHU Graphic area** [C] (remove the controls sidebar, OA strip, and status bar). Save as:

```
src/assets/AHU_[ID]_Honeywell.png
```

Example: `src/assets/AHU_23_1_Honeywell.png`

**If the screenshot includes station chrome** (menu bar, toolbar, status bar from the Honeywell interface), crop those out — our simulator provides its own chrome.

### Step 2: Create the Image Overlay Component

File: `src/ui/symmetre/AHUImageOverlay.jsx`

This component renders:
- The saved image as a full-size background (`object-contain`)
- Transparent hotspot buttons positioned at % coordinates over the image where values appear

**Hotspot positions** are defined as percentages of image width/height:
```javascript
{ id: 'phtTemp', label: 'Preheat Temp', x: 26, y: 28, w: 8, h: 7 }
// x=26% from left, y=28% from top, 8% wide, 7% tall
```

To calculate positions from pixel coordinates:
```
x% = (pixel_x / image_width) × 100
y% = (pixel_y / image_height) × 100
w% = (hotspot_width_px / image_width) × 100
h% = (hotspot_height_px / image_height) × 100
```

### Step 3: Recreate the Controls Sidebar

File: `src/ui/symmetre/AHU[ID]ControlsSidebar.jsx`

Read the Controls section [B] from the screenshot and recreate as HTML/CSS:
- **Section headers** → blue background bars with white uppercase text
- **Editable fields** (white/pink boxes in screenshot) → interactive input fields
- **Read-only values** (bold text without box) → static displays
- **Toggle indicators** (On/Off, NORM) → colored badges

Color mapping from real Honeywell:
- Background: `#a8d0e6` (light blue)
- Section headers: `bg-blue-600` with white text
- Editable setpoints: White box or pink box (pink = active cooling setpoint)
- Read-only sensor values: Bold black text, no background
- Status indicators: Green = normal/on, Gray = off

### Step 4: Recreate the OA Strip

In `src/ui/symmetre/ZoneTabs.jsx`, add a conditional function that renders the Honeywell-style OA strip when the new AHU tab is active.

Read the OA strip [A] from the screenshot for:
- Label names (e.g., "OA TEMPERATURE" vs "OA Temp")
- Units
- Visual style (colors, spacing, font weight)

### Step 5: Wire Into the App

In `src/App.jsx`, add conditionals:
```javascript
// Controls Sidebar
(params.ahuId === 'AHU-23-1' && window.AHU23ControlsSidebar)
  ? React.createElement(window.AHU23ControlsSidebar, null)
  : React.createElement(window.ControlsSidebar, { ahuId: params.ahuId })

// AHU Graphic
(params.ahuId === 'AHU-23-1' && window.AHUImageOverlay)
  ? React.createElement(window.AHUImageOverlay, { ahuId: 'AHU-23-1' })
  : React.createElement(window.AHUGraphic, { ahuId: params.ahuId })

// LL97 Panel (hide for reference units)
(params.ahuId !== 'AHU-23-1' && window.LL97Panel)
  ? React.createElement(window.LL97Panel, null)
  : null
```

In `src/ui/symmetre/ZoneTabs.jsx`:
```javascript
// Add to ZONE_TABS array
{ id: 'AHU-23-1', label: 'AHU-23-1', icon: '🌀', route: '#/symmetre/AHU-23-1' }

// Add to syncFromHash
if (hash.indexOf('AHU-23-1') !== -1) setActiveTab('AHU-23-1');

// Conditional OA strip
activeTab === 'AHU-23-1'
  ? React.createElement(HoneywellOAStrip, null)
  : React.createElement(OutsideAirStrip, null)
```

Add `<script>` tags in `src/index.html`:
```html
<script type="text/babel" src="ui/symmetre/AHU23ControlsSidebar.jsx"></script>
```

### Step 6: Add Control Logic (Engineering)

Create a shared state model that connects Controls inputs → Diagram outputs:

File: `src/simulation/AHU23State.js`

```javascript
window.AHU23State = {
  // Inputs (set by Controls Sidebar)
  runSchedule: true,
  coolingSetpoint: 60.0,
  heatingSetpoint: 55.0,
  plenumMinSetpoint: 40.0,
  oaTemp: 83.4,
  enthalpyOK: false,
  minDamperPosition: 20,
  co2Sensor: 538,
  co2Setpoint: 900,
  fanSpeedPct: 75,
  designCFM: 12425,

  // Outputs (computed, read by Image Overlay hotspots)
  get fanRunning() { return this.runSchedule; },
  get cfm() { return Math.round(this.fanSpeedPct / 100 * this.designCFM); },
  get oaDamperPct() {
    if (!this.runSchedule) return 0;
    if (this.enthalpyOK && this.oaTemp < 55) return 100; // Full economizer
    if (this.co2Sensor > this.co2Setpoint) return Math.min(100, this.minDamperPosition + 20);
    return this.minDamperPosition;
  },
  get phtValvePct() {
    if (!this.runSchedule) return 0;
    // If OAT < heating setpoint, preheat engages
    if (this.oaTemp < this.heatingSetpoint) return Math.min(100, (this.heatingSetpoint - this.oaTemp) * 5);
    return 0;
  },
  get chwValvePct() {
    if (!this.runSchedule) return 0;
    // If OAT > cooling setpoint, CHW engages
    if (this.oaTemp > this.coolingSetpoint) return Math.min(100, (this.oaTemp - this.coolingSetpoint) * 4);
    return 0;
  },
  get supplyAirTemp() {
    // Approximation: OAT modified by coil action
    var temp = this.oaTemp;
    if (this.phtValvePct > 0) temp = temp + (this.heatingSetpoint - temp) * (this.phtValvePct / 100);
    if (this.chwValvePct > 0) temp = temp - (temp - this.coolingSetpoint) * (this.chwValvePct / 100);
    return temp;
  }
};
```

---

## File Structure (New AHU Tab)

```
src/
├── assets/
│   └── AHU_23_1_Honeywell.png        ← Cropped schematic screenshot
├── simulation/
│   └── AHU23State.js                  ← Control logic (inputs → outputs)
├── ui/symmetre/
│   ├── AHU23ControlsSidebar.jsx       ← Blue Honeywell controls (HTML/CSS)
│   ├── AHUImageOverlay.jsx            ← Image + hotspot overlays (read-only)
│   └── ZoneTabs.jsx                   ← Tab + conditional OA strip
└── App.jsx                            ← Routing conditionals
```

---

## Checklist for Adding a New AHU View

- [ ] Save cropped AHU schematic to `src/assets/`
- [ ] Define hotspot positions in `AHUImageOverlay.jsx` HOTSPOT_MAP
- [ ] Create `AHU[ID]ControlsSidebar.jsx` matching the screenshot's controls panel
- [ ] Add zone tab in `ZoneTabs.jsx` (ZONE_TABS array + syncFromHash)
- [ ] Add conditional OA strip in `ZoneTabs.jsx`
- [ ] Add routing conditionals in `App.jsx` (sidebar, graphic, LL97)
- [ ] Add `<script>` tag in `index.html`
- [ ] Create state model in `src/simulation/` (control logic)
- [ ] Test: tab switching doesn't affect AHU-4-4 / AHU-4-6
- [ ] Commit and push

---

## Visual Reference: What the AI Needs from the Screenshot

When you provide a screenshot and say "make a new AHU tab like this," the AI will:

1. **Identify the AHU graphic area** → save as background image
2. **Read all visible values and their positions** → create hotspot coordinates
3. **Read the controls panel** → recreate as HTML/CSS component with correct sections, labels, and field types
4. **Read the OA strip** → recreate as HTML/CSS with matching labels and style
5. **Infer engineering relationships** → which controls drive which diagram values
6. **Wire everything together** → state model + UI components + routing

The screenshot is the single source of truth for what the final UI should look like.
