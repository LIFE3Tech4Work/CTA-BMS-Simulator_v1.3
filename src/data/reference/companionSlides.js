/**
 * Companion Mode Slides (41 slides)
 * 
 * Maps Lev's CTA training slides (13-17, 23-27, 31, 33, 38-40) with surrounding
 * intro/transition slides. Each slide includes instructional prompt text that
 * guides students through the BMS interface.
 * 
 * slide: Sequential slide number (1-41)
 * title: Display title for the slide
 * prompt: Instructional text guiding the student through the exercise
 * scenario: Reference to a scenario ID or null for non-interactive slides
 * 
 * Validates: Requirements 20.3
 */

export const CompanionSlides = [
  {
    slide: 1,
    title: "Welcome to CTA BMS Training",
    prompt: "Welcome to the CTA Building Management Systems training simulator. This companion guide will walk you through the Honeywell SymmetrE and EBI interfaces used at a NYC commercial building. Use the arrow buttons to advance through the slides.",
    scenario: null
  },
  {
    slide: 2,
    title: "Course Overview",
    prompt: "This training covers 14 chapters of BMS operations including sensor types, point addressing, alarms, scheduling, and troubleshooting. You'll interact with real historical data from May–June 2026.",
    scenario: null
  },
  {
    slide: 3,
    title: "Signing On to the BMS",
    prompt: "Observe the sign-on screen. Enter the demo credentials (cta_student / bms2026) to authenticate. Notice how the security level determines which controls you can access.",
    scenario: null
  },
  {
    slide: 4,
    title: "Understanding Security Levels",
    prompt: "The Honeywell system uses six security levels: View Only, Ack Only, Oper, Supv, Engr, and Mngr. As a CTA student (Oper level), you can adjust setpoints and issue commands but cannot modify schedules or configure points.",
    scenario: null
  },
  {
    slide: 5,
    title: "SymmetrE Station Layout",
    prompt: "Examine the SymmetrE Station interface. Identify the title bar, menu bar (Station, Edit, View, Action, Configure, Help, Sign Off), toolbar, main content area, and status bar at the bottom.",
    scenario: "normal_operation"
  },
  {
    slide: 6,
    title: "Navigating AHU Zones",
    prompt: "Look at the tab icons at the top. The water droplet represents the zone overview. The fan icons represent AHU-4-4 and AHU-4-6. Click between them to switch views.",
    scenario: "normal_operation"
  },
  {
    slide: 7,
    title: "Outside Air Conditions",
    prompt: "The Outside Air data strip shows live environmental readings: OAT (°F), Humidity (%RH), Wetbulb (°F), Dewpoint (°F), and Enthalpy (BTU/lb). These conditions drive economizer decisions.",
    scenario: "normal_operation"
  },
  {
    slide: 8,
    title: "Reading the AHU Graphic",
    prompt: "The AHU graphic shows the airflow path: Outside Air → Filters → Preheat Coil → CHW Coil → Supply Fan → Supply Duct → Zones → Return Air. Each component displays its current operating value.",
    scenario: "normal_operation"
  },
  {
    slide: 9,
    title: "Controls Sidebar Overview",
    prompt: "The left sidebar contains 9 collapsible sections. Expand each to see setpoints and operating parameters. White boxes are editable at your security level. Grey boxes are read-only. Blue boxes indicate manual overrides.",
    scenario: "normal_operation"
  },
  {
    slide: 10,
    title: "Sensor Types and Point Classification",
    prompt: "Hover over any point on the AHU graphic to see its BACnet type badge. AI = Analog Input (sensors), AO = Analog Output (actuators), BI = Binary Input (status), BO = Binary Output (commands).",
    scenario: "normal_operation"
  },
  {
    slide: 11,
    title: "BACnet Addressing",
    prompt: "Each point has a technical address like AI301@DEV4004. 'AI301' identifies the object type and instance. 'DEV4004' identifies the controller device. This addressing is critical for troubleshooting.",
    scenario: "normal_operation"
  },
  {
    slide: 12,
    title: "Transition: Point Detail View",
    prompt: "Now we'll explore the EBI Point Detail interface. Click on any point value on the AHU graphic to drill into its detailed configuration and history.",
    scenario: "normal_operation"
  },
  {
    slide: 13,
    title: "EBI Point Detail — General Tab",
    prompt: "The General tab shows point metadata: name, BACnet address, type (AI/AO/BI/BO), engineering units, value range, COV increment, and sensor offset. For binary points, range and COV fields are omitted.",
    scenario: "normal_operation"
  },
  {
    slide: 14,
    title: "EBI Point Detail — History Tab",
    prompt: "The History tab displays trend data as a cyan area chart on black background. Use the period selector (2 Weeks, 4 Weeks, 3 Months) and interval (6 min, 1 hr, 8 hr, 1 day) to adjust the view. You can overlay up to 4 sensors.",
    scenario: "normal_operation"
  },
  {
    slide: 15,
    title: "EBI Point Detail — Alarms Tab",
    prompt: "The Alarms tab shows alarm configuration: type (PV High/Low, Deviation), limit threshold, deadband, priority, and current state. Observe the 9-state lifecycle combining active/inactive with acknowledged/unacknowledged.",
    scenario: "normal_operation"
  },
  {
    slide: 16,
    title: "EBI Point Detail — Recent Events",
    prompt: "The Recent Events tab logs state changes: value changes exceeding COV, mode transitions (Auto/Manual), and alarm state changes. Events are sorted newest-first, max 200 entries.",
    scenario: "normal_operation"
  },
  {
    slide: 17,
    title: "EBI Point Detail — Status Indicators",
    prompt: "Examine the left panel status dots: Alarm (red when active), Fault (amber), Overridden (amber), Out-of-Service (gray). Hollow circles mean inactive. The bar chart shows present value as percentage of range.",
    scenario: "normal_operation"
  },
  {
    slide: 18,
    title: "Transition: Alarm Management",
    prompt: "Next we'll explore the alarm system. Real BMS operations require operators to monitor, acknowledge, and respond to alarms. Click the Alarms button in the toolbar.",
    scenario: "normal_operation"
  },
  {
    slide: 19,
    title: "Alarm Summary Screen",
    prompt: "The Alarm Summary shows all active and recent alarms. The filter tree on the left groups alarms by location. The alarm list is sortable by clicking column headers (Date, Source, Priority, etc.).",
    scenario: "normal_operation"
  },
  {
    slide: 20,
    title: "9-State Alarm Classification",
    prompt: "Each alarm has a unique icon based on priority (Urgent/High/Low) and state (Active-Unack, Active-Ack, Inactive-Unack). Flashing = active + unacknowledged. Solid = acknowledged. Outline = inactive.",
    scenario: "normal_operation"
  },
  {
    slide: 21,
    title: "Fault Detection Rules",
    prompt: "The simulator runs 6 fault rules every tick: F-01 (CO₂ scaling), F-02 (manual override timing), F-03 (simultaneous heat+cool), F-04 (PHT stuck), F-05 (CT free cooling), F-06 (OA damper minimum).",
    scenario: "normal_operation"
  },
  {
    slide: 22,
    title: "Transition: Scheduling",
    prompt: "Schedules define when AHUs should be occupied or unoccupied. Incorrect schedules are one of the most common BMS faults. Let's examine the Schedule screen.",
    scenario: "normal_operation"
  },
  {
    slide: 23,
    title: "Weekly Schedule — Normal Pattern",
    prompt: "AHU-4-4 shows a normal weekly schedule: Occupied 08:00–18:00 on weekdays, Unoccupied nights and weekends. This pattern saves energy while maintaining comfort during working hours.",
    scenario: "normal_operation"
  },
  {
    slide: 24,
    title: "Weekly Schedule — Fault Pattern",
    prompt: "Compare AHU-9-2: Active at 00:01 for all days with no unoccupied periods. This 24/7 schedule is a fault — the AHU runs continuously, wasting energy when the building is empty.",
    scenario: "weekend_scheduling_fault"
  },
  {
    slide: 25,
    title: "Exception Schedules",
    prompt: "Exception schedules override the weekly pattern for holidays and special events. Without proper exceptions, AHUs may run during building closures (holidays, maintenance shutdowns).",
    scenario: "normal_operation"
  },
  {
    slide: 26,
    title: "Economizer Operation",
    prompt: "When outdoor air is cool and dry enough (typically OAT < 55°F, enthalpy < 25 BTU/lb), the economizer opens the OA damper to provide 'free cooling' without running the chiller.",
    scenario: "free_cooling"
  },
  {
    slide: 27,
    title: "Economizer Lockout",
    prompt: "When outdoor conditions are too hot or humid, the economizer locks out: OA damper goes to minimum position, and mechanical cooling handles the full load. Watch the CHW valve open wider.",
    scenario: "economizer_lockout"
  },
  {
    slide: 28,
    title: "Transition: Common Faults",
    prompt: "Now we'll examine several common BMS fault conditions. Each scenario demonstrates a real operational issue that CTA technicians must identify and resolve.",
    scenario: null
  },
  {
    slide: 29,
    title: "Simultaneous Heating and Cooling",
    prompt: "This fault occurs when both the preheat coil and chilled water coil are open above 20%. The system is heating and cooling simultaneously — a major energy waste. Look for the amber warning overlay.",
    scenario: "simultaneous_heat_cool"
  },
  {
    slide: 30,
    title: "CO₂ Sensor Fault",
    prompt: "CO₂ readings below 100 ppm are physically impossible in an occupied building (outdoor ambient is ~420 ppm). This indicates a failed sensor, disconnected wiring, or severe calibration drift.",
    scenario: "co2_sensor_fault"
  },
  {
    slide: 31,
    title: "Stuck Valve Diagnosis",
    prompt: "A PHT valve reading stuck at ~25% for 3+ hours suggests a mechanical failure: seized actuator, stripped linkage, or frozen valve stem. The valve no longer responds to control signals.",
    scenario: "pht_valve_stuck"
  },
  {
    slide: 32,
    title: "VFD Operation and Health",
    prompt: "A healthy VFD modulates fan speed between 40–70% in response to duct static pressure demand. Constant 100% or erratic swings indicate control issues or excessive system resistance.",
    scenario: "vfd_healthy"
  },
  {
    slide: 33,
    title: "Cooling Tower Fault",
    prompt: "The cooling tower running at 100% when outdoor conditions permit free cooling (OAT < 55°F) indicates a controls failure. The CT should reduce speed or cycle off in mild weather.",
    scenario: "cooling_tower_fault"
  },
  {
    slide: 34,
    title: "Transition: Energy and Compliance",
    prompt: "Understanding energy consumption and regulatory compliance is essential for NYC buildings. We'll now look at LL97 tracking and TMY3 weather data integration.",
    scenario: null
  },
  {
    slide: 35,
    title: "LL97 Accumulator Panel",
    prompt: "The LL97 panel tracks cumulative annual energy (kBTU), electric (kWh), steam (kBTU), and GHG emissions (mtCO₂e). These values increment each simulation hour based on the building's LL84 benchmarks.",
    scenario: "normal_operation"
  },
  {
    slide: 36,
    title: "TMY3 Weather Context",
    prompt: "TMY3 (Typical Meteorological Year) data for Central Park provides 8,760 hourly weather readings. This enables heating/cooling degree hour calculations and energy normalization for the building.",
    scenario: "normal_operation"
  },
  {
    slide: 37,
    title: "Peer Benchmarking",
    prompt: "Compare the building's carbon intensity against peer buildings. LL97 sets annual limits by building type. Exceeding these limits results in significant financial penalties for the building owner.",
    scenario: "normal_operation"
  },
  {
    slide: 38,
    title: "CSV Export for Analysis",
    prompt: "From the EBI History tab, click 'Export to Excel' to generate a CSV file. The export includes Date, Time, Hour Number, Month, OA Temp, HDH, CDH, and the selected sensor data — matching the CTA Session 4 workbook format.",
    scenario: "normal_operation"
  },
  {
    slide: 39,
    title: "Point Attribute Report",
    prompt: "The Find Manual Overrides report identifies points in abnormal states: Manual mode, Out of Service, or Alarm Suppressed. Use this to find forgotten overrides that waste energy or mask faults.",
    scenario: "normal_operation"
  },
  {
    slide: 40,
    title: "Troubleshooting Framework",
    prompt: "Apply the Chapter 14 framework: (1) Identify symptoms from alarms/trends, (2) Isolate the subsystem, (3) Check related points, (4) Verify sensor readings against physical conditions, (5) Determine root cause, (6) Recommend corrective action.",
    scenario: "normal_operation"
  },
  {
    slide: 41,
    title: "Course Summary",
    prompt: "You've completed the CTA BMS Training companion guide. Key takeaways: understand point types and addressing, read trend data for patterns, recognize common faults, use schedules effectively, and track energy for LL97 compliance. Proceed to Free Explore or Capstone mode to continue learning.",
    scenario: null
  }
];

export default CompanionSlides;

// Expose globally for browser-based loading (no module bundler)
if (typeof window !== 'undefined') {
  window.COMPANION_SLIDES = CompanionSlides;
}
