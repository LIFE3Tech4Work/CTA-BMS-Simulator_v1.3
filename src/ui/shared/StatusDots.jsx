/* StatusDots.jsx — Status indicator dots component
 * 4 status dots in a row: Alarm, Fault, Overridden, Out-of-Service
 * Each dot: hollow gray circle (inactive) or filled colored circle (active)
 *   - Alarm: red when active
 *   - Fault: amber when active
 *   - Overridden: amber when active
 *   - Out-of-Service: gray-filled when active
 * Props: { alarm, fault, overridden, outOfService } (booleans)
 * No import/export — exposes window.StatusDots
 */

const StatusDots = (function() {

  // Dot configuration: label, active color, inactive style
  var DOT_CONFIG = [
    { key: 'alarm', label: 'Alarm', activeColor: 'bg-red-500', activeBorder: 'border-red-500' },
    { key: 'fault', label: 'Fault', activeColor: 'bg-amber-500', activeBorder: 'border-amber-500' },
    { key: 'overridden', label: 'Overridden', activeColor: 'bg-purple-500', activeBorder: 'border-purple-500' },
    { key: 'outOfService', label: 'Out-of-Service', activeColor: 'bg-gray-500', activeBorder: 'border-gray-500' }
  ];

  /**
   * Single dot renderer
   */
  function Dot(props) {
    var active = props.active;
    var config = props.config;

    var baseClasses = 'w-3 h-3 rounded-full border-2';

    var stateClasses = active
      ? config.activeColor + ' ' + config.activeBorder
      : 'bg-transparent border-gray-500';

    return React.createElement('span', {
      className: baseClasses + ' ' + stateClasses,
      title: config.label + (active ? ' (active)' : ' (inactive)'),
      'aria-label': config.label + ': ' + (active ? 'active' : 'inactive'),
      role: 'img'
    });
  }

  /**
   * StatusDots component
   * @param {Object} props
   * @param {boolean} props.alarm - Alarm state active
   * @param {boolean} props.fault - Fault state active
   * @param {boolean} props.overridden - Overridden state active
   * @param {boolean} props.outOfService - Out-of-Service state active
   */
  function Dots(props) {
    var alarm = props.alarm || false;
    var fault = props.fault || false;
    var overridden = props.overridden || false;
    var outOfService = props.outOfService || false;

    var states = {
      alarm: alarm,
      fault: fault,
      overridden: overridden,
      outOfService: outOfService
    };

    return React.createElement('div', {
      className: 'flex items-center gap-1.5',
      'aria-label': 'Point status indicators',
      role: 'group'
    },
      DOT_CONFIG.map(function(config) {
        return React.createElement(Dot, {
          key: config.key,
          active: states[config.key],
          config: config
        });
      })
    );
  }

  return Dots;
})();

// Expose globally
window.StatusDots = StatusDots;
