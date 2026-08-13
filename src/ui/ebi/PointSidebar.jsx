/* PointSidebar.jsx — Left panel in the EBI Point Detail view
 * Shows: vertical bar chart, status dots, present value with units, mode indicator
 * No import/export — exposes window.EBIPointSidebar
 * Reads from: window.PointRegistry (getValue, getMetadata, subscribe)
 *
 * Props: { pointId } — BACnet address of the point to display
 */

const EBIPointSidebar = (function() {
  const { useState, useEffect, useCallback, useContext, useRef } = React;

  // ─── Constants ──────────────────────────────────────────────────────────────
  const BAR_FILL_COLOR = '#00BFFF'; // Cyan
  const BAR_BG_COLOR = '#000000';   // Black
  const AMBER_COLOR = '#9333EA';    // Purple for manual override (per Lev's feedback)
  const RED_COLOR = '#FF0000';
  const GRAY_COLOR = '#9CA3AF';     // Tailwind gray-400
  const HOLLOW_GRAY = '#6B7280';    // Tailwind gray-500

  // ─── Vertical Bar Chart Component ──────────────────────────────────────────
  function BarChart({ currentValue, min, max }) {
    // Calculate fill height as percentage of range
    const range = max - min;
    let fillPercent = 0;
    if (range > 0) {
      fillPercent = Math.max(0, Math.min(100, ((currentValue - min) / range) * 100));
    }

    return React.createElement('div', {
      className: 'w-full flex justify-center mb-4',
      'aria-label': 'Value bar chart'
    },
      React.createElement('div', {
        className: 'relative w-10 h-40 border border-gray-600 rounded-sm',
        style: { backgroundColor: BAR_BG_COLOR }
      },
        // Filled bar (grows from bottom)
        React.createElement('div', {
          className: 'absolute bottom-0 left-0 right-0 rounded-b-sm transition-all duration-300',
          style: {
            backgroundColor: BAR_FILL_COLOR,
            height: fillPercent + '%'
          },
          role: 'meter',
          'aria-valuenow': currentValue,
          'aria-valuemin': min,
          'aria-valuemax': max,
          'aria-label': 'Point value: ' + currentValue.toFixed(1) + ' (' + fillPercent.toFixed(0) + '%)'
        }),
        // Max label
        React.createElement('span', {
          className: 'absolute -right-8 top-0 text-xs text-gray-400'
        }, max),
        // Min label
        React.createElement('span', {
          className: 'absolute -right-8 bottom-0 text-xs text-gray-400'
        }, min)
      )
    );
  }

  // ─── Status Dot Component ──────────────────────────────────────────────────
  function StatusDot({ label, active, activeColor }) {
    const size = 14;
    const radius = 5;
    const cx = size / 2;
    const cy = size / 2;
    const PURPLE_COLOR = '#9333EA';

    // Use purple for Overridden dot
    var fillColor = activeColor;
    if (label === 'Ovrd' && active) {
      fillColor = PURPLE_COLOR;
    }

    return React.createElement('div', {
      className: 'flex flex-col items-center gap-1',
      title: label + ': ' + (active ? 'Active' : 'Inactive')
    },
      React.createElement('svg', {
        width: size,
        height: size,
        'aria-label': label + ' status: ' + (active ? 'active' : 'inactive')
      },
        active
          // Filled colored circle when active
          ? React.createElement('circle', {
              cx: cx,
              cy: cy,
              r: radius,
              fill: fillColor,
              stroke: fillColor,
              strokeWidth: 1
            })
          // Hollow gray circle when inactive
          : React.createElement('circle', {
              cx: cx,
              cy: cy,
              r: radius,
              fill: 'none',
              stroke: HOLLOW_GRAY,
              strokeWidth: 1.5
            })
      ),
      React.createElement('span', {
        className: 'text-xs text-gray-500 leading-none'
      }, label)
    );
  }

  // ─── Status Dots Row ───────────────────────────────────────────────────────
  function StatusDotsRow({ alarmActive, faultActive, overridden, outOfService }) {
    return React.createElement('div', {
      className: 'flex items-center justify-center gap-4 mb-4 py-2',
      'aria-label': 'Point status indicators'
    },
      React.createElement(StatusDot, {
        label: 'Alarm',
        active: alarmActive,
        activeColor: RED_COLOR
      }),
      React.createElement(StatusDot, {
        label: 'Fault',
        active: faultActive,
        activeColor: AMBER_COLOR
      }),
      React.createElement(StatusDot, {
        label: 'Ovrd',
        active: overridden,
        activeColor: AMBER_COLOR
      }),
      React.createElement(StatusDot, {
        label: 'OOS',
        active: outOfService,
        activeColor: GRAY_COLOR
      })
    );
  }

  // ─── Present Value Display ─────────────────────────────────────────────────
  function PresentValue({ value, units }) {
    const displayValue = typeof value === 'number' ? value.toFixed(1) : String(value);

    return React.createElement('div', {
      className: 'text-center mb-4',
      'aria-label': 'Present value'
    },
      React.createElement('div', {
        className: 'text-2xl font-bold text-white'
      }, displayValue),
      React.createElement('div', {
        className: 'text-sm text-gray-400'
      }, units)
    );
  }

  // ─── Mode Indicator ────────────────────────────────────────────────────────
  function ModeIndicator({ mode }) {
    const isManual = mode === 'Manual';
    const PURPLE_COLOR = '#9333EA'; // Purple for manual override

    return React.createElement('div', {
      className: 'text-center',
      'aria-label': 'Point mode: ' + mode
    },
      React.createElement('span', {
        className: isManual
          ? 'inline-block px-3 py-1 text-sm font-semibold text-white rounded'
          : 'inline-block px-3 py-1 text-sm text-gray-300',
        style: isManual ? { backgroundColor: PURPLE_COLOR } : {}
      }, isManual ? 'Manual' : 'Auto')
    );
  }

  // ─── Out of Service Toggle ─────────────────────────────────────────────────
  // Matches the real SymmetrE point-detail layout: a checkbox labeled
  // "Out of Service" sits below the status dots/PV. Checking it is the only
  // way to manually override an Input (AI/BI) point's value — Inputs have no
  // Manual mode of their own, per the Operator Manual.
  //
  // Gated to Oper+ privilege via window.AuthContext — the same threshold
  // ControlsSidebar.jsx already applies to AO/BO editability. This isn't an
  // instructor-only control: in real EBI, any signed-in operator can take a
  // point Out of Service, the same as they can edit a setpoint. A signed-out
  // / ViewOnly visitor sees the checkbox as disabled, not hidden — matching
  // how the rest of the app shows state to unauthenticated viewers.
  function OutOfServiceToggle({ pointId, checked }) {
    const auth = useContext(window.AuthContext);
    const canToggle = window.AuthHelpers
      ? window.AuthHelpers.hasPrivilege((auth && auth.securityLevel) || 'ViewOnly', 'Oper')
      : false;

    const handleChange = useCallback(function(e) {
      if (!canToggle) return;
      const registry = window.PointRegistry;
      if (registry && typeof registry.setOutOfService === 'function') {
        registry.setOutOfService(pointId, e.target.checked);
      }
    }, [pointId, canToggle]);

    return React.createElement('label', {
      className: 'flex items-center gap-2 mt-3 text-xs select-none ' +
        (canToggle ? 'text-gray-300 cursor-pointer' : 'text-gray-600 cursor-not-allowed'),
      title: canToggle ? undefined : 'Requires Operator-level sign-on or higher',
      'aria-label': 'Out of Service toggle'
    },
      React.createElement('input', {
        type: 'checkbox',
        checked: !!checked,
        disabled: !canToggle,
        onChange: handleChange,
        className: 'w-3.5 h-3.5 accent-gray-400 ' + (canToggle ? 'cursor-pointer' : 'cursor-not-allowed')
      }),
      'Out of Service'
    );
  }

  // ─── Main Sidebar Component ────────────────────────────────────────────────
  function PointSidebar({ pointId }) {
    const [pointState, setPointState] = useState(null);
    const mountedRef = useRef(true);

    // Load initial point data and subscribe to updates
    useEffect(function() {
      mountedRef.current = true;
      const registry = window.PointRegistry;
      if (!registry || !pointId) return;

      // Get initial state
      function loadPointState() {
        const value = registry.getValue(pointId);
        const metadata = registry.getMetadata(pointId);
        if (metadata !== undefined) {
          setPointState({
            currentValue: typeof value === 'number' ? value : 0,
            min: metadata.min || 0,
            max: metadata.max || 100,
            units: metadata.units || '',
            mode: metadata.mode || 'Auto',
            alarmState: metadata.alarmState || { lifecycle: 'inactive', acknowledged: true },
            outOfService: metadata.outOfService || false,
            name: metadata.name || ''
          });
        }
      }

      loadPointState();

      // Subscribe to point changes
      function handlePointUpdate(point) {
        if (!mountedRef.current) return;
        setPointState({
          currentValue: typeof point.currentValue === 'number' ? point.currentValue : 0,
          min: point.min || 0,
          max: point.max || 100,
          units: point.units || '',
          mode: point.mode || 'Auto',
          alarmState: point.alarmState || { lifecycle: 'inactive', acknowledged: true },
          outOfService: point.outOfService || false,
          name: point.name || ''
        });
      }

      registry.subscribe(pointId, handlePointUpdate);

      return function() {
        mountedRef.current = false;
        registry.unsubscribe(pointId, handlePointUpdate);
      };
    }, [pointId]);

    // Loading state
    if (!pointState) {
      return React.createElement('div', {
        className: 'w-48 bg-gray-900 border-r border-gray-700 p-4 flex items-center justify-center'
      },
        React.createElement('span', { className: 'text-gray-500 text-sm' }, 'Loading...')
      );
    }

    // Derive status flags
    const alarmActive = pointState.alarmState && pointState.alarmState.lifecycle === 'active';
    const faultActive = false; // Fault is derived from FaultEngine, separate from alarm state
    const outOfService = pointState.outOfService;
    // Per the SymmetrE Operator Manual's point-detail screenshots, "Overridden"
    // reflects the program's control being overridden by the operator in
    // either of the two ways that's possible: Manual mode (Outputs/Values) or
    // Out of Service (any point type, and the only override path Inputs have).
    const overridden = pointState.mode === 'Manual' || outOfService;

    return React.createElement('div', {
      className: 'w-48 bg-gray-900 border-r border-gray-700 p-4 flex flex-col items-center',
      'aria-label': 'Point sidebar for ' + (pointState.name || pointId)
    },
      // Vertical bar chart
      React.createElement(BarChart, {
        currentValue: pointState.currentValue,
        min: pointState.min,
        max: pointState.max
      }),
      // Status dots
      React.createElement(StatusDotsRow, {
        alarmActive: alarmActive,
        faultActive: faultActive,
        overridden: overridden,
        outOfService: outOfService
      }),
      // Present value with units
      React.createElement(PresentValue, {
        value: pointState.currentValue,
        units: pointState.units
      }),
      // Mode indicator
      React.createElement(ModeIndicator, {
        mode: pointState.mode
      }),
      // Out of Service toggle
      React.createElement(OutOfServiceToggle, {
        pointId: pointId,
        checked: outOfService
      })
    );
  }

  return PointSidebar;
})();

// Expose globally — no import/export
window.EBIPointSidebar = EBIPointSidebar;
