/**
 * CTA Reference Guide Chapter Index (14 chapters)
 * 
 * Each chapter entry maps to a navigable screen, scenario, or guided exercise
 * within the simulator. The chapter index provides 2-click navigation from the
 * mode selection screen to any chapter's interactive content.
 * 
 * Validates: Requirements 26.1, 26.4
 */

export const Chapters = [
  {
    id: 1,
    title: "What is a BMS?",
    description: "Introduction to Building Management Systems, their purpose in commercial buildings, and how they integrate HVAC, lighting, and life safety controls into a unified monitoring platform.",
    route: "#/symmetre",
    relatedScenarios: [1],
    companionSlides: [1, 2, 5],
    ashraeStandards: []
  },
  {
    id: 2,
    title: "BAS Architecture",
    description: "Building Automation System network topology: supervisory controllers, field controllers (DDC), communication protocols (BACnet/IP, MSTP), and the relationship between SymmetrE and EBI interfaces.",
    route: "#/symmetre",
    relatedScenarios: [1],
    companionSlides: [5, 6],
    ashraeStandards: []
  },
  {
    id: 3,
    title: "Sensors and Input Devices",
    description: "Temperature sensors (RTD, thermistor), pressure transducers, humidity sensors, CO₂ sensors, flow meters, and occupancy sensors. Understanding Analog Inputs (AI) and Binary Inputs (BI).",
    route: "#/ebi",
    relatedScenarios: [1, 5],
    companionSlides: [10, 11, 13],
    ashraeStandards: ["62.1"]
  },
  {
    id: 4,
    title: "Actuators and Output Devices",
    description: "Control valves, damper actuators, VFDs, relays, and contactors. Understanding Analog Outputs (AO) and Binary Outputs (BO), modulating vs. two-position control.",
    route: "#/ebi",
    relatedScenarios: [6, 12],
    companionSlides: [10, 11, 32],
    ashraeStandards: []
  },
  {
    id: 5,
    title: "Point Types",
    description: "BACnet object model: AI, AO, BI, BO, and their properties (Present Value, Status Flags, Priority Array). Point addressing conventions and device instance numbering.",
    route: "#/ebi",
    relatedScenarios: [1],
    companionSlides: [10, 11, 13],
    ashraeStandards: []
  },
  {
    id: 6,
    title: "Setpoints, Alarms, and SOO",
    description: "Setpoint management, alarm configuration (type, limit, deadband, priority), Site Operations Optimization (SOO), and the alarm lifecycle (active/inactive, acknowledged/unacknowledged).",
    route: "#/alarms",
    relatedScenarios: [1, 3],
    companionSlides: [15, 19, 20, 21],
    ashraeStandards: ["55"]
  },
  {
    id: 7,
    title: "ASHRAE Standards",
    description: "Key ASHRAE standards for BMS operations: Standard 55 (Thermal Comfort), Standard 62.1 (Ventilation), Standard 90.1 (Energy Efficiency), and Guideline 36 (High-Performance Sequences).",
    route: "#/symmetre",
    relatedScenarios: [1, 7],
    companionSlides: [26, 27],
    ashraeStandards: ["55", "62.1", "90.1", "36"]
  },
  {
    id: 8,
    title: "Data Availability",
    description: "Trend logging configuration, data retention policies, COV vs. polled trending, historical data export formats, and using trend data for performance analysis.",
    route: "#/ebi",
    relatedScenarios: [1],
    companionSlides: [14, 38],
    ashraeStandards: []
  },
  {
    id: 9,
    title: "Common Operational Issues",
    description: "Simultaneous heating and cooling, stuck valves, sensor drift, scheduling faults, manual overrides left active, and their energy impact on building operations.",
    route: "#/alarms",
    relatedScenarios: [3, 4, 5, 6, 11],
    companionSlides: [21, 29, 30, 31],
    ashraeStandards: ["90.1"]
  },
  {
    id: 10,
    title: "Variable Frequency Drives (VFDs)",
    description: "VFD operation principles, speed-torque characteristics, energy savings from affinity laws, fault indicators (overcurrent, overvoltage), and healthy modulation patterns.",
    route: "#/symmetre",
    relatedScenarios: [12, 13],
    companionSlides: [32],
    ashraeStandards: ["90.1"]
  },
  {
    id: 11,
    title: "Free Cooling and Economizers",
    description: "Airside economizer operation, enthalpy-based switchover, economizer lockout conditions, waterside free cooling with cooling towers, and energy optimization strategies.",
    route: "#/symmetre",
    relatedScenarios: [2, 7, 8],
    companionSlides: [26, 27, 33],
    ashraeStandards: ["90.1"]
  },
  {
    id: 12,
    title: "Building Documentation",
    description: "As-built drawings, sequences of operation, control diagrams, commissioning reports, and using documentation to understand system design intent versus actual operation.",
    route: "#/schedule",
    relatedScenarios: [1, 11],
    companionSlides: [23, 24, 25],
    ashraeStandards: []
  },
  {
    id: 13,
    title: "Calibration",
    description: "Sensor calibration procedures, calibration intervals, drift detection using trend comparison, field verification against reference instruments, and documentation requirements.",
    route: "#/ebi",
    relatedScenarios: [5, 14],
    companionSlides: [30],
    ashraeStandards: []
  },
  {
    id: 14,
    title: "Troubleshooting Exercises",
    description: "Systematic troubleshooting framework: symptom identification, subsystem isolation, related point investigation, physical verification, root cause determination, and corrective action recommendation.",
    route: "#/capstone",
    relatedScenarios: [3, 5, 6, 8],
    companionSlides: [40],
    ashraeStandards: ["36"]
  }
];

export default Chapters;
