/* PointBadge.jsx — Point type badge component
 * Shows point type badge: "AI", "AO", "BI", or "BO"
 * Color-coded: AI=green, AO=blue, BI=yellow, BO=orange
 * Props: { type, persistent } — when persistent=true always shows, otherwise only on hover
 * No import/export — exposes window.PointBadge
 */

const PointBadge = (function() {

  // Color mapping for each point type
  const TYPE_COLORS = {
    'AI': 'bg-green-600',
    'AO': 'bg-blue-600',
    'BI': 'bg-yellow-600',
    'BO': 'bg-orange-600'
  };

  /**
   * PointBadge component
   * @param {Object} props
   * @param {string} props.type - Point type: "AI", "AO", "BI", or "BO"
   * @param {boolean} props.persistent - When true, badge always shows; otherwise only on hover (parent manages visibility)
   */
  function Badge(props) {
    var type = props.type;
    var persistent = props.persistent;

    var colorClass = TYPE_COLORS[type] || 'bg-gray-600';

    // If not persistent, the component is expected to be shown/hidden by its parent
    // via hover handlers. The badge itself just renders when present.
    var visibilityClass = persistent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';

    return React.createElement('span', {
      className: [
        'inline-flex items-center justify-center',
        'px-1.5 py-0.5 rounded text-xs font-bold text-white',
        'transition-opacity duration-150',
        colorClass,
        visibilityClass
      ].join(' '),
      'aria-label': 'Point type: ' + type
    }, type);
  }

  return Badge;
})();

// Expose globally
window.PointBadge = PointBadge;
