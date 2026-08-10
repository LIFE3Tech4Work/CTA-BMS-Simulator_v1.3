/**
 * ControlsSidebar.jsx — 9-section collapsible controls panel for SymmetrE Station
 *
 * Displays AHU point values in categorized collapsible sections.
 * Field box styling (Property 4):
 *   White box (bg-white text-black): Point is operator-editable at current security (AO/BO at Oper+)
 *   Grey box (bg-gray-300 text-gray-700): Point is read-only (AI/BI) or user has insufficient security
 *   Blue box (bg-blue-200 text-blue-900): Point is currently in Manual Override state
 *
 * Editable fields (Property 5):
 *   On click/focus → input mode
 *   On submit (Enter/blur) → validate against [min, max]
 *   Valid → PointRegistry.setValue(address, value, 'operator')
 *   Invalid → red error tooltip "Value must be between {min} and {max} {units}"
 *   Update reflected within 1 second
 *
 * No import/export — attaches to window.ControlsSidebar
 * Reads: window.PointRegistry, window.AuthContext (React Context)
 */

const ControlsSidebar = (() => {
  const { useState, useEffect, useContext, useCallback, useRef } = React;

  // Security level hierarchy for privilege checks
  const SECURITY_LEVELS = ['ViewOnly', 'AckOnly', 'Oper', 'Supv', 'Engr', 'Mngr'];

  function hasPrivilege(userLevel, requiredLevel) {
    return SECURITY_LEVELS.indexOf(userLevel) >= SECURITY_LEVELS.indexOf(requiredLevel);
  }

  // ─── Section Definitions ────────────────────────────────────────────────────
  // Maps section names to the point addresses they contain per AHU.
  // 9 collapsible sections per Requirement 5, AC 1.

  function getSectionsForAHU(ahuId) {
    const prefix = ahuId === 'AHU-4-4' ? 'DEV4004' : 'DEV4006';

    return [
      {
        id: 'schedule',
        title: 'Schedule',
        points: [
          { address: `BI601@${prefix}`, label: 'Run Schedule' }
        ]
      },
      {
        id: 'system-settings',
        title: 'System Settings',
        points: [
          { address: `BI601@${prefix}`, label: 'System Mode' },
          { address: `BI601@${prefix}`, label: 'Occupancy' }
        ]
      },
      {
        id: 'supply-air-temp',
        title: 'Supply Air Temp Control',
        points: [
          { address: `AO106@${prefix}`, label: 'SAT Setpoint' },
          { address: `AI301@${prefix}`, label: 'SAT Actual' },
          { address: `AO102@${prefix}`, label: 'CHW Coil Valve' }
        ]
      },
      {
        id: 'plenum-air-temp',
        title: 'Plenum Air Temp Control',
        points: [
          { address: `AO103@${prefix}`, label: 'Preheat Coil Valve' }
        ]
      },
      {
        id: 'economizer',
        title: 'Economizer Control',
        points: [
          { address: `AO104@${prefix}`, label: 'OA Damper Position' }
        ]
      },
      {
        id: 'oa-damper',
        title: 'OA Damper Control',
        points: [
          { address: `AO104@${prefix}`, label: 'Min Damper Position' },
          { address: `AO104@${prefix}`, label: 'Max Damper Position' }
        ]
      },
      {
        id: 'fan-tracking',
        title: 'Fan Tracking',
        points: ahuId === 'AHU-4-4'
          ? [
              { address: 'AO101@DEV4004', label: 'SA Fan Speed' },
              { address: 'AO105@DEV4004', label: 'Return Fan Speed' }
            ]
          : [
              { address: 'AO101@DEV4006', label: 'SA Fan Speed' }
            ]
      },
      {
        id: 'fire-alarm',
        title: 'Fire Alarm System',
        points: [
          { address: `BI602@${prefix}`, label: 'Fire Alarm Status' }
        ]
      },
      {
        id: 'alarms',
        title: 'Alarms',
        points: [],  // Alarm count and link rendered specially
        hasAlarmLink: true
      }
    ];
  }

  // ─── Editable Field Component ───────────────────────────────────────────────

  function PointField({ address, label }) {
    const auth = useContext(window.AuthContext);
    const [value, setValue] = useState(null);
    const [metadata, setMetadata] = useState(null);
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    // Get point metadata and current value on mount
    useEffect(() => {
      if (!window.PointRegistry) return;
      const meta = window.PointRegistry.getMetadata(address);
      setMetadata(meta);
      const currentVal = window.PointRegistry.getValue(address);
      setValue(currentVal);
    }, [address]);

    // Subscribe to point value changes
    useEffect(() => {
      if (!window.PointRegistry) return;

      function handleUpdate(point) {
        setValue(point.currentValue);
        // Update metadata in case mode changed
        setMetadata(prev => ({
          ...prev,
          mode: point.mode,
          alarmState: point.alarmState
        }));
      }

      window.PointRegistry.subscribe(address, handleUpdate);
      return () => window.PointRegistry.unsubscribe(address, handleUpdate);
    }, [address]);

    // Focus input when entering edit mode
    useEffect(() => {
      if (editing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [editing]);

    if (!metadata) {
      return React.createElement('div', {
        className: 'flex items-center justify-between py-1 px-2 text-xs text-gray-500'
      }, label, ' — ');
    }

    const pointType = metadata.type;
    const isManualOverride = metadata.mode === 'Manual';
    const isOperatorEditable = (pointType === 'AO' || pointType === 'BO') &&
      hasPrivilege(auth.securityLevel || 'ViewOnly', 'Oper');

    // Determine box color class per Lev's feedback (June 2026):
    //   Purple/reddish-purple box: Manual Override state
    //   Black text on white bg: Normal operator-editable (AO/BO at Oper+)
    //   Dark/black: Normal read-only values (AI/BI)
    //   Gray box: Point offline, communication lost, or unavailable
    let boxClass = 'bg-gray-900 text-white border border-gray-600'; // Black/dark = normal read-only
    if (isManualOverride) {
      boxClass = 'bg-purple-200 text-purple-900 border border-purple-400'; // Purple = manual override
    } else if (isOperatorEditable) {
      boxClass = 'bg-white text-black border border-gray-300'; // White = editable
    }

    // Format display value
    function formatValue(val) {
      if (val === null || val === undefined) return '—';
      if (typeof val === 'boolean') return val ? 'Active' : 'Inactive';
      if (pointType === 'BI' || pointType === 'BO') {
        return val >= 0.5 ? 'Active' : 'Inactive';
      }
      return typeof val === 'number' ? val.toFixed(1) : String(val);
    }

    // Handle click to enter edit mode (only for editable fields)
    function handleClick() {
      if (!isOperatorEditable && !isManualOverride) return;
      if (!hasPrivilege(auth.securityLevel || 'ViewOnly', 'Oper')) return;
      setEditing(true);
      setEditValue(value !== null ? String(typeof value === 'number' ? value.toFixed(1) : value) : '');
      setError(null);
    }

    // Handle submit
    function handleSubmit() {
      const numVal = parseFloat(editValue);
      if (isNaN(numVal)) {
        setError('Enter a valid number');
        return;
      }

      const min = metadata.min;
      const max = metadata.max;

      if (numVal < min || numVal > max) {
        setError(`Value must be between ${min} and ${max} ${metadata.units || ''}`.trim());
        return;
      }

      // Valid — update via PointRegistry
      if (window.PointRegistry) {
        window.PointRegistry.setValue(address, numVal, 'operator');
      }
      setEditing(false);
      setError(null);
    }

    // Handle key down in input
    function handleKeyDown(e) {
      if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape') {
        setEditing(false);
        setError(null);
      }
    }

    // Handle blur
    function handleBlur() {
      // Small timeout to allow submit to fire first
      setTimeout(() => {
        if (editing) {
          handleSubmit();
        }
      }, 100);
    }

    const units = metadata.units || '';

    if (editing) {
      return React.createElement('div', {
        className: 'flex items-center justify-between py-1 px-2 text-xs relative'
      },
        React.createElement('span', { className: 'text-gray-300 flex-shrink-0 mr-2' }, label),
        React.createElement('div', { className: 'flex items-center gap-1' },
          React.createElement('input', {
            ref: inputRef,
            type: 'text',
            className: 'w-16 px-1 py-0.5 text-xs text-gray-900 bg-white border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500',
            value: editValue,
            onChange: (e) => setEditValue(e.target.value),
            onKeyDown: handleKeyDown,
            onBlur: handleBlur,
            'aria-label': `Edit ${label}`
          }),
          units && React.createElement('span', { className: 'text-gray-400' }, units)
        ),
        error && React.createElement('div', {
          className: 'absolute top-full left-0 right-0 bg-red-600 text-white text-xs px-2 py-1 rounded shadow-lg z-50',
          role: 'alert'
        }, error)
      );
    }

    return React.createElement('div', {
      className: 'flex items-center justify-between py-1 px-2 text-xs cursor-' + (isOperatorEditable || isManualOverride ? 'pointer' : 'default'),
      onClick: handleClick,
      role: isOperatorEditable ? 'button' : undefined,
      tabIndex: isOperatorEditable ? 0 : undefined,
      'aria-label': `${label}: ${formatValue(value)} ${units}`,
      onKeyDown: isOperatorEditable ? (e) => { if (e.key === 'Enter') handleClick(); } : undefined
    },
      React.createElement('span', { className: 'text-gray-300 flex-shrink-0 mr-2' }, label),
      React.createElement('span', {
        className: `inline-block px-2 py-0.5 rounded text-xs font-mono ${boxClass}`
      },
        formatValue(value),
        units ? ` ${units}` : ''
      )
    );
  }

  // ─── Collapsible Section Component ──────────────────────────────────────────

  function Section({ title, points, defaultExpanded, hasAlarmLink }) {
    const [expanded, setExpanded] = useState(defaultExpanded || false);
    const [alarmCount, setAlarmCount] = useState(0);

    // If this is the alarms section, track active alarm count
    useEffect(() => {
      if (!hasAlarmLink) return;
      // Attempt to read alarm count from window.AlarmStore if available
      function updateAlarmCount() {
        if (window.AlarmStore && typeof window.AlarmStore.query === 'function') {
          const activeAlarms = window.AlarmStore.query({ lifecycle: 'active' });
          setAlarmCount(Array.isArray(activeAlarms) ? activeAlarms.length : 0);
        }
      }
      updateAlarmCount();
      const interval = setInterval(updateAlarmCount, 1000);
      return () => clearInterval(interval);
    }, [hasAlarmLink]);

    const chevron = expanded ? '▼' : '▶';

    return React.createElement('div', {
      className: 'border-b border-gray-700'
    },
      // Section header
      React.createElement('button', {
        className: 'w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors text-left',
        onClick: () => setExpanded(!expanded),
        'aria-expanded': expanded,
        'aria-label': `${title} section`
      },
        React.createElement('span', { className: 'text-xs text-gray-400' }, chevron),
        React.createElement('span', { className: 'font-medium' }, title)
      ),
      // Section content (visible when expanded)
      expanded && React.createElement('div', {
        className: 'pb-2'
      },
        // Alarm section special content
        hasAlarmLink
          ? React.createElement('div', { className: 'px-4 py-1' },
              React.createElement('div', {
                className: 'flex items-center justify-between text-xs text-gray-300 mb-1'
              },
                React.createElement('span', null, 'Active Alarms'),
                React.createElement('span', {
                  className: 'inline-block px-2 py-0.5 rounded bg-gray-300 text-gray-700 font-mono'
                }, String(alarmCount))
              ),
              React.createElement('a', {
                href: '#/alarms',
                className: 'text-xs text-blue-400 hover:text-blue-300 underline',
                'aria-label': 'View alarm summary'
              }, 'View Alarm Summary →')
            )
          : (
            points && points.length > 0
              ? points.map((pt, idx) =>
                  React.createElement(PointField, {
                    key: `${pt.address}-${pt.label}-${idx}`,
                    address: pt.address,
                    label: pt.label
                  })
                )
              : React.createElement('div', {
                  className: 'px-4 py-1 text-xs text-gray-500 italic'
                }, 'No points configured')
          )
      )
    );
  }

  // ─── Main Sidebar Component ─────────────────────────────────────────────────

  function ControlsSidebarComponent({ ahuId }) {
    const currentAHU = ahuId || 'AHU-4-4';
    const sections = getSectionsForAHU(currentAHU);
    const [collapsed, setCollapsed] = useState(false);

    // Collapse toggle button (always visible)
    const toggleButton = React.createElement('button', {
      className: 'px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors',
      onClick: () => setCollapsed(!collapsed),
      'aria-label': collapsed ? 'Expand controls sidebar' : 'Collapse controls sidebar',
      title: collapsed ? 'Expand sidebar' : 'Collapse sidebar'
    }, collapsed ? '▶' : '◀');

    // When collapsed, render a narrow strip with just the toggle
    if (collapsed) {
      return React.createElement('aside', {
        className: 'w-8 bg-gray-800 flex flex-col items-center pt-2 border-r border-gray-700',
        'aria-label': 'Controls Sidebar (collapsed)',
        role: 'complementary'
      }, toggleButton);
    }

    return React.createElement('aside', {
      className: 'bg-gray-800 flex-shrink-0 border-r border-gray-700',
      style: { width: '280px' },
      'aria-label': 'Controls Sidebar',
      role: 'complementary'
    },
      // Sidebar header with collapse toggle
      React.createElement('div', {
        className: 'px-3 py-2 border-b border-gray-700 bg-gray-900 flex items-center justify-between'
      },
        React.createElement('h2', {
          className: 'text-sm font-semibold text-gray-200'
        }, 'Controls — ' + currentAHU),
        toggleButton
      ),
      // 9 sections
      sections.map((section, idx) =>
        React.createElement(Section, {
          key: section.id,
          title: section.title,
          points: section.points,
          defaultExpanded: idx === 0, // First section expanded by default
          hasAlarmLink: section.hasAlarmLink || false
        })
      ),
      // ASHRAE Callout Sidebars (Requirement 26.2)
      React.createElement('div', {
        className: 'px-3 py-3 border-t border-gray-700'
      },
        React.createElement('div', {
          className: 'text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2'
        }, 'ASHRAE References'),
        // ASHRAE 55 — Thermal Comfort (zone temp related)
        window.ASHRAECallout && React.createElement(window.ASHRAECallout, {
          standard: '55',
          context: 'Supply/Return Air Temperature and Zone Setpoints'
        }),
        // ASHRAE 62.1 — Ventilation (CO2/OA damper related)
        window.ASHRAECallout && React.createElement(window.ASHRAECallout, {
          standard: '62.1',
          context: 'OA Damper Control and CO₂ Monitoring'
        }),
        // ASHRAE 90.1 — Energy Efficiency (economizer related)
        window.ASHRAECallout && React.createElement(window.ASHRAECallout, {
          standard: '90.1',
          context: 'Economizer Control and Energy Optimization'
        }),
        // ASHRAE 36 — High-Performance Sequences (cooling tower/fan tracking)
        window.ASHRAECallout && React.createElement(window.ASHRAECallout, {
          standard: '36',
          context: 'Fan Tracking, Cooling Tower Sequencing, and AHU Control Logic'
        })
      )
    );
  }

  return ControlsSidebarComponent;
})();

// Attach to window — no import/export
window.ControlsSidebar = ControlsSidebar;
