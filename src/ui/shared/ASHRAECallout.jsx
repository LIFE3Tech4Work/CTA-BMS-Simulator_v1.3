/**
 * ASHRAECallout.jsx — ASHRAE standard reference sidebar component
 *
 * Displays ASHRAE standard references relevant to the current screen context.
 * Supported standards:
 *   - ASHRAE 55: Thermal Comfort (zone temp areas)
 *   - ASHRAE 62.1: Ventilation (CO2/ventilation areas)
 *   - ASHRAE 90.1: Energy Efficiency (energy/economizer areas)
 *   - ASHRAE 36: High-Performance Sequences of Operation (cooling tower areas)
 *
 * Props:
 *   { standard: "55" | "62.1" | "90.1" | "36", context: string }
 *
 * No import/export — exposes as window.ASHRAECallout.
 * Validates: Requirements 26.2
 */

(function () {
  'use strict';

  // ─── ASHRAE Standard Reference Data ─────────────────────────────────────────

  var ASHRAE_STANDARDS = {
    '55': {
      number: '55',
      title: 'Thermal Environmental Conditions for Human Occupancy',
      shortTitle: 'Thermal Comfort',
      icon: '🌡️',
      color: 'border-red-500',
      bgColor: 'bg-red-900/20',
      badgeColor: 'bg-red-700',
      relevance: 'Defines acceptable thermal conditions including operative temperature ranges (68–79°F) and humidity limits for occupied spaces.',
      screenContext: 'zone temperature'
    },
    '62.1': {
      number: '62.1',
      title: 'Ventilation and Acceptable Indoor Air Quality',
      shortTitle: 'Ventilation',
      icon: '💨',
      color: 'border-green-500',
      bgColor: 'bg-green-900/20',
      badgeColor: 'bg-green-700',
      relevance: 'Sets minimum outdoor air ventilation rates and CO₂ concentration limits (typically 1000 ppm above outdoor) to maintain acceptable indoor air quality.',
      screenContext: 'CO2/ventilation'
    },
    '90.1': {
      number: '90.1',
      title: 'Energy Standard for Sites and Buildings',
      shortTitle: 'Energy Efficiency',
      icon: '⚡',
      color: 'border-yellow-500',
      bgColor: 'bg-yellow-900/20',
      badgeColor: 'bg-yellow-700',
      relevance: 'Establishes minimum energy efficiency requirements including economizer operation, simultaneous heating/cooling limits, and equipment efficiency standards.',
      screenContext: 'energy/economizer'
    },
    '36': {
      number: '36',
      title: 'High-Performance Sequences of Operation for HVAC Systems',
      shortTitle: 'HP Sequences',
      icon: '🔄',
      color: 'border-blue-500',
      bgColor: 'bg-blue-900/20',
      badgeColor: 'bg-blue-700',
      relevance: 'Provides standardized control sequences for cooling towers, AHUs, and terminal units to optimize energy performance and maintain comfort.',
      screenContext: 'cooling tower'
    }
  };

  /**
   * ASHRAECallout component
   * @param {Object} props
   * @param {string} props.standard - Standard identifier: "55", "62.1", "90.1", or "36"
   * @param {string} [props.context] - Optional contextual note about where this callout appears
   */
  function ASHRAECallout(props) {
    var standard = props.standard;
    var context = props.context || '';

    var data = ASHRAE_STANDARDS[standard];

    if (!data) {
      return React.createElement('div', {
        className: 'text-xs text-red-400 p-2'
      }, 'Unknown ASHRAE standard: ' + standard);
    }

    var stateExpanded = React.useState(false);
    var expanded = stateExpanded[0];
    var setExpanded = stateExpanded[1];

    return React.createElement('div', {
      className: [
        'rounded border-l-4 p-3 mb-3 transition-all duration-200',
        data.color,
        data.bgColor
      ].join(' '),
      role: 'complementary',
      'aria-label': 'ASHRAE Standard ' + data.number + ' reference'
    },
      // Header row: icon + badge + title
      React.createElement('div', {
        className: 'flex items-start gap-2 cursor-pointer select-none',
        onClick: function () { setExpanded(!expanded); },
        role: 'button',
        'aria-expanded': expanded ? 'true' : 'false',
        tabIndex: 0,
        onKeyDown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }
      },
        // Icon
        React.createElement('span', {
          className: 'text-base flex-shrink-0 mt-0.5',
          'aria-hidden': 'true'
        }, data.icon),
        // Text content
        React.createElement('div', { className: 'flex-1 min-w-0' },
          // Standard badge + short title
          React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' },
            React.createElement('span', {
              className: 'inline-block px-1.5 py-0.5 rounded text-xs font-bold text-white ' + data.badgeColor
            }, 'ASHRAE ' + data.number),
            React.createElement('span', {
              className: 'text-xs font-medium text-gray-200'
            }, data.shortTitle)
          ),
          // Full title (shown when expanded)
          expanded && React.createElement('p', {
            className: 'text-xs text-gray-400 mt-1 italic'
          }, data.title)
        ),
        // Expand/collapse indicator
        React.createElement('span', {
          className: 'text-gray-500 text-xs flex-shrink-0 mt-1 transition-transform duration-200 ' +
            (expanded ? 'rotate-180' : ''),
          'aria-hidden': 'true'
        }, '▼')
      ),

      // Expanded content: relevance note + context
      expanded && React.createElement('div', {
        className: 'mt-2 pl-7'
      },
        // Relevance note
        React.createElement('p', {
          className: 'text-xs text-gray-300 leading-relaxed'
        }, data.relevance),
        // Context note (if provided)
        context && React.createElement('p', {
          className: 'text-xs text-gray-500 mt-1.5 italic'
        }, '📍 ' + context)
      )
    );
  }

  // ─── ChapterIndex — 14-chapter navigation component ─────────────────────────
  // Allows 2-click access from mode selection to any chapter.

  function ChapterIndex(props) {
    var onNavigate = props.onNavigate || function () {};
    var compact = props.compact || false;

    // Get chapters from window.CHAPTERS or fallback
    var chapters = window.CHAPTERS || [];

    var stateExpanded = React.useState(!compact);
    var expanded = stateExpanded[0];
    var setExpanded = stateExpanded[1];

    function handleChapterClick(chapter) {
      // Navigate to the chapter's route
      if (chapter.route) {
        window.location.hash = chapter.route;
      }
      // Call external callback
      onNavigate(chapter);
    }

    return React.createElement('div', {
      className: 'rounded-lg border border-gray-600 bg-gray-800/80 overflow-hidden',
      role: 'navigation',
      'aria-label': 'CTA Reference Guide chapters'
    },
      // Header
      React.createElement('div', {
        className: 'flex items-center justify-between px-3 py-2 bg-gray-700/50 cursor-pointer select-none',
        onClick: function () { setExpanded(!expanded); },
        role: 'button',
        'aria-expanded': expanded ? 'true' : 'false',
        tabIndex: 0,
        onKeyDown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }
      },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', { 'aria-hidden': 'true' }, '📚'),
          React.createElement('span', { className: 'text-sm font-semibold text-white' },
            'CTA Reference Guide'),
          React.createElement('span', { className: 'text-xs text-gray-400' },
            '(' + chapters.length + ' chapters)')
        ),
        React.createElement('span', {
          className: 'text-gray-400 text-xs transition-transform duration-200 ' +
            (expanded ? 'rotate-180' : ''),
          'aria-hidden': 'true'
        }, '▼')
      ),

      // Chapter list
      expanded && React.createElement('div', {
        className: 'max-h-80 overflow-y-auto divide-y divide-gray-700/50'
      },
        chapters.map(function (chapter) {
          return React.createElement('button', {
            key: chapter.id,
            type: 'button',
            className: 'w-full text-left px-3 py-2 hover:bg-gray-700/50 transition-colors ' +
              'flex items-start gap-2 group',
            onClick: function () { handleChapterClick(chapter); },
            'aria-label': 'Chapter ' + chapter.id + ': ' + chapter.title
          },
            // Chapter number badge
            React.createElement('span', {
              className: 'flex-shrink-0 w-5 h-5 rounded-full bg-gray-600 group-hover:bg-blue-600 ' +
                'flex items-center justify-center text-xs font-bold text-gray-300 group-hover:text-white ' +
                'transition-colors mt-0.5'
            }, chapter.id),
            // Title + description
            React.createElement('div', { className: 'flex-1 min-w-0' },
              React.createElement('div', {
                className: 'text-xs font-medium text-gray-200 group-hover:text-white truncate'
              }, chapter.title),
              !compact && React.createElement('p', {
                className: 'text-xs text-gray-500 mt-0.5 line-clamp-1'
              }, chapter.description)
            ),
            // ASHRAE badges if applicable
            chapter.ashraeStandards && chapter.ashraeStandards.length > 0 &&
              React.createElement('div', { className: 'flex gap-1 flex-shrink-0 mt-0.5' },
                chapter.ashraeStandards.map(function (std) {
                  return React.createElement('span', {
                    key: std,
                    className: 'text-xs px-1 rounded bg-gray-600 text-gray-400'
                  }, std);
                })
              )
          );
        })
      )
    );
  }

  // ─── TroubleshootingCard — Chapter 14 collapsible card for Capstone ──────────

  function TroubleshootingCard() {
    var stateExpanded = React.useState(false);
    var expanded = stateExpanded[0];
    var setExpanded = stateExpanded[1];

    var framework = [
      { step: 1, title: 'Symptom Identification', detail: 'Identify the reported or observed symptom. What is the occupant complaint or alarm condition? Document the specific deviation from expected behavior.' },
      { step: 2, title: 'Subsystem Isolation', detail: 'Determine which mechanical subsystem is responsible. Is this an airside issue (AHU, VAV), waterside issue (chiller, boiler, cooling tower), or controls issue (sensor, actuator, programming)?' },
      { step: 3, title: 'Related Point Investigation', detail: 'Examine BMS trend data for the affected point and related points. Look for correlation patterns, timing relationships, and upstream/downstream effects.' },
      { step: 4, title: 'Physical Verification', detail: 'Compare BMS readings against physical conditions. Verify sensor calibration, check actuator position, confirm equipment operation matches commanded state.' },
      { step: 5, title: 'Root Cause Determination', detail: 'Based on data analysis and physical verification, identify the root cause. Distinguish between control logic errors, equipment failures, and design deficiencies.' },
      { step: 6, title: 'Corrective Action', detail: 'Recommend specific corrective actions. Include immediate mitigation (restore comfort/safety), short-term fix (repair/recalibrate), and long-term improvement (redesign/retune).' }
    ];

    return React.createElement('div', {
      className: 'rounded-lg border border-amber-700/50 bg-amber-900/10 overflow-hidden mb-4',
      role: 'region',
      'aria-label': 'Chapter 14: Troubleshooting Framework'
    },
      // Header (always visible)
      React.createElement('div', {
        className: 'flex items-center justify-between px-3 py-2.5 bg-amber-900/20 cursor-pointer select-none ' +
          'hover:bg-amber-900/30 transition-colors',
        onClick: function () { setExpanded(!expanded); },
        role: 'button',
        'aria-expanded': expanded ? 'true' : 'false',
        tabIndex: 0,
        onKeyDown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }
      },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', {
            className: 'text-base',
            'aria-hidden': 'true'
          }, '🔧'),
          React.createElement('span', {
            className: 'text-sm font-semibold text-amber-200'
          }, 'Ch. 14: Troubleshooting Framework'),
          React.createElement('span', {
            className: 'text-xs px-1.5 py-0.5 rounded bg-amber-800/50 text-amber-300 font-medium'
          }, '6 steps')
        ),
        React.createElement('span', {
          className: 'text-amber-400 text-xs transition-transform duration-200 ' +
            (expanded ? 'rotate-180' : ''),
          'aria-hidden': 'true'
        }, '▼')
      ),

      // Expanded content: 6-step framework
      expanded && React.createElement('div', {
        className: 'px-3 py-3 space-y-3'
      },
        // Introduction
        React.createElement('p', {
          className: 'text-xs text-gray-400 italic mb-2'
        }, 'Use this systematic framework to diagnose BMS issues. Follow each step in order for consistent troubleshooting results.'),
        // Steps
        framework.map(function (item) {
          return React.createElement('div', {
            key: item.step,
            className: 'flex items-start gap-2'
          },
            // Step number
            React.createElement('span', {
              className: 'flex-shrink-0 w-5 h-5 rounded-full bg-amber-800 ' +
                'flex items-center justify-center text-xs font-bold text-amber-200 mt-0.5'
            }, item.step),
            // Step content
            React.createElement('div', { className: 'flex-1' },
              React.createElement('div', {
                className: 'text-xs font-semibold text-amber-100'
              }, item.title),
              React.createElement('p', {
                className: 'text-xs text-gray-400 mt-0.5 leading-relaxed'
              }, item.detail)
            )
          );
        })
      )
    );
  }

  // ─── Expose on window ──────────────────────────────────────────────────────

  window.ASHRAECallout = ASHRAECallout;
  window.ChapterIndex = ChapterIndex;
  window.TroubleshootingCard = TroubleshootingCard;

  // Also expose the standards data for potential reuse
  window.ASHRAE_STANDARDS = ASHRAE_STANDARDS;

})();
