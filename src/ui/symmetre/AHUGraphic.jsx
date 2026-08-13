/**
 * AHUGraphic.jsx — Isometric AHU Airflow Schematic Graphic
 * 
 * Center component of the SymmetrE Station displaying the Air Handling Unit
 * airflow diagram with live point values, flow direction arrows, and
 * component state indicators.
 * 
 * Props:
 *   ahuId - 'AHU-4-4' or 'AHU-4-6' to select the point set
 * 
 * No import/export — exposed as window.AHUGraphic
 */

const AHUGraphic = (() => {
  const { useState, useEffect, useRef, useCallback } = React;

  // ─── Point Address Maps ────────────────────────────────────────────────────────

  const POINT_MAP = {
    'AHU-4-4': {
      oaDamper:       'AO104@DEV4004',
      phtCoilValve:   'AO103@DEV4004',
      chwCoilValve:   'AO102@DEV4004',
      saFanSpeed:     'AO101@DEV4004',
      saTemp:         'AI301@DEV4004',
      raTemp:         'AI201@DEV4004',
      raCO2:          'AI401@DEV4004',
      branchStatic:   'AI501@DEV4004',
      runSchedule:    'BI601@DEV4004',
    },
    'AHU-4-6': {
      oaDamper:       'AO104@DEV4006',
      phtCoilValve:   'AO103@DEV4006',
      chwCoilValve:   'AO102@DEV4006',
      saFanSpeed:     'AO101@DEV4006',
      saTemp:         'AI301@DEV4006',
      raTemp:         'AI201@DEV4006',
      raCO2:          'AI401@DEV4006',
      branchStatic:   'AI501@DEV4006',
      runSchedule:    'BI601@DEV4006',
    }
  };

  // Zone/room descriptions for each AHU
  const ZONE_INFO = {
    'AHU-4-4': {
      serves: 'Hotel Guest Rooms — Floors 4–12',
      zoneLabel: 'GUEST ROOMS',
    },
    'AHU-4-6': {
      serves: 'Meeting Rooms & Conference — Level 4',
      zoneLabel: 'MEETING ROOMS',
    }
  };

  // Point type metadata (for badge display)
  const POINT_TYPES = {
    'AO104@DEV4004': 'AO', 'AO103@DEV4004': 'AO', 'AO102@DEV4004': 'AO',
    'AO101@DEV4004': 'AO', 'AI301@DEV4004': 'AI', 'AI201@DEV4004': 'AI',
    'AI401@DEV4004': 'AI', 'AI501@DEV4004': 'AI', 'BI601@DEV4004': 'BI',
    'AO104@DEV4006': 'AO', 'AO103@DEV4006': 'AO', 'AO102@DEV4006': 'AO',
    'AO101@DEV4006': 'AO', 'AI301@DEV4006': 'AI', 'AI201@DEV4006': 'AI',
    'AI401@DEV4006': 'AI', 'AI501@DEV4006': 'AI', 'BI601@DEV4006': 'BI',
  };

  // Badge colors by point type
  const BADGE_COLORS = {
    'AI': 'bg-green-500',
    'AO': 'bg-blue-500',
    'BI': 'bg-yellow-500',
    'BO': 'bg-orange-500',
  };

  // ─── PointValue Sub-Component ──────────────────────────────────────────────────

  /**
   * Displays a live point value with hover badge showing point type.
   */
  function PointValue({ address, label, units, format, className }) {
    const [value, setValue] = useState(null);
    const [showBadge, setShowBadge] = useState(false);
    const badgeTimerRef = useRef(null);

    useEffect(() => {
      const registry = window.PointRegistry;
      if (!registry) return;

      // Get initial value
      const initial = registry.getValue(address);
      if (initial !== undefined) setValue(initial);

      // Subscribe for reactive updates
      function onUpdate(point) {
        setValue(point.currentValue);
      }
      registry.subscribe(address, onUpdate);
      return () => registry.unsubscribe(address, onUpdate);
    }, [address]);

    const handleMouseEnter = useCallback(() => {
      if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
      badgeTimerRef.current = setTimeout(() => setShowBadge(true), 0);
    }, []);

    const handleMouseLeave = useCallback(() => {
      if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
      badgeTimerRef.current = setTimeout(() => setShowBadge(false), 0);
    }, []);

    const formattedValue = value !== null && value !== undefined
      ? (format ? format(value) : (typeof value === 'number' ? value.toFixed(1) : String(value)))
      : '--.-';

    const pointType = POINT_TYPES[address] || 'AI';
    const badgeColor = BADGE_COLORS[pointType];

    // Navigate to EBI Point Detail on click
    const handleClick = useCallback(() => {
      window.location.hash = '#/ebi/' + address + '/general';
    }, [address]);

    return React.createElement('div', {
      className: 'relative inline-flex items-center gap-1 cursor-pointer ' + (className || ''),
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
      title: 'Click to view point detail — ' + address,
    },
      // Value display
      React.createElement('span', {
        className: 'text-xs font-mono text-white bg-black/60 px-1 py-0.5 rounded border border-gray-600 hover:border-cyan-400 hover:bg-gray-700/80 transition-colors',
      }, formattedValue + ' ' + units),
      // Point type badge (on hover)
      showBadge && React.createElement('span', {
        className: 'absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white px-1 py-0.5 rounded ' + badgeColor + ' z-10 transition-opacity duration-200',
      }, pointType)
    );
  }

  // ─── Flow Arrow Sub-Component ──────────────────────────────────────────────────

  function FlowArrow({ direction, className }) {
    const arrows = {
      right: '→',
      left: '←',
      up: '↑',
      down: '↓',
    };
    return React.createElement('span', {
      className: 'text-cyan-400 text-lg font-bold animate-pulse ' + (className || ''),
    }, arrows[direction] || '→');
  }

  // ─── Damper Visual Sub-Component ───────────────────────────────────────────────

  function DamperVisual({ value }) {
    // value 0-100, represent as angled blades
    const openPct = value !== null ? value : 0;
    const rotation = 90 - (openPct / 100) * 90; // 0% = 90° (closed), 100% = 0° (open)
    const isOpen = openPct > 10;

    return React.createElement('div', { className: 'flex flex-col items-center gap-0.5' },
      // Damper blades
      React.createElement('div', {
        className: 'w-6 h-8 border border-gray-500 rounded-sm flex flex-col justify-center items-center overflow-hidden bg-gray-800',
      },
        [0, 1, 2].map(i =>
          React.createElement('div', {
            key: i,
            className: 'w-4 h-0.5 bg-gray-400 my-0.5',
            style: { transform: 'rotate(' + rotation + 'deg)' }
          })
        )
      ),
      React.createElement('span', {
        className: 'text-[9px] ' + (isOpen ? 'text-green-400' : 'text-red-400'),
      }, isOpen ? 'OPEN' : 'CLOSED')
    );
  }

  // ─── Fan Visual Sub-Component ──────────────────────────────────────────────────

  function FanVisual({ running, speed }) {
    return React.createElement('div', { className: 'flex flex-col items-center' },
      // Fan icon (spinning circle with blades)
      React.createElement('div', {
        className: 'w-12 h-12 rounded-full border-2 flex items-center justify-center '
          + (running ? 'border-green-400 bg-green-900/30' : 'border-red-400 bg-red-900/30'),
      },
        React.createElement('div', {
          className: 'text-xl ' + (running ? 'animate-spin text-green-300' : 'text-red-300'),
          style: running ? { animationDuration: '1s' } : {},
        }, '✦')
      ),
      // Status label
      React.createElement('span', {
        className: 'text-[10px] font-bold mt-1 ' + (running ? 'text-green-400' : 'text-red-400'),
      }, running ? 'RUNNING' : 'STOPPED')
    );
  }

  // ─── Main AHUGraphic Component ─────────────────────────────────────────────────

  function AHUGraphicComponent({ ahuId }) {
    const effectiveAhuId = ahuId || 'AHU-4-4';
    const pointAddresses = POINT_MAP[effectiveAhuId] || POINT_MAP['AHU-4-4'];
    const zoneInfo = ZONE_INFO[effectiveAhuId] || ZONE_INFO['AHU-4-4'];

    // Track binary states for fan and damper
    const [fanRunning, setFanRunning] = useState(false);
    const [oaDamperValue, setOaDamperValue] = useState(0);

    useEffect(() => {
      const registry = window.PointRegistry;
      if (!registry) return;

      // Fan running based on fan speed > 0 (more reliable than schedule alone)
      function onFanSpeed(point) {
        setFanRunning(point.currentValue > 0);
      }
      const fanVal = registry.getValue(pointAddresses.saFanSpeed);
      if (fanVal !== undefined) setFanRunning(fanVal > 0);
      registry.subscribe(pointAddresses.saFanSpeed, onFanSpeed);

      // OA Damper value for visual
      function onOADamper(point) {
        setOaDamperValue(typeof point.currentValue === 'number' ? point.currentValue : 0);
      }
      const oaVal = registry.getValue(pointAddresses.oaDamper);
      if (oaVal !== undefined) setOaDamperValue(oaVal);
      registry.subscribe(pointAddresses.oaDamper, onOADamper);

      return () => {
        registry.unsubscribe(pointAddresses.saFanSpeed, onFanSpeed);
        registry.unsubscribe(pointAddresses.oaDamper, onOADamper);
      };
    }, [pointAddresses]);

    // ─── Render ─────────────────────────────────────────────────────────────────

    return React.createElement('div', {
      className: 'relative w-full h-full bg-bms-dark rounded-lg border border-gray-700 p-4 overflow-hidden',
      'data-testid': 'ahu-graphic',
    },
      // Title
      React.createElement('div', { className: 'absolute top-2 left-4' },
        React.createElement('div', { className: 'text-sm font-semibold text-gray-300' },
          effectiveAhuId + ' — Air Handling Unit Schematic'
        ),
        React.createElement('div', { className: 'text-[11px] text-cyan-400 mt-0.5' },
          'Serves: ' + zoneInfo.serves
        )
      ),

      // Main schematic layout - horizontal airflow path
      React.createElement('div', { className: 'flex items-center justify-center h-full pt-6' },

        // ═══════════════════════════════════════════════════════════════════════
        // LEFT: Outside Air Intake
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement('div', { className: 'flex flex-col items-center mr-2' },
          React.createElement('span', { className: 'text-[10px] text-gray-400 mb-1' }, 'OUTSIDE AIR'),
          React.createElement(DamperVisual, { value: oaDamperValue }),
          React.createElement(PointValue, {
            address: pointAddresses.oaDamper,
            label: 'OA Damper',
            units: '%',
            className: 'mt-1',
          }),
          React.createElement('span', { className: 'text-[9px] text-gray-500 mt-0.5' }, 'OA Damper'),
        ),

        // Flow arrow
        React.createElement(FlowArrow, { direction: 'right', className: 'mx-1' }),

        // ═══════════════════════════════════════════════════════════════════════
        // FILTERS
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement('div', { className: 'flex flex-col items-center mx-2' },
          React.createElement('div', {
            className: 'w-8 h-16 border border-gray-500 bg-gray-700/50 rounded flex items-center justify-center',
          },
            React.createElement('div', { className: 'flex flex-col gap-0.5' },
              [0, 1, 2, 3, 4].map(i =>
                React.createElement('div', { key: i, className: 'w-5 h-px bg-gray-400' })
              )
            )
          ),
          React.createElement('span', { className: 'text-[9px] text-gray-500 mt-1' }, 'FILTERS'),
        ),

        // Flow arrow
        React.createElement(FlowArrow, { direction: 'right', className: 'mx-1' }),

        // ═══════════════════════════════════════════════════════════════════════
        // PREHEAT COIL
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement('div', { className: 'flex flex-col items-center mx-2' },
          React.createElement('div', {
            className: 'w-10 h-16 border border-orange-600 bg-orange-900/30 rounded flex items-center justify-center',
          },
            React.createElement('div', { className: 'flex flex-col items-center' },
              React.createElement('span', { className: 'text-orange-400 text-sm' }, '≋'),
              React.createElement('span', { className: 'text-[8px] text-orange-300' }, 'PHT'),
            )
          ),
          React.createElement(PointValue, {
            address: pointAddresses.phtCoilValve,
            label: 'PHT Valve',
            units: '%',
            className: 'mt-1',
          }),
          React.createElement('span', { className: 'text-[9px] text-orange-400 mt-0.5' }, 'Preheat Coil'),
        ),

        // Flow arrow
        React.createElement(FlowArrow, { direction: 'right', className: 'mx-1' }),

        // ═══════════════════════════════════════════════════════════════════════
        // CHW COIL
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement('div', { className: 'flex flex-col items-center mx-2' },
          React.createElement('div', {
            className: 'w-10 h-16 border border-blue-500 bg-blue-900/30 rounded flex items-center justify-center',
          },
            React.createElement('div', { className: 'flex flex-col items-center' },
              React.createElement('span', { className: 'text-blue-400 text-sm' }, '≋'),
              React.createElement('span', { className: 'text-[8px] text-blue-300' }, 'CHW'),
            )
          ),
          React.createElement(PointValue, {
            address: pointAddresses.chwCoilValve,
            label: 'CHW Valve',
            units: '%',
            className: 'mt-1',
          }),
          React.createElement('span', { className: 'text-[9px] text-blue-400 mt-0.5' }, 'CHW Coil'),
        ),

        // Flow arrow
        React.createElement(FlowArrow, { direction: 'right', className: 'mx-1' }),

        // ═══════════════════════════════════════════════════════════════════════
        // VFD / SUPPLY FAN
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement('div', { className: 'flex flex-col items-center mx-3' },
          React.createElement(FanVisual, { running: fanRunning }),
          React.createElement(PointValue, {
            address: pointAddresses.saFanSpeed,
            label: 'Fan Speed',
            units: '%',
            className: 'mt-1',
          }),
          React.createElement('span', { className: 'text-[9px] text-gray-400 mt-0.5' }, 'Supply Fan / VFD'),
        ),

        // Flow arrow
        React.createElement(FlowArrow, { direction: 'right', className: 'mx-1' }),

        // ═══════════════════════════════════════════════════════════════════════
        // SUPPLY AIR PATH + ZONE + RETURN AIR
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement('div', { className: 'flex flex-col items-center mx-2' },

          // Supply Air section
          React.createElement('div', {
            className: 'flex items-center gap-2 border border-gray-600 rounded bg-gray-800/50 px-3 py-2',
          },
            React.createElement('div', { className: 'flex flex-col items-center' },
              React.createElement('span', { className: 'text-[9px] text-cyan-400' }, 'SUPPLY AIR'),
              React.createElement(PointValue, {
                address: pointAddresses.saTemp,
                label: 'SA Temp',
                units: '°F',
                className: 'mt-0.5',
              }),
            ),
            React.createElement(FlowArrow, { direction: 'right' }),
            // Zone area
            React.createElement('div', {
              className: 'border border-gray-500 rounded bg-gray-700/30 px-2 py-1 flex flex-col items-center',
            },
              React.createElement('span', { className: 'text-[9px] text-gray-300 font-semibold mb-0.5' }, zoneInfo.zoneLabel),
              React.createElement(PointValue, {
                address: pointAddresses.raTemp,
                label: 'Zone/RA Temp',
                units: '°F',
              }),
              React.createElement(PointValue, {
                address: pointAddresses.raCO2,
                label: 'CO2',
                units: 'ppm',
                format: (v) => Math.round(v).toString(),
                className: 'mt-0.5',
              }),
            ),
          ),

          // Branch Static Pressure below
          React.createElement('div', { className: 'mt-2 flex flex-col items-center' },
            React.createElement(PointValue, {
              address: pointAddresses.branchStatic,
              label: 'Static Press',
              units: 'in.W.C.',
              format: (v) => v.toFixed(2),
            }),
            React.createElement('span', { className: 'text-[9px] text-gray-500' }, 'Branch Static'),
          ),

          // Return Air path (below, going back left)
          React.createElement('div', {
            className: 'flex items-center gap-2 mt-2 border border-gray-600 rounded bg-gray-800/50 px-3 py-1',
          },
            React.createElement(FlowArrow, { direction: 'left' }),
            React.createElement('div', { className: 'flex flex-col items-center' },
              React.createElement('span', { className: 'text-[9px] text-yellow-400' }, 'RETURN AIR'),
              React.createElement(PointValue, {
                address: pointAddresses.raTemp,
                label: 'RA Temp',
                units: '°F',
              }),
            ),
          ),
        ),
      ),
    );
  }

  return AHUGraphicComponent;
})();

// Expose on window for browser use (no import/export)
window.AHUGraphic = AHUGraphic;
