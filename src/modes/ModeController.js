/* ModeController.js — Mode management for 2 pedagogical modes
 * Manages currentMode state and layout configuration.
 * No import/export — exposes as window.ModeController.
 *
 * Modes:
 *   companion   → mainWidth 70%, panelWidth 30%
 *   capstone    → mainWidth 65%, panelWidth 35%
 *
 * Integration:
 *   - Calls window.setModeState(newState) to update React ModeContext
 *   - Mode is an orthogonal layout wrapper — doesn't change routes
 */

(function() {
  'use strict';

  // ─── Layout Configuration Per Mode ──────────────────────────────────────────

  var LAYOUT_CONFIGS = {
    companion: { mainWidth: '70%', panelWidth: '30%' },
    freeExplore: { mainWidth: '100%', panelWidth: '0%' },
    capstone: { mainWidth: '65%', panelWidth: '35%' }
  };

  // ─── Valid Modes ────────────────────────────────────────────────────────────

  var VALID_MODES = ['companion', 'freeExplore', 'capstone'];

  // ─── Mode Controller ───────────────────────────────────────────────────────

  var ModeController = {
    currentMode: 'companion',

    /**
     * Set the active pedagogical mode.
     * @param {string} mode - One of: 'companion', 'capstone'
     * @returns {boolean} true if mode was set, false if invalid mode
     */
    setMode: function(mode) {
      if (VALID_MODES.indexOf(mode) === -1) {
        console.warn('[ModeController] Invalid mode: "' + mode + '". Must be one of: ' + VALID_MODES.join(', '));
        return false;
      }

      if (mode === ModeController.currentMode) {
        return true; // Already in this mode, no-op
      }

      ModeController.currentMode = mode;

      // Update React ModeContext via App.jsx's exposed setter
      if (typeof window.setModeState === 'function') {
        window.setModeState({
          currentMode: mode
        });
      }

      // Notify any subscribed listeners
      ModeController._notifyListeners(mode);

      return true;
    },

    /**
     * Get the layout configuration for the current mode.
     * @returns {{ mainWidth: string, panelWidth: string }}
     */
    getLayoutConfig: function() {
      return LAYOUT_CONFIGS[ModeController.currentMode] || LAYOUT_CONFIGS.companion;
    },

    /**
     * Get layout configuration for a specific mode (without switching).
     * @param {string} mode
     * @returns {{ mainWidth: string, panelWidth: string } | null}
     */
    getLayoutConfigForMode: function(mode) {
      return LAYOUT_CONFIGS[mode] || null;
    },

    /**
     * Get list of valid modes.
     * @returns {string[]}
     */
    getValidModes: function() {
      return VALID_MODES.slice();
    },

    // ─── Listener Support ─────────────────────────────────────────────────────

    _listeners: [],

    /**
     * Subscribe to mode changes.
     * @param {function} callback - Called with the new mode string
     * @returns {function} unsubscribe function
     */
    onModeChange: function(callback) {
      if (typeof callback === 'function') {
        ModeController._listeners.push(callback);
      }
      return function() {
        var idx = ModeController._listeners.indexOf(callback);
        if (idx !== -1) {
          ModeController._listeners.splice(idx, 1);
        }
      };
    },

    _notifyListeners: function(mode) {
      for (var i = 0; i < ModeController._listeners.length; i++) {
        try {
          ModeController._listeners[i](mode);
        } catch (e) {
          console.error('[ModeController] Listener error:', e);
        }
      }
    }
  };

  // ─── Mode Selection UI Component ────────────────────────────────────────────
  // A React component providing a button group for mode selection.
  // Accessible from the main interface toolbar area.

  function ModeSelector() {
    var modeCtx = React.useContext(window.ModeContext);
    var currentMode = (modeCtx && modeCtx.currentMode) || ModeController.currentMode;
    var showChapterIndex = React.useState(false);
    var chapterIndexVisible = showChapterIndex[0];
    var setChapterIndexVisible = showChapterIndex[1];

    var modes = [
      { id: 'companion', label: 'Companion', icon: '📖', title: 'Companion Mode — Slide-guided training (70%/30% layout)' },
      { id: 'capstone', label: 'Capstone', icon: '📝', title: 'Capstone Mode — Worksheet assessment (65%/35% layout)' }
    ];

    function handleModeClick(mode) {
      ModeController.setMode(mode);
      setChapterIndexVisible(false);
    }

    function handleChapterToggle() {
      setChapterIndexVisible(!chapterIndexVisible);
    }

    return React.createElement('div', {
      className: 'inline-flex items-center gap-2 relative'
    },
      // Mode buttons
      React.createElement('div', {
        className: 'inline-flex items-center bg-gray-700 rounded border border-gray-600',
        role: 'group',
        'aria-label': 'Mode selection'
      },
        modes.map(function(m) {
          var isActive = currentMode === m.id;
          return React.createElement('button', {
            key: m.id,
            type: 'button',
            className: 'px-3 py-1 text-xs font-medium transition-colors ' +
              (isActive
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-600 hover:text-white') +
              (m.id === 'companion' ? ' rounded-l' : '') +
              (m.id === 'capstone' ? ' rounded-r' : ''),
            onClick: function() { handleModeClick(m.id); },
            title: m.title,
            'aria-pressed': isActive ? 'true' : 'false',
            'aria-label': m.label + ' mode'
          },
            React.createElement('span', { className: 'mr-1', 'aria-hidden': 'true' }, m.icon),
            m.label
          );
        })
      ),

      // Chapter Index button (enables 2-click access: 1st click opens index, 2nd click navigates to chapter)
      React.createElement('button', {
        type: 'button',
        className: 'px-2 py-1 text-xs font-medium rounded transition-colors border ' +
          (chapterIndexVisible
            ? 'bg-blue-600 text-white border-blue-500'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white border-gray-600'),
        onClick: handleChapterToggle,
        title: 'CTA Reference Guide — 14 chapters',
        'aria-expanded': chapterIndexVisible ? 'true' : 'false',
        'aria-label': 'Toggle chapter index'
      },
        React.createElement('span', { className: 'mr-1', 'aria-hidden': 'true' }, '📚'),
        'Chapters'
      ),

      // Chapter Index dropdown panel (shown on click — 2nd click is on a chapter)
      chapterIndexVisible && React.createElement('div', {
        className: 'absolute top-full right-0 mt-1 z-50 w-96 max-h-80 overflow-auto shadow-2xl rounded-lg',
        'data-testid': 'chapter-index-dropdown'
      },
        window.ChapterIndex
          ? React.createElement(window.ChapterIndex, {
              compact: false,
              onNavigate: function() { setChapterIndexVisible(false); }
            })
          : React.createElement('div', { className: 'p-3 bg-gray-800 border border-gray-600 rounded text-xs text-gray-400' },
              'Chapter index loading...')
      )
    );
  }

  // ─── Mode Layout Wrapper Component ──────────────────────────────────────────
  // Wraps the main BMS content and applies mode-specific layout proportions.

  function ModeLayoutWrapper(props) {
    var modeCtx = React.useContext(window.ModeContext);
    var currentMode = (modeCtx && modeCtx.currentMode) || ModeController.currentMode;
    var layout = LAYOUT_CONFIGS[currentMode] || LAYOUT_CONFIGS.companion;

    var showPanel = layout.panelWidth !== '0%';

    // Collapse state for the side panel
    var _collapsed = React.useState(false);
    var panelCollapsed = _collapsed[0];
    var setPanelCollapsed = _collapsed[1];

    // Reset collapsed state when mode changes
    React.useEffect(function () {
      setPanelCollapsed(false);
    }, [currentMode]);

    // Collapse toggle button
    var collapseBtn = React.createElement('button', {
      className: 'absolute top-2 ' + (panelCollapsed ? 'right-2' : 'left-[-14px]') +
        ' z-50 w-7 h-7 flex items-center justify-center rounded-full bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 hover:text-white shadow-lg transition-colors text-xs',
      onClick: function () { setPanelCollapsed(!panelCollapsed); },
      'aria-label': panelCollapsed ? 'Expand side panel' : 'Collapse side panel',
      title: panelCollapsed ? 'Expand panel' : 'Collapse panel'
    }, panelCollapsed ? '◀' : '▶');

    // When panel is collapsed, show a narrow strip with just the expand button
    if (showPanel && panelCollapsed) {
      return React.createElement('div', {
        className: 'flex h-screen w-full overflow-hidden',
        'data-mode': currentMode
      },
        // Main content takes full width
        React.createElement('div', {
          style: { width: '100%' },
          className: 'h-full overflow-hidden transition-all duration-300'
        }, props.mainContent),

        // Collapsed strip
        React.createElement('div', {
          className: 'relative h-full w-10 flex-shrink-0 bg-gray-900 border-l border-gray-600 flex flex-col items-center pt-2'
        }, collapseBtn)
      );
    }

    return React.createElement('div', {
      className: 'flex h-screen w-full overflow-hidden',
      'data-mode': currentMode
    },
      // Main content area
      React.createElement('div', {
        style: { width: layout.mainWidth },
        className: 'h-full overflow-hidden transition-all duration-300'
      }, props.mainContent),

      // Side panel (companion or capstone)
      showPanel && React.createElement('div', {
        style: { width: layout.panelWidth },
        className: 'relative h-full overflow-hidden border-l border-gray-600 bg-gray-900 transition-all duration-300'
      },
        collapseBtn,
        props.panelContent || null
      )
    );
  }

  // ─── Expose on window ──────────────────────────────────────────────────────

  window.ModeController = ModeController;
  window.ModeSelector = ModeSelector;
  window.ModeLayoutWrapper = ModeLayoutWrapper;

})();
