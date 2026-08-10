/**
 * WorksheetSections.jsx — 5 capstone worksheet section components
 *
 * Each section has:
 * - Title
 * - Instructional prompt text
 * - Text input area (max 2000 characters)
 *
 * Section titles:
 * 1. "Building Overview & Energy Performance"
 * 2. "BMS Data Analysis"
 * 3. "Fault Detection & Diagnosis"
 * 4. "LL97 Compliance Assessment"
 * 5. "Recommendations & Action Items"
 *
 * No import/export — exposes as window.WorksheetSections.
 * Validates: Requirements 22.2
 */

(function () {
  'use strict';

  var MAX_CHARS = 2000;

  // ─── Section Definitions ────────────────────────────────────────────────────

  var SECTIONS = [
    {
      id: 1,
      title: 'Building Overview & Energy Performance',
      prompt: 'Describe the building type, location, and key energy performance metrics. ' +
        'Reference LL84 data to characterize the building\'s energy profile including ' +
        'site energy intensity (kBTU/ft²), electric and steam consumption, and year-over-year trends. ' +
        'Compare to peer benchmarks where applicable.'
    },
    {
      id: 2,
      title: 'BMS Data Analysis',
      prompt: 'Analyze the BMS trend data for AHU-4-4 and AHU-4-6, and the VAV-4-4-02 ' +
        '(Ballroom) terminal unit they serve. Identify patterns in ' +
        'supply air temperature, fan speed, damper positions, reheat valve operation, ' +
        'and zone conditions. Reference specific data points and time periods observed ' +
        'in the simulator. Note any anomalies or areas requiring further investigation.'
    },
    {
      id: 3,
      title: 'Fault Detection & Diagnosis',
      prompt: 'Document any faults or abnormal conditions detected through your analysis, ' +
        'at both the AHU and VAV level (e.g., excessive reheat — discharge air already ' +
        'cooled to design temperature being reheated at the VAV box). For each fault, ' +
        'describe: the condition observed, the affected equipment, potential root causes, ' +
        'and the impact on building performance and occupant comfort. Reference ASHRAE ' +
        'standards where applicable.'
    },
    {
      id: 4,
      title: 'LL97 Compliance Assessment',
      prompt: 'Assess the building\'s compliance posture under NYC Local Law 97. ' +
        'Calculate or estimate the carbon intensity (kgCO2e/ft²) and compare to ' +
        'the applicable 2024 and 2030 limits. Identify which emission sources ' +
        'contribute most and where reductions are most achievable.'
    },
    {
      id: 5,
      title: 'Recommendations & Action Items',
      prompt: 'Provide prioritized recommendations for improving building performance. ' +
        'Include: immediate operational fixes (scheduling, setpoints), medium-term ' +
        'improvements (control sequences, maintenance), and long-term capital projects. ' +
        'Estimate energy/carbon savings potential where possible.'
    }
  ];

  // ─── WorksheetSection Component ─────────────────────────────────────────────

  /**
   * Single worksheet section with title, prompt, and text area.
   * @param {Object} props
   * @param {number} props.sectionId - Section number (1-5)
   * @param {string} props.value - Current text content
   * @param {function} props.onChange - Callback(sectionId, newValue)
   */
  function WorksheetSection(props) {
    var sectionId = props.sectionId;
    var value = props.value || '';
    var onChange = props.onChange || function () {};

    var sectionDef = SECTIONS[sectionId - 1];
    if (!sectionDef) return null;

    var charCount = value.length;
    var isNearLimit = charCount > 1800;
    var isAtLimit = charCount >= MAX_CHARS;

    function handleChange(e) {
      var newValue = e.target.value;
      // Enforce max character limit
      if (newValue.length > MAX_CHARS) {
        newValue = newValue.slice(0, MAX_CHARS);
      }
      onChange(sectionId, newValue);
    }

    return React.createElement('div', {
      className: 'flex flex-col h-full',
      'data-section-id': sectionId
    },
      // Section header
      React.createElement('div', {
        className: 'px-4 py-3 border-b border-gray-700'
      },
        React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
          React.createElement('span', {
            className: 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold'
          }, sectionId),
          React.createElement('h3', {
            className: 'text-sm font-semibold text-white'
          }, sectionDef.title)
        )
      ),

      // Prompt text
      React.createElement('div', {
        className: 'px-4 py-3 bg-gray-800/50 border-b border-gray-700'
      },
        React.createElement('p', {
          className: 'text-xs text-gray-400 leading-relaxed italic'
        }, sectionDef.prompt)
      ),

      // Text input area
      React.createElement('div', { className: 'flex-1 flex flex-col p-4 min-h-0' },
        React.createElement('textarea', {
          className: 'flex-1 w-full resize-none rounded border bg-gray-800 text-sm text-gray-100 ' +
            'placeholder-gray-500 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
            'border-gray-600 focus:border-blue-500 transition-colors',
          value: value,
          onChange: handleChange,
          maxLength: MAX_CHARS,
          placeholder: 'Enter your response here (max ' + MAX_CHARS + ' characters)...',
          'aria-label': 'Section ' + sectionId + ' response: ' + sectionDef.title,
          spellCheck: 'true'
        }),

        // Character counter
        React.createElement('div', {
          className: 'flex items-center justify-between mt-2'
        },
          React.createElement('span', {
            className: 'text-xs ' +
              (isAtLimit ? 'text-red-400 font-medium' :
                isNearLimit ? 'text-yellow-400' : 'text-gray-500')
          }, charCount + ' / ' + MAX_CHARS + ' characters'),
          isAtLimit && React.createElement('span', {
            className: 'text-xs text-red-400'
          }, 'Character limit reached')
        )
      )
    );
  }

  // ─── Expose on window ──────────────────────────────────────────────────────

  window.WorksheetSection = WorksheetSection;
  window.WorksheetSections = {
    SECTIONS: SECTIONS,
    MAX_CHARS: MAX_CHARS
  };

})();
