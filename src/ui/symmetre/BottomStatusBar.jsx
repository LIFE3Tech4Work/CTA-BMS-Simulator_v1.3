/* BottomStatusBar.jsx — Bottom status bar for SymmetrE Station
 * Shows: simulation clock timestamp | selected point BACnet path | product branding
 * No import/export — exposes window.BottomStatusBar
 * Reads from: window.SimulationContext, window.PointRegistryContext
 */

const BottomStatusBar = (function() {
  const { useContext, useMemo } = React;

  // ─── Timestamp Formatting ───────────────────────────────────────────────────
  // Formats simulation time as: "May 1, 2026 14:30:00 EDT"
  function formatSimulationTimestamp(currentRow, interpolationFraction) {
    // Simulation starts May 1, 2026 00:00 at row 1
    // Each row = 1 hour, so row 1 = May 1 00:00, row 2 = May 1 01:00, etc.
    const startDate = new Date(2026, 4, 1, 0, 0, 0); // May 1, 2026 00:00:00
    const totalHours = (currentRow - 1) + (interpolationFraction || 0);
    const simDate = new Date(startDate.getTime() + totalHours * 3600000);

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

    // Format the current simulation timestamp
    const timestamp = useMemo(function() {
      return formatSimulationTimestamp(
        simulation.currentRow || 1,
        simulation.interpolationFraction || 0
      );
    }, [simulation.currentRow, simulation.interpolationFraction]);

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
        React.createElement('span', { className: 'text-green-400' }, '●'),
        React.createElement('span', null, timestamp)
      ),
      // Center: Selected point BACnet path
      React.createElement('div', {
        className: 'flex-1 text-center text-gray-400 font-mono',
        'aria-label': 'Selected point'
      }, selectedPointPath || ''),
      // Right: Product branding
      React.createElement('div', {
        className: 'text-gray-500 italic'
      }, 'Honeywell SymmetrE R410.2')
    );
  }

  return StatusBar;
})();

// Expose globally
window.BottomStatusBar = BottomStatusBar;
