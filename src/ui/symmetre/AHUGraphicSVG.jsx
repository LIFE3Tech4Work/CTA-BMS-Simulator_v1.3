/**
 * AHUGraphicSVG.jsx — Honeywell SymmetrE-style AHU Graphic (SVG)
 * 
 * Detailed SVG rendering that replicates the visual grammar of a real
 * Honeywell SymmetrE AHU graphic: 3D pipe illusions via layered rects,
 * coil cross-hatching, color-coded status panels, valve indicators.
 *
 * Props:
 *   ahuId - 'AHU-4-4' or 'AHU-4-6' to select the point set
 *
 * No import/export — exposed as window.AHUGraphicSVG
 */

const AHUGraphicSVG = (() => {
  const { useState, useEffect, useCallback } = React;

  // Point address maps (same as AHUGraphic.jsx)
  const POINT_MAP = {
    'AHU-4-4': {
      oaDamper: 'AO104@DEV4004',
      phtCoilValve: 'AO103@DEV4004',
      chwCoilValve: 'AO102@DEV4004',
      saFanSpeed: 'AO101@DEV4004',
      saTemp: 'AI301@DEV4004',
      raTemp: 'AI201@DEV4004',
      raCO2: 'AI401@DEV4004',
      branchStatic: 'AI501@DEV4004',
      runSchedule: 'BI601@DEV4004',
    },
    'AHU-4-6': {
      oaDamper: 'AO104@DEV4006',
      phtCoilValve: 'AO103@DEV4006',
      chwCoilValve: 'AO102@DEV4006',
      saFanSpeed: 'AO101@DEV4006',
      saTemp: 'AI301@DEV4006',
      raTemp: 'AI201@DEV4006',
      raCO2: 'AI401@DEV4006',
      branchStatic: 'AI501@DEV4006',
      runSchedule: 'BI601@DEV4006',
    }
  };

  const ZONE_INFO = {
    'AHU-4-4': { serves: 'Hotel Guest Rooms — Floors 4–12', zoneLabel: 'GUEST ROOMS' },
    'AHU-4-6': { serves: 'Meeting Rooms & Conference — Level 4', zoneLabel: 'MEETING ROOMS' }
  };

  // ─── Helper: get live value from registry ──────────────────────────────────

  function useLiveValue(address) {
    const [value, setValue] = useState(null);
    useEffect(() => {
      const registry = window.PointRegistry;
      if (!registry) return;
      const initial = registry.getValue(address);
      if (initial !== undefined) setValue(initial);
      function onUpdate(point) { setValue(point.currentValue); }
      registry.subscribe(address, onUpdate);
      return () => registry.unsubscribe(address, onUpdate);
    }, [address]);
    return value;
  }

  // ─── SVG Sub-Components ────────────────────────────────────────────────────

  // 3D Duct section (layered rects with offset for depth)
  function Duct({ x, y, width, height }) {
    return React.createElement('g', null,
      // Shadow layer (offset)
      React.createElement('rect', { x: x + 3, y: y + 3, width, height, fill: '#8a8a8a', rx: 2 }),
      // Main duct body
      React.createElement('rect', { x, y, width, height, fill: '#c0c0c0', stroke: '#707070', strokeWidth: 1.5, rx: 2 }),
      // Highlight (top edge)
      React.createElement('rect', { x: x + 2, y: y + 1, width: width - 4, height: 3, fill: '#e8e8e8', rx: 1 })
    );
  }

  // Filter block (green cross-hatch)
  function Filter({ x, y }) {
    return React.createElement('g', null,
      React.createElement('rect', { x, y, width: 40, height: 50, fill: '#d0d0d0', stroke: '#808080', strokeWidth: 1, rx: 2 }),
      React.createElement('text', { x: x + 20, y: y - 5, textAnchor: 'middle', fontSize: 8, fill: '#333', fontFamily: 'Arial' }, 'FILTER'),
      // Green filter media
      React.createElement('rect', { x: x + 5, y: y + 5, width: 13, height: 40, fill: '#2d8a2d', stroke: '#1a5c1a', strokeWidth: 0.5 }),
      React.createElement('rect', { x: x + 22, y: y + 5, width: 13, height: 40, fill: '#2d8a2d', stroke: '#1a5c1a', strokeWidth: 0.5 }),
      // Cross-hatch lines
      [0, 8, 16, 24, 32].map((offset, i) =>
        React.createElement('line', { key: 'fh' + i, x1: x + 5, y1: y + 5 + offset, x2: x + 35, y2: y + 5 + offset, stroke: '#1a5c1a', strokeWidth: 0.5 })
      )
    );
  }

  // Coil (cross-hatched with pipes below)
  function Coil({ x, y, temp, label, valveState, coilColor }) {
    const pipeColor = coilColor || '#8b0000';
    return React.createElement('g', null,
      // Freeze status panel
      React.createElement('rect', { x: x - 5, y: y - 20, width: 70, height: 16, fill: '#e8e8e8', stroke: '#999', strokeWidth: 0.5, rx: 2 }),
      React.createElement('text', { x: x + 30, y: y - 8, textAnchor: 'middle', fontSize: 7, fill: '#333', fontFamily: 'Arial' }, 'FREEZE'),
      // Coil housing
      React.createElement('rect', { x, y, width: 60, height: 55, fill: '#d8d8d8', stroke: '#888', strokeWidth: 1, rx: 1 }),
      // Cross-hatch coil tubes (horizontal)
      [0, 7, 14, 21, 28, 35, 42].map((offset, i) =>
        React.createElement('line', { key: 'ch' + i, x1: x + 3, y1: y + 5 + offset, x2: x + 57, y2: y + 5 + offset, stroke: '#666', strokeWidth: 0.5 })
      ),
      // Cross-hatch coil tubes (vertical)
      [0, 10, 20, 30, 40, 50].map((offset, i) =>
        React.createElement('line', { key: 'cv' + i, x1: x + 5 + offset, y1: y + 3, x2: x + 5 + offset, y2: y + 52, stroke: '#666', strokeWidth: 0.5 })
      ),
      // Temperature display
      React.createElement('rect', { x: x + 8, y: y + 10, width: 44, height: 18, fill: '#fff', stroke: '#333', strokeWidth: 0.5 }),
      React.createElement('text', { x: x + 30, y: y + 23, textAnchor: 'middle', fontSize: 11, fill: '#000', fontWeight: 'bold', fontFamily: 'Arial' },
        temp !== null ? temp.toFixed(1) + '°F' : '--.-°F'
      ),
      // Sensor icon (small yellow square)
      React.createElement('rect', { x: x + 22, y: y - 2, width: 8, height: 8, fill: '#e6c619', stroke: '#999', strokeWidth: 0.5 }),
      // Pipe connections below
      React.createElement('rect', { x: x + 12, y: y + 55, width: 8, height: 40, fill: pipeColor, stroke: '#4a0000', strokeWidth: 1, rx: 1 }),
      React.createElement('rect', { x: x + 40, y: y + 55, width: 8, height: 40, fill: pipeColor, stroke: '#4a0000', strokeWidth: 1, rx: 1 }),
      // Valve circle
      React.createElement('circle', { cx: x + 16, cy: y + 100, r: 10, fill: '#d0d0d0', stroke: '#666', strokeWidth: 1 }),
      React.createElement('text', { x: x + 16, y: y + 103, textAnchor: 'middle', fontSize: 6, fill: '#c00', fontWeight: 'bold', fontFamily: 'Arial' },
        valveState > 0 ? 'ON' : 'OFF'
      ),
      // Label
      React.createElement('text', { x: x + 30, y: y + 120, textAnchor: 'middle', fontSize: 7, fill: '#333', fontFamily: 'Arial' }, label || 'V-1')
    );
  }

  // Fan/VFD section
  function Fan({ x, y, speed, cfm, running, ahuLabel }) {
    return React.createElement('g', null,
      // CFM panel
      React.createElement('rect', { x, y, width: 100, height: 30, fill: '#e8e8e8', stroke: '#999', strokeWidth: 1, rx: 2 }),
      React.createElement('text', { x: x + 50, y: y + 13, textAnchor: 'middle', fontSize: 11, fill: '#000', fontWeight: 'bold', fontFamily: 'Arial' },
        cfm ? cfm + 'CFM' : '----CFM'
      ),
      React.createElement('text', { x: x + 50, y: y + 25, textAnchor: 'middle', fontSize: 7, fill: '#555', fontFamily: 'Arial' }, ahuLabel),
      // VFD motor drawing
      React.createElement('circle', { cx: x + 50, cy: y + 50, r: 14, fill: '#333', stroke: '#000', strokeWidth: 1 }),
      React.createElement('text', { x: x + 50, y: y + 53, textAnchor: 'middle', fontSize: 7, fill: '#0f0', fontFamily: 'Arial' }, 'VFD'),
      // Speed display
      React.createElement('rect', { x: x + 70, y: y + 38, width: 30, height: 20, fill: '#fff', stroke: '#333', strokeWidth: 0.5 }),
      React.createElement('text', { x: x + 85, y: y + 52, textAnchor: 'middle', fontSize: 10, fill: '#000', fontWeight: 'bold', fontFamily: 'Arial' },
        speed !== null ? speed.toFixed(0) + ' %' : '-- %'
      ),
      // Status panel (SHUTDOWN / START / ON)
      React.createElement('rect', { x: x + 10, y: y + 72, width: 80, height: 45, fill: running ? '#00b359' : '#cc0000', stroke: '#333', strokeWidth: 1, rx: 3 }),
      React.createElement('text', { x: x + 50, y: y + 85, textAnchor: 'middle', fontSize: 7, fill: '#fff', fontFamily: 'Arial' }, 'SHUTDOWN'),
      React.createElement('text', { x: x + 50, y: y + 96, textAnchor: 'middle', fontSize: 7, fill: '#fff', fontFamily: 'Arial' }, 'START'),
      React.createElement('text', { x: x + 50, y: y + 112, textAnchor: 'middle', fontSize: 16, fill: '#fff', fontWeight: 'bold', fontFamily: 'Arial' },
        running ? 'ON' : 'OFF'
      )
    );
  }

  // Status alarm panel (top right)
  function AlarmPanel({ x, y }) {
    const labels = ['FAN SHUTDOWN AUTO', 'FAN START AUTO', 'LOW AIRFLOW', 'SUCTION PRES', 'STATIC PRES', 'TAMPER', 'FAIL'];
    return React.createElement('g', null,
      React.createElement('rect', { x, y, width: 130, height: 70, fill: '#f0f0f0', stroke: '#999', strokeWidth: 1, rx: 2 }),
      labels.map((label, i) =>
        React.createElement('text', { key: i, x: x + 5, y: y + 10 + i * 9, fontSize: 6.5, fill: '#555', fontFamily: 'Arial' }, label)
      )
    );
  }

  // ─── Main Component ────────────────────────────────────────────────────────

  function AHUGraphicSVGComponent({ ahuId }) {
    const effectiveAhuId = ahuId || 'AHU-4-4';
    const points = POINT_MAP[effectiveAhuId] || POINT_MAP['AHU-4-4'];
    const zoneInfo = ZONE_INFO[effectiveAhuId] || ZONE_INFO['AHU-4-4'];

    // Live values
    const oaDamper = useLiveValue(points.oaDamper);
    const phtValve = useLiveValue(points.phtCoilValve);
    const chwValve = useLiveValue(points.chwCoilValve);
    const fanSpeed = useLiveValue(points.saFanSpeed);
    const saTemp = useLiveValue(points.saTemp);
    const raTemp = useLiveValue(points.raTemp);
    const fanRunning = fanSpeed !== null && fanSpeed > 0;

    // Navigate to EBI on click
    const handlePointClick = useCallback(function (address) {
      window.location.hash = '#/ebi/' + address + '/general';
    }, []);

    return React.createElement('div', {
      className: 'relative w-full h-full flex flex-col items-center justify-center',
      'data-testid': 'ahu-graphic-svg'
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

      // SVG Graphic
      React.createElement('svg', {
        viewBox: '0 0 750 320',
        className: 'w-full max-w-4xl h-auto',
        style: { maxHeight: '85%' },
        xmlns: 'http://www.w3.org/2000/svg'
      },
        // Background gradient (sky blue like Honeywell)
        React.createElement('defs', null,
          React.createElement('linearGradient', { id: 'skyBg', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: '#a8d8ea' }),
            React.createElement('stop', { offset: '100%', stopColor: '#c8e8f8' })
          )
        ),
        React.createElement('rect', { width: '750', height: '320', fill: 'url(#skyBg)' }),

        // ═══════════════════════════════════════════════════════════════════════
        // MAIN DUCT (horizontal, 3D illusion)
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement(Duct, { x: 30, y: 85, width: 690, height: 40 }),

        // OUTDOOR AIR label + arrow (left)
        React.createElement('text', { x: 15, y: 110, fontSize: 8, fill: '#333', fontFamily: 'Arial', fontStyle: 'italic' }, 'OUTDOOR AIR'),
        React.createElement('polygon', { points: '5,105 15,100 15,110', fill: '#555' }),
        React.createElement('line', { x1: 15, y1: 105, x2: 28, y2: 105, stroke: '#555', strokeWidth: 1, markerEnd: '' }),

        // SUPPLY AIR label + arrow (right)
        React.createElement('text', { x: 685, y: 110, fontSize: 8, fill: '#333', fontFamily: 'Arial', fontStyle: 'italic' }, 'SUPPLY AIR'),
        React.createElement('polygon', { points: '745,105 735,100 735,110', fill: '#555' }),

        // ═══════════════════════════════════════════════════════════════════════
        // FILTER
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement(Filter, { x: 60, y: 65 }),

        // DPS (differential pressure switch)
        React.createElement('rect', { x: 55, y: 55, width: 20, height: 10, fill: '#e8e8e8', stroke: '#999', strokeWidth: 0.5, rx: 1 }),
        React.createElement('text', { x: 65, y: 62, textAnchor: 'middle', fontSize: 6, fill: '#333', fontFamily: 'Arial' }, 'DPS'),

        // ═══════════════════════════════════════════════════════════════════════
        // COIL 1 (Preheat)
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement(Coil, {
          x: 160, y: 60,
          temp: saTemp,
          label: 'V-1 PHT',
          valveState: phtValve,
          coilColor: '#8b0000'
        }),
        // PHT valve value
        React.createElement('text', {
          x: 190, y: 145, textAnchor: 'middle', fontSize: 9, fill: '#000', fontWeight: 'bold', fontFamily: 'Arial',
          style: { cursor: 'pointer' },
          onClick: function () { handlePointClick(points.phtCoilValve); }
        }, phtValve !== null ? phtValve.toFixed(1) + '%' : '--.-%'),

        // ═══════════════════════════════════════════════════════════════════════
        // COIL 2 (CHW)
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement(Coil, {
          x: 290, y: 60,
          temp: raTemp,
          label: 'V-2 CHW',
          valveState: chwValve,
          coilColor: '#00008b'
        }),
        // CHW valve value
        React.createElement('text', {
          x: 320, y: 145, textAnchor: 'middle', fontSize: 9, fill: '#000', fontWeight: 'bold', fontFamily: 'Arial',
          style: { cursor: 'pointer' },
          onClick: function () { handlePointClick(points.chwCoilValve); }
        }, chwValve !== null ? chwValve.toFixed(1) + '%' : '--.-%'),

        // ═══════════════════════════════════════════════════════════════════════
        // Setpoint displays (between coils)
        // ═══════════════════════════════════════════════════════════════════════
        // PLTM MIN
        React.createElement('rect', { x: 255, y: 130, width: 55, height: 16, fill: '#fff', stroke: '#333', strokeWidth: 0.5 }),
        React.createElement('text', { x: 283, y: 141, textAnchor: 'middle', fontSize: 8, fill: '#000', fontFamily: 'Arial' }, 
          oaDamper !== null ? '⊕ ' + oaDamper.toFixed(1) + ' %' : '⊕ --.- %'),
        React.createElement('text', { x: 283, y: 150, textAnchor: 'middle', fontSize: 6, fill: '#666', fontFamily: 'Arial' }, 'PLTM MIN'),

        // DAS SETPOINT
        React.createElement('rect', { x: 255, y: 155, width: 55, height: 16, fill: '#fff', stroke: '#333', strokeWidth: 0.5 }),
        React.createElement('text', { x: 283, y: 166, textAnchor: 'middle', fontSize: 8, fill: '#000', fontFamily: 'Arial' }, '⊕ 55.0 °F'),
        React.createElement('text', { x: 283, y: 175, textAnchor: 'middle', fontSize: 6, fill: '#666', fontFamily: 'Arial' }, 'DAS SETPOINT'),

        // ═══════════════════════════════════════════════════════════════════════
        // FAN / VFD
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement(Fan, {
          x: 440, y: 60,
          speed: fanSpeed,
          cfm: fanSpeed !== null ? Math.round(fanSpeed * 124.25) : null,
          running: fanRunning,
          ahuLabel: effectiveAhuId
        }),

        // ═══════════════════════════════════════════════════════════════════════
        // ALARM PANEL (top right)
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement(AlarmPanel, { x: 580, y: 50 }),

        // ═══════════════════════════════════════════════════════════════════════
        // OA Damper value (left side)
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement('text', {
          x: 45, y: 140, fontSize: 9, fill: '#000', fontWeight: 'bold', fontFamily: 'Arial',
          style: { cursor: 'pointer' },
          onClick: function () { handlePointClick(points.oaDamper); }
        }, 'OA: ' + (oaDamper !== null ? oaDamper.toFixed(0) + '%' : '--%')),

        // ═══════════════════════════════════════════════════════════════════════
        // Supply Air temp (right of fan)
        // ═══════════════════════════════════════════════════════════════════════
        React.createElement('rect', { x: 600, y: 130, width: 60, height: 20, fill: '#fff', stroke: '#333', strokeWidth: 0.5 }),
        React.createElement('text', {
          x: 630, y: 144, textAnchor: 'middle', fontSize: 10, fill: '#000', fontWeight: 'bold', fontFamily: 'Arial',
          style: { cursor: 'pointer' },
          onClick: function () { handlePointClick(points.saTemp); }
        }, saTemp !== null ? saTemp.toFixed(1) + '°F' : '--.-°F'),
        React.createElement('text', { x: 630, y: 155, textAnchor: 'middle', fontSize: 6, fill: '#666', fontFamily: 'Arial' }, 'SUPPLY AIR TEMP')
      )
    );
  }

  return AHUGraphicSVGComponent;
})();

window.AHUGraphicSVG = AHUGraphicSVG;
