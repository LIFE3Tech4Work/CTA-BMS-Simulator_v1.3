/**
 * WorksheetSidebar.jsx — Section navigation and progress tracker for Capstone worksheet
 *
 * Displays a vertical sidebar showing:
 * - Progress indicator (X/5 sections complete)
 * - Section navigation links with completion status
 * - Visual indicator for active section
 *
 * A section is "complete" when it has any text content (non-empty).
 *
 * No import/export — exposes as window.WorksheetSidebar.
 * Validates: Requirements 22.1, 22.2
 */

(function () {
  'use strict';

  var SECTION_TITLES = [
    'Building Overview & Energy Performance',
    'BMS Data Analysis',
    'Fault Detection & Diagnosis',
    'LL97 Compliance Assessment',
    'Recommendations & Action Items'
  ];

  /**
   * WorksheetSidebar component
   * @param {Object} props
   * @param {number} props.activeSection - Currently active section (1-5)
   * @param {function} props.onSectionSelect - Callback when a section is clicked
   * @param {string[]} props.sectionContents - Array of 5 section text contents
   */
  function WorksheetSidebar(props) {
    var activeSection = props.activeSection || 1;
    var onSectionSelect = props.onSectionSelect || function () {};
    var sectionContents = props.sectionContents || ['', '', '', '', ''];

    // Count completed sections (any non-empty text)
    var completedCount = 0;
    for (var i = 0; i < sectionContents.length; i++) {
      if (sectionContents[i] && sectionContents[i].trim().length > 0) {
        completedCount++;
      }
    }

    return React.createElement('div', {
      className: 'flex flex-col h-full bg-gray-850 border-r border-gray-700 py-3 px-2 overflow-y-auto overflow-x-hidden',
      'aria-label': 'Worksheet navigation'
    },
      // Progress indicator
      React.createElement('div', {
        className: 'px-2 pb-3 mb-3 border-b border-gray-700'
      },
        React.createElement('div', {
          className: 'text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'
        }, 'Progress'),
        React.createElement('div', {
          className: 'flex items-center gap-2'
        },
          React.createElement('span', {
            className: 'text-lg font-bold ' +
              (completedCount === 5 ? 'text-green-400' : 'text-blue-400')
          }, completedCount),
          React.createElement('span', {
            className: 'text-xs text-gray-500'
          }, '/ 5 sections')
        ),
        // Progress bar
        React.createElement('div', {
          className: 'mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden'
        },
          React.createElement('div', {
            className: 'h-full rounded-full transition-all duration-300 ' +
              (completedCount === 5 ? 'bg-green-500' : 'bg-blue-500'),
            style: { width: (completedCount / 5 * 100) + '%' },
            role: 'progressbar',
            'aria-valuenow': completedCount,
            'aria-valuemin': 0,
            'aria-valuemax': 5,
            'aria-label': completedCount + ' of 5 sections complete'
          })
        )
      ),

      // Section navigation links
      React.createElement('nav', {
        className: 'flex-1 overflow-auto',
        'aria-label': 'Worksheet sections'
      },
        SECTION_TITLES.map(function (title, idx) {
          var sectionNum = idx + 1;
          var isActive = activeSection === sectionNum;
          var isComplete = sectionContents[idx] && sectionContents[idx].trim().length > 0;

          return React.createElement('button', {
            key: sectionNum,
            type: 'button',
            className: 'w-full text-left px-2 py-2 mb-1 rounded text-xs transition-colors ' +
              (isActive
                ? 'bg-blue-900/50 border border-blue-600/50 text-blue-200'
                : 'hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 border border-transparent'),
            onClick: function () { onSectionSelect(sectionNum); },
            'aria-current': isActive ? 'true' : undefined,
            'aria-label': 'Section ' + sectionNum + ': ' + title +
              (isComplete ? ' (complete)' : ' (incomplete)')
          },
            React.createElement('div', { className: 'flex items-center gap-2' },
              // Status indicator
              React.createElement('span', {
                className: 'flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold ' +
                  (isComplete
                    ? 'bg-green-600 text-white'
                    : isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-600 text-gray-400')
              }, isComplete ? '✓' : sectionNum),
              // Section title
              React.createElement('span', {
                className: 'truncate leading-tight'
              }, title)
            )
          );
        })
      ),

      // Completion summary at bottom
      completedCount === 5 && React.createElement('div', {
        className: 'mt-3 px-2 pt-3 border-t border-gray-700'
      },
        React.createElement('div', {
          className: 'text-xs text-green-400 font-medium flex items-center gap-1'
        },
          React.createElement('span', null, '✓'),
          React.createElement('span', null, 'All sections complete')
        )
      )
    );
  }

  // Expose globally
  window.WorksheetSidebar = WorksheetSidebar;

})();
