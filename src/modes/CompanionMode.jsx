/* CompanionMode.jsx — Instructor-led companion mode with slide prompts
 * 
 * Displays a 30% right panel with a 41-slide prompt system.
 * Pauses the simulation clock when activated.
 * Loads associated scenarios when advancing slides.
 * Shows persistent point type badges when active slide covers BACnet point types.
 *
 * No import/export — exposes window.CompanionMode
 * 
 * Validates: Requirements 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 28.3, 28.4
 */

const CompanionMode = (function () {
  'use strict';

  const { useState, useEffect, useCallback, useRef } = React;

  // ─── Constants ──────────────────────────────────────────────────────────────

  const TOTAL_SLIDES = 41;

  // Map scenario string references from companionSlides.js to numeric scenario IDs
  // These map the slide scenario names to Scenarios array IDs
  const SCENARIO_NAME_MAP = {
    'normal_operation': 1,
    'economizer_lockout': 2,
    'simultaneous_heat_cool': 3,
    'manual_override': 4,
    'co2_sensor_fault': 5,
    'pht_valve_stuck': 6,
    'free_cooling': 7,
    'cooling_tower_fault': 8,
    'high_humidity': 9,
    'nighttime_override': 10,
    'weekend_scheduling_fault': 11,
    'vfd_healthy': 12,
    'peak_cooling': 13,
    'transition_season': 14
  };

  // Slides that demonstrate BACnet point types — show persistent badges
  // These slides explicitly cover point type classification
  const POINT_TYPE_SLIDES = new Set([10, 11, 13, 17]);

  // ─── Helper: Load scenario by name ──────────────────────────────────────────

  function loadScenario(scenarioName) {
    if (!scenarioName) return;

    var scenarioId = SCENARIO_NAME_MAP[scenarioName];
    if (!scenarioId) return;

    // Access scenarios from window global (loaded from src/data/reference/scenarios.js)
    var scenarios = window.COMPANION_SLIDES_SCENARIOS || window.Scenarios;
    if (!scenarios) return;

    var scenario = null;
    for (var i = 0; i < scenarios.length; i++) {
      if (scenarios[i].id === scenarioId) {
        scenario = scenarios[i];
        break;
      }
    }

    if (!scenario) return;

    // Jump simulation to scenario start row
    if (window.SimulationEngine && scenario.startRow) {
      var baseDate = window.SimulationEngine.BASE_DATE;
      var msPerHour = window.SimulationEngine.MS_PER_HOUR || 3600000;
      var targetDate = new Date(baseDate.getTime() + (scenario.startRow - 1) * msPerHour);
      window.SimulationEngine.jumpToDate(targetDate);
    }

    // Apply point overrides if PointRegistry is available
    if (window.PointRegistry && scenario.pointOverrides) {
      var keys = Object.keys(scenario.pointOverrides);
      for (var k = 0; k < keys.length; k++) {
        var address = keys[k];
        var value = scenario.pointOverrides[address];
        if (window.PointRegistry.setValue) {
          window.PointRegistry.setValue(address, value, 'scenario');
        }
      }
    }
  }

  // ─── CompanionMode Component ────────────────────────────────────────────────

  function CompanionModePanel() {
    var slides = window.COMPANION_SLIDES || [];
    if (slides.length === 0 && window.CompanionSlides) {
      slides = window.CompanionSlides;
    }

    var slideCount = slides.length || TOTAL_SLIDES;

    var _slideState = useState(1);
    var currentSlide = _slideState[0];
    var setCurrentSlide = _slideState[1];

    var _boundsMsg = useState('');
    var boundsMessage = _boundsMsg[0];
    var setBoundsMessage = _boundsMsg[1];

    var boundsTimerRef = useRef(null);

    // Pause simulation when companion mode activates (Req 20.2, 20.6)
    // Runs on MOUNT ONLY, and this component stays mounted while the panel is
    // collapsed — so it must not pause again on a re-render, or Start Simulation
    // silently stops a second later and the clock looks frozen.
    useEffect(function () {
      if (window.SimulationEngine) {
        window.SimulationEngine.pause();
      }
    }, []);

    // Load scenario associated with current slide (Req 20.4)
    useEffect(function () {
      if (slides.length > 0 && currentSlide >= 1 && currentSlide <= slideCount) {
        var slide = slides[currentSlide - 1];
        if (slide && slide.scenario) {
          loadScenario(slide.scenario);
        }
      }
    }, [currentSlide, slides, slideCount]);

    // Expose point badge persistent state for AHU graphic (Req 28.3, 28.4)
    useEffect(function () {
      window._companionBadgesActive = POINT_TYPE_SLIDES.has(currentSlide);
      return function () {
        window._companionBadgesActive = false;
      };
    }, [currentSlide]);

    // Navigate to next slide (Req 20.4, 20.5 — bounds check Property 26)
    var goNext = useCallback(function () {
      if (currentSlide >= slideCount) {
        setBoundsMessage('No further slides available.');
        clearTimeout(boundsTimerRef.current);
        boundsTimerRef.current = setTimeout(function () {
          setBoundsMessage('');
        }, 3000);
        return;
      }
      setCurrentSlide(function (prev) { return Math.min(prev + 1, slideCount); });
    }, [currentSlide, slideCount]);

    // Navigate to previous slide (Req 20.5 — bounds check Property 26)
    var goPrevious = useCallback(function () {
      if (currentSlide <= 1) {
        setBoundsMessage('No previous slides available.');
        clearTimeout(boundsTimerRef.current);
        boundsTimerRef.current = setTimeout(function () {
          setBoundsMessage('');
        }, 3000);
        return;
      }
      setCurrentSlide(function (prev) { return Math.max(prev - 1, 1); });
    }, [currentSlide]);

    // Cleanup bounds timer
    useEffect(function () {
      return function () {
        if (boundsTimerRef.current) {
          clearTimeout(boundsTimerRef.current);
        }
      };
    }, []);

    // Get current slide data
    var slideData = slides.length > 0 && currentSlide >= 1 && currentSlide <= slideCount
      ? slides[currentSlide - 1]
      : { slide: currentSlide, title: 'Slide ' + currentSlide, prompt: '', scenario: null };

    // Show persistent PointBadge when slide covers BACnet point types
    var showBadges = POINT_TYPE_SLIDES.has(currentSlide);

    // ─── Render ─────────────────────────────────────────────────────────────

    return React.createElement('div', {
      className: 'flex flex-col h-full text-white',
      style: { background: 'transparent', fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" },
      'aria-label': 'Companion Mode Panel'
    },
      // Header
      React.createElement('div', {
        className: 'flex items-center justify-between',
        style: { padding: '9px 14px 9px 22px', background: '#1b2536',
                 borderBottom: '1px solid #232c3d', flexShrink: 0 }
      },
        React.createElement('div', { className: 'flex items-center gap-2' },
          React.createElement('span', { style: { fontSize: '14px' }, 'aria-hidden': 'true' }, '📖'),
          React.createElement('h2', {
            style: { fontSize: '12.5px', fontWeight: 800, color: '#eef3fa', letterSpacing: '.2px', margin: 0 }
          }, 'Companion Mode')
        ),
        // Slide counter
        React.createElement('span', {
          style: { fontSize: '10.5px', fontWeight: 800, letterSpacing: '.3px', padding: '2px 8px',
                   borderRadius: '9px', background: '#131b28', color: '#9db0c8',
                   border: '1px solid #2b3850', whiteSpace: 'nowrap' },
          'aria-label': 'Slide ' + currentSlide + ' of ' + slideCount
        }, currentSlide + ' / ' + slideCount)
      ),

      // Slide progress rail
      React.createElement('div', {
        style: { height: '3px', background: '#131b28', flexShrink: 0 }
      },
        React.createElement('div', {
          style: { height: '100%', width: ((currentSlide / Math.max(1, slideCount)) * 100) + '%',
                   background: 'linear-gradient(90deg,#3f6fbf,#5b9bd5)', transition: 'width .25s ease' }
        })
      ),

      // Slide content area
      React.createElement('div', { className: 'flex-1 overflow-auto px-4 py-4' },
        // Slide title
        React.createElement('h3', {
          style: { fontSize: '14px', fontWeight: 800, color: '#8fd0ff', lineHeight: 1.3,
                   margin: '0 0 10px 0' }
        }, slideData.title),

        // Instructional text
        React.createElement('p', {
          style: { fontSize: '12.5px', lineHeight: 1.6, color: '#c3cfdd', whiteSpace: 'pre-wrap', margin: 0 }
        }, slideData.prompt),

        // Scenario indicator
        slideData.scenario && React.createElement('div', {
          className: 'mt-4 flex items-center gap-2 text-xs text-gray-500'
        },
          React.createElement('span', { className: 'w-2 h-2 rounded-full bg-green-500 inline-block' }),
          React.createElement('span', null, 'Scenario: ' + slideData.scenario)
        ),

        // Point type badge indicator (when active slide covers BACnet types)
        showBadges && React.createElement('div', {
          className: 'mt-4 p-3 bg-gray-800 rounded border border-gray-700'
        },
          React.createElement('p', { className: 'text-xs text-gray-400 mb-2' }, 'Point Type Badges Active:'),
          React.createElement('div', { className: 'flex gap-2' },
            window.PointBadge
              ? React.createElement(window.PointBadge, { type: 'AI', persistent: true })
              : React.createElement('span', { className: 'bg-green-600 text-white text-xs px-1.5 py-0.5 rounded font-bold' }, 'AI'),
            window.PointBadge
              ? React.createElement(window.PointBadge, { type: 'AO', persistent: true })
              : React.createElement('span', { className: 'bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded font-bold' }, 'AO'),
            window.PointBadge
              ? React.createElement(window.PointBadge, { type: 'BI', persistent: true })
              : React.createElement('span', { className: 'bg-yellow-600 text-white text-xs px-1.5 py-0.5 rounded font-bold' }, 'BI'),
            window.PointBadge
              ? React.createElement(window.PointBadge, { type: 'BO', persistent: true })
              : React.createElement('span', { className: 'bg-orange-600 text-white text-xs px-1.5 py-0.5 rounded font-bold' }, 'BO')
          )
        ),

        // Bounds message (when at first/last slide)
        boundsMessage && React.createElement('div', {
          className: 'mt-4 px-3 py-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-xs text-yellow-300',
          role: 'alert'
        }, boundsMessage)
      ),

      // Paused clock indicator
      React.createElement('div', {
        className: 'flex items-center gap-2',
        style: { padding: '7px 14px', background: '#1b2536', borderTop: '1px solid #232c3d',
                 fontSize: '10.5px', fontWeight: 700, color: '#9db0c8', flexShrink: 0 }
      },
        React.createElement('span', {
          className: 'animate-pulse',
          style: { width: '7px', height: '7px', borderRadius: '50%', background: '#e6a23c',
                   display: 'inline-block', flexShrink: 0 }
        }),
        React.createElement('span', null, 'Simulation paused — advance slides to progress')
      ),

      // Navigation buttons
      React.createElement('div', {
        className: 'flex items-center justify-between gap-3',
        style: { padding: '10px 14px', background: '#1b2536',
                 borderTop: '1px solid #232c3d', flexShrink: 0 }
      },
        // Previous button
        React.createElement('button', {
          type: 'button',
          style: { flex: 1, padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: 800,
                   cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s, color .15s',
                   background: '#1b2230', border: '1px solid #38445c',
                   color: currentSlide <= 1 ? '#5d6b83' : '#c3cfdd' },
          onClick: goPrevious,
          disabled: false, // Still clickable to show bounds message
          'aria-label': 'Previous slide'
        },
          '← Previous'
        ),

        // Next button
        React.createElement('button', {
          type: 'button',
          style: Object.assign(
            { flex: 1, padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s, color .15s' },
            currentSlide >= slideCount
              ? { background: '#1b2230', border: '1px solid #38445c', color: '#5d6b83' }
              : { background: 'linear-gradient(180deg,#3f6fbf,#2d5aa8)', border: '1px solid #2d5aa8', color: '#fff' }
          ),
          onClick: goNext,
          disabled: false, // Still clickable to show bounds message
          'aria-label': 'Next slide'
        },
          'Next →'
        )
      )
    );
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return CompanionModePanel;
})();

// Expose globally
window.CompanionMode = CompanionMode;
