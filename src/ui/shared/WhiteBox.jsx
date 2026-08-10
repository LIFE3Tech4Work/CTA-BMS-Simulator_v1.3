/* WhiteBox.jsx — Editable field value container
 * White background, dark text, subtle border
 * Props: { children, onClick } — clickable to enter edit mode
 * No import/export — exposes window.WhiteBox
 */

const WhiteBox = (function() {

  /**
   * WhiteBox component - container for editable field values
   * @param {Object} props
   * @param {*} props.children - Content to display inside the box
   * @param {Function} props.onClick - Click handler to enter edit mode
   */
  function Box(props) {
    var children = props.children;
    var onClick = props.onClick;

    return React.createElement('div', {
      className: [
        'bg-white text-gray-900',
        'border border-gray-300 rounded',
        'px-2 py-1 text-sm',
        'cursor-pointer hover:border-blue-400',
        'transition-colors duration-150',
        'select-none'
      ].join(' '),
      onClick: onClick || null,
      role: 'button',
      tabIndex: 0,
      'aria-label': 'Editable value field',
      onKeyDown: function(e) {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          e.preventDefault();
          onClick(e);
        }
      }
    }, children);
  }

  return Box;
})();

// Expose globally
window.WhiteBox = WhiteBox;
