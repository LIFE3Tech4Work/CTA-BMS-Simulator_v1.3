/* BottomStatusBar.jsx — Bottom status bar for SymmetrE Station
 * Shows: simulation clock timestamp | selected point BACnet path | product branding
 * No import/export — exposes window.BottomStatusBar
 * Reads from: window.SimulationContext, window.PointRegistryContext
 */

const BottomStatusBar = (function() {
  const { useContext, useMemo, useState, useEffect } = React;

  // ─── Timestamp Formatting ───────────────────────────────────────────────────
  // Formats simulation time as: "Aug 17, 2025 14:30:00 EDT"
  function formatSimulationTimestamp(currentRow, interpolationFraction, overrideDate) {
    // The engine owns the clock. This used to reconstruct the date from a
    // hardcoded May 1 2026 base, which stamped August weather with a June date
    // once the simulator moved to the full Jul 2025 – Jun 2026 fiscal year.
    // getCurrentTimestamp() also resolves the seasonal opening row, which a
    // context row of 1 does not reflect before the clock is started.
    const eng = window.SimulationEngine;
    let simDate;
    // A season preset holds a real recorded reading from a specific day, so the
    // clock shows THAT day — otherwise picking Winter left the clock on the live
    // summer date while every reading beside it said January.
    if (overrideDate) {
      simDate = overrideDate;
    } else if (eng && typeof eng.getCurrentTimestamp === 'function') {
      // The engine is always at least as fresh as the context, which mirrors it
      // through tick events and still reads row 1 before the clock is started.
      simDate = eng.getCurrentTimestamp();
    } else {
      const startDate = (eng && eng.BASE_DATE)
        ? new Date(eng.BASE_DATE.getTime())
        : new Date('2025-07-01T00:00:00-04:00');
      const totalHours = (currentRow - 1) + (interpolationFraction || 0);
      simDate = new Date(startDate.getTime() + totalHours * 3600000);
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[simDate.getMonth()];
    const day = simDate.getDate();
    const year = simDate.getFullYear();
    const hours = String(simDate.getHours()).padStart(2, '0');
    const minutes = String(simDate.getMinutes()).padStart(2, '0');
    const seconds = String(simDate.getSeconds()).padStart(2, '0');

    return month + ' ' + day + ', ' + year + ' ' + hours + ':' + minutes + ':' + seconds + ' EDT';
  }

  // ─── Component ──────────────────────────────────────────────────────────────
  function StatusBar() {
    const simulation = useContext(window.SimulationContext);
    const pointRegistry = useContext(window.PointRegistryContext);

    // Weather override state, so the clock can follow a season selection.
    const [ovr, setOvr] = useState(function () {
      return window.WeatherOverride ? window.WeatherOverride.getState() : { active: false };
    });
    useEffect(function () {
      if (!window.WeatherOverride) return;
      return window.WeatherOverride.subscribe(setOvr);
    }, []);

    const overrideDate = (ovr && ovr.active && ovr.date) ? ovr.date : null;

    // Format the current simulation timestamp
    const timestamp = useMemo(function() {
      return formatSimulationTimestamp(
        simulation.currentRow || 1,
        simulation.interpolationFraction || 0,
        overrideDate
      );
    }, [simulation.currentRow, simulation.interpolationFraction, overrideDate]);

    // Get selected point BACnet path (if any)
    const selectedPointPath = useMemo(function() {
      if (simulation.selectedPoint) {
        return simulation.selectedPoint;
      }
      return '';
    }, [simulation.selectedPoint]);

    return React.createElement('div', {
      className: 'h-7 bg-gray-800 border-t border-gray-700 px-3 flex items-center justify-between text-xs select-none overflow-hidden',
      role: 'status',
      'aria-label': 'Status bar'
    },
      // Left: Simulation clock timestamp
      React.createElement('div', {
        className: 'flex items-center gap-2 text-gray-300',
        'aria-label': 'Simulation time'
      },
        React.createElement('span', {
          className: (ovr && ovr.active) ? '' : 'text-green-400',
          style: (ovr && ovr.active) ? { color: '#ff9bec' } : null
        }, '●'),
        React.createElement('span', null, timestamp),
        // Says why the clock is not advancing, rather than leaving a frozen
        // timestamp looking like a stalled app.
        (ovr && ovr.active) ? React.createElement('span', {
          style: { color: '#ff9bec', fontWeight: 700, letterSpacing: '.3px' }
        }, overrideDate ? 'HELD — weather override' : 'HELD — custom weather') : null
      ),
      // Center: Selected point BACnet path
      React.createElement('div', {
        className: 'flex-1 text-center text-gray-400 font-mono',
        'aria-label': 'Selected point'
      }, selectedPointPath || ''),
      // Right: Product branding
      React.createElement('div', {
        className: 'text-gray-500 italic'
      }, 'LIFE3 SymmetrE R410.2')
    );
  }

  return StatusBar;
})();

// Expose globally
window.BottomStatusBar = BottomStatusBar;
