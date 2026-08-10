/* OverrideIndicator.jsx — Manual Override indicator component
 * Amber background + "Manual" text indicator
 * Shows when a point is in Manual Override mode
 * Props: { active } — when active=true shows the indicator
 * No import/export — exposes window.OverrideIndicator
 */

const OverrideIndicator = (function() {

  /**
   * OverrideIndicator component
   * @param {Object} props
   * @param {boolean} props.active - When true, shows the amber "Manual" indicator
   */
  function Indicator(props) {
    var active = props.active;

    if (!active) {
      return null;
    }

    return React.createElement('span', {
      className: [
        'inline-flex items-center',
        'px-2 py-0.5 rounded text-xs font-semibold',
        'bg-purple-600 text-white'
      ].join(' '),
      'aria-label': 'Manual Override active'
    }, 'Manual');
  }

  return Indicator;
})();

// Expose globally
window.OverrideIndicator = OverrideIndicator;
