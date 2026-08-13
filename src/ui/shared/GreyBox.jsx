/* GreyBox.jsx — Read-only field value container
 * Gray background, darker text
 * Props: { children } — not clickable
 * No import/export — exposes window.GreyBox
 */

const GreyBox = (function() {

  /**
   * GreyBox component - container for read-only field values
   * @param {Object} props
   * @param {*} props.children - Content to display inside the box
   */
  function Box(props) {
    var children = props.children;

    return React.createElement('div', {
      className: [
        'bg-gray-200 text-gray-800',
        'border border-gray-300 rounded',
        'px-2 py-1 text-sm',
        'select-none'
      ].join(' '),
      'aria-label': 'Read-only value field'
    }, children);
  }

  return Box;
})();

// Expose globally
window.GreyBox = GreyBox;
