# CTA BMS Simulator — Acronym Reference

## BMS & Building Systems

| Acronym | Full Term | Context in Simulator |
|---------|-----------|---------------------|
| BMS | Building Management System | The overarching control system for building HVAC, lighting, and operations |
| BAS | Building Automation System | Synonym for BMS; used interchangeably in industry |
| AHU | Air Handling Unit | The primary mechanical equipment shown in the simulator (AHU-4-4, AHU-4-6) |
| HVAC | Heating, Ventilation, and Air Conditioning | The building systems controlled by the BMS |
| VFD | Variable Frequency Drive | Controls fan motor speed (shown as % on the AHU graphic) |
| CHW | Chilled Water | Cooling medium flowing through the CHW coil; valve position shown as % |
| PHT | Preheat | Heating coil that warms incoming air in cold weather; valve position shown as % |
| OA | Outside Air | Fresh air intake; damper position controls ventilation rate |
| SA | Supply Air | Conditioned air delivered from the AHU to occupied zones |
| RA | Return Air | Air returning from occupied spaces back to the AHU |
| CT | Cooling Tower | Waterside equipment that rejects heat; referenced in fault scenarios |
| FCU | Fan Coil Unit | Individual room conditioning units (referenced in context, not directly simulated) |
| IAQ | Indoor Air Quality | Measured via CO₂ sensors in the return air path |
| SAT | Supply Air Temperature | Temperature of air leaving the AHU toward zones (°F) |
| OAT | Outside Air Temperature | Ambient outdoor temperature from TMY3 weather data (°F) |
| HDH | Heating Degree Hours | Cumulative hours × degrees below 65°F base (CSV export column) |
| CDH | Cooling Degree Hours | Cumulative hours × degrees above 65°F base (CSV export column) |
| EUI | Energy Use Intensity | Energy consumption per square foot (kBTU/sqft/year) |
| GHG | Greenhouse Gas | Carbon emissions measured in mtCO₂e |
| COV | Change of Value | Threshold for point update notifications (e.g., 0.5°F, 1%) |
| HOA | Hand-Off-Auto | Physical switch on equipment: Hand=Manual, Off=Disabled, Auto=BMS control |

## BACnet & Controls

| Acronym | Full Term | Context in Simulator |
|---------|-----------|---------------------|
| BACnet | Building Automation and Control Networks | Communication protocol for BMS points |
| AI | Analog Input | Sensor reading going INTO the controller (temp, pressure, CO₂) |
| AO | Analog Output | Command going OUT from the controller (valve %, fan speed %) |
| BI | Binary Input | ON/OFF status going INTO the controller (run schedule, alarm contacts) |
| BO | Binary Output | ON/OFF command going OUT from the controller (start/stop) |
| DEV | Device | BACnet device identifier (e.g., DEV4004 = AHU-4-4 controller) |
| PV | Present Value | Current reading or command value of a BACnet point |
| COV | Change of Value | Minimum change threshold before subscribers are notified |
| OOS | Out of Service | Point status where the controller ignores the point entirely |

## Honeywell Systems

| Acronym | Full Term | Context in Simulator |
|---------|-----------|---------------------|
| EBI | Enterprise Buildings Integrator | Honeywell's BMS software platform (Point Detail view) |
| SymmetrE | SymmetrE Station | Honeywell's graphical operator station (main AHU view) |
| R410.2 | Release 410.2 | Version number of the SymmetrE Station software |
| R700 | Release 700 | Version number of the EBI software |

## NYC Compliance & Standards

| Acronym | Full Term | Context in Simulator |
|---------|-----------|---------------------|
| LL84 | Local Law 84 | NYC benchmarking law requiring annual energy reporting |
| LL97 | Local Law 97 | NYC carbon emission limits with penalties ($268/ton CO₂e over limit) |
| TMY3 | Typical Meteorological Year (version 3) | Hourly weather data (8,760 rows) used for energy modeling |
| EPW | EnergyPlus Weather | File format for TMY3 data (Central Park Observatory source) |

## ASHRAE Standards

| Acronym | Full Term | Context in Simulator |
|---------|-----------|---------------------|
| ASHRAE | American Society of Heating, Refrigerating and Air-Conditioning Engineers | Standards body for HVAC design and operation |
| ASHRAE 55 | Thermal Environmental Conditions for Human Occupancy | Defines comfort temperature range (68–79°F) |
| ASHRAE 62.1 | Ventilation for Acceptable Indoor Air Quality | Sets minimum ventilation rates; CO₂ <1000 ppm |
| ASHRAE 90.1 | Energy Standard for Buildings | Limits simultaneous heating/cooling; requires economizers |
| ASHRAE 36 | High-Performance Sequences of Operation | Optimal control sequences for AHU/VFD/economizer |

## Measurement Units

| Acronym | Full Term | Where Used |
|---------|-----------|------------|
| °F | Degrees Fahrenheit | All temperature readings (OAT, SAT, RAT, dewpoint, wetbulb) |
| %RH | Percent Relative Humidity | OA Humidity, Return Air Humidity |
| ppm | Parts Per Million | CO₂ concentration |
| in.W.C. | Inches of Water Column | Duct static pressure |
| kBTU | Thousand British Thermal Units | Energy consumption (LL97 panel) |
| kWh | Kilowatt Hours | Electrical energy consumption |
| BTU/lb | British Thermal Units per Pound | Enthalpy (energy content of air) |
| mtCO₂e | Metric Tons of CO₂ Equivalent | Carbon emissions |
| kgCO₂e/sqft | Kilograms CO₂ Equivalent per Square Foot | Carbon intensity (LL97 limit) |
| sqft | Square Feet | Floor area |

## Simulator-Specific

| Acronym | Full Term | Context |
|---------|-----------|---------|
| CTA | Climate Tech Academy | The training program using this simulator (NYSERDA PON 3981) |
| NYSERDA | New York State Energy Research and Development Authority | Funding body for the CTA program |
| PON | Program Opportunity Notice | NYSERDA grant mechanism (PON 3981) |
| F-01 through F-06 | Fault Rules 1–6 | Pre-configured alarm conditions in the Fault Detection Engine |
