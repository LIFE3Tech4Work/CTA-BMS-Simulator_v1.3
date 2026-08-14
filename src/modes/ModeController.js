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
      // Clicking the active mode closes its panel (freeExplore = no panel), so
      // the toolbar button doubles as a dismiss — same result as the panel's ✕.
      ModeController.setMode(currentMode === mode ? 'freeExplore' : mode);
      setChapterIndexVisible(false);
    }

    function handleChapterToggle() {
      setChapterIndexVisible(!chapterIndexVisible);
    }

    // Station-chrome treatment: a recessed track with a raised blue pill on the
    // active segment, so the toolbar reads as one control instead of three
    // competing buttons.
    var TRACK = { display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px',
                  background: '#1b2536', border: '1px solid #46536b', borderRadius: '7px' };
    function segStyle(active) {
      return {
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '4px 11px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700,
        letterSpacing: '.2px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background .15s, color .15s',
        background: active ? 'linear-gradient(180deg,#3f6fbf,#2d5aa8)' : 'transparent',
        color: active ? '#fff' : '#c7d4e6',
        boxShadow: active ? '0 1px 3px rgba(6,12,26,.5)' : 'none'
      };
    }

    return React.createElement('div', {
      className: 'inline-flex items-center gap-2 relative'
    },
      // Mode buttons
      React.createElement('div', {
        style: TRACK,
        role: 'group',
        'aria-label': 'Mode selection'
      },
        modes.map(function(m) {
          var isActive = currentMode === m.id;
          return React.createElement('button', {
            key: m.id,
            type: 'button',
            style: segStyle(isActive),
            onMouseEnter: function (e) { if (!isActive) e.currentTarget.style.background = '#2b3850'; },
            onMouseLeave: function (e) { if (!isActive) e.currentTarget.style.background = 'transparent'; },
            onClick: function() { handleModeClick(m.id); },
            title: isActive ? m.label + ' Mode — click to close the panel' : m.title,
            'aria-pressed': isActive ? 'true' : 'false',
            'aria-label': m.label + ' mode'
          },
            React.createElement('span', { 'aria-hidden': 'true', style: { fontSize: '12px' } }, m.icon),
            m.label
          );
        })
      ),

      // Chapter Index button (enables 2-click access: 1st click opens index, 2nd click navigates to chapter)
      React.createElement('button', {
        type: 'button',
        style: Object.assign({}, segStyle(chapterIndexVisible), {
          padding: '5px 11px',
          border: '1px solid ' + (chapterIndexVisible ? '#2d5aa8' : '#46536b'),
          background: chapterIndexVisible
            ? 'linear-gradient(180deg,#3f6fbf,#2d5aa8)' : '#1b2536',
          borderRadius: '7px'
        }),
        onMouseEnter: function (e) { if (!chapterIndexVisible) e.currentTarget.style.background = '#2b3850'; },
        onMouseLeave: function (e) { if (!chapterIndexVisible) e.currentTarget.style.background = '#1b2536'; },
        onClick: handleChapterToggle,
        title: 'CTA Reference Guide — 14 chapters',
        'aria-expanded': chapterIndexVisible ? 'true' : 'false',
        'aria-label': 'Toggle chapter index'
      },
        React.createElement('span', { 'aria-hidden': 'true', style: { fontSize: '12px' } }, '📚'),
        'Chapters',
        React.createElement('span', {
          'aria-hidden': 'true',
          style: { fontSize: '8px', opacity: .8, marginLeft: '1px',
                   transform: chapterIndexVisible ? 'rotate(180deg)' : 'none',
                   transition: 'transform .18s' }
        }, '▼')
      ),

      // Chapter Index dropdown panel (shown on click — 2nd click is on a chapter)
      chapterIndexVisible && React.createElement('div', {
        className: 'absolute top-full right-0 z-50 w-96',
        style: { marginTop: '6px' },
        'data-testid': 'chapter-index-dropdown'
      },
        window.ChapterIndex
          ? React.createElement(window.ChapterIndex, {
              compact: false,
              onNavigate: function() { setChapterIndexVisible(false); }
            })
          : React.createElement('div', {
              className: 'p-3 text-xs',
              style: { background: '#1b2536', border: '1px solid #171f2d', borderRadius: '8px',
                       color: '#9db0c8', boxShadow: '0 18px 44px rgba(6,10,20,.62)' }
            }, 'Chapter index loading...')
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

    // ── Dock the panel to the station CONTENT area, not the whole window, so it
    // never covers the title bar / menu bar / toolbar. AppChrome tags that
    // region with data-station-content; we track its top and bottom insets.
    var _inset = React.useState({ top: 0, bottom: 0 });
    var inset = _inset[0];
    var setInset = _inset[1];

    React.useLayoutEffect(function () {
      var host = null;
      function measure() {
        var el = document.querySelector('[data-station-content]');
        if (!el) { setInset({ top: 0, bottom: 0 }); return; }
        var r = el.getBoundingClientRect();
        var vh = window.innerHeight || r.bottom;
        var next = { top: Math.max(0, Math.round(r.top)), bottom: Math.max(0, Math.round(vh - r.bottom)) };
        setInset(function (prev) {
          return (prev.top === next.top && prev.bottom === next.bottom) ? prev : next;
        });
        host = el;
      }
      measure();
      var ro = null;
      if (window.ResizeObserver) {
        ro = new ResizeObserver(measure);
        if (host) ro.observe(host);
        ro.observe(document.body);
      }
      window.addEventListener('resize', measure);
      var poll = setInterval(measure, 800);   // catches route changes that remount the chrome
      return function () {
        if (ro) ro.disconnect();
        window.removeEventListener('resize', measure);
        clearInterval(poll);
      };
    }, [currentMode]);

    // ── Edge control: minimise / expand ──────────────────────────────────────
    // Closing is the toolbar's job — clicking the active Companion or Capstone
    // button again dismisses the panel — so this edge control only minimises.
    var edgeCluster = React.createElement('button', {
      type: 'button',
      className: 'flex items-center justify-center',
      style: {
        position: 'absolute', top: '10px', zIndex: 50,
        left: panelCollapsed ? '6px' : '-13px',
        width: '26px', height: '26px', borderRadius: '50%',
        background: 'linear-gradient(180deg,#33425d,#2b3850)',
        border: '1px solid #46536b', color: '#c7d4e6', fontSize: '11px',
        lineHeight: 1, padding: 0,
        cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: '0 3px 10px rgba(6,12,26,.55)',
        transition: 'color .15s, border-color .15s'
      },
      onMouseEnter: function (e) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#5b9bd5'; },
      onMouseLeave: function (e) { e.currentTarget.style.color = '#c7d4e6'; e.currentTarget.style.borderColor = '#46536b'; },
      onClick: function () { setPanelCollapsed(!panelCollapsed); },
      'aria-label': panelCollapsed ? 'Expand side panel' : 'Minimise side panel',
      title: panelCollapsed
        ? 'Expand panel'
        : 'Minimise panel — click ' + (currentMode === 'capstone' ? 'Capstone' : 'Companion') + ' above to close'
    }, panelCollapsed ? '◀' : '▶');

    // Companion / Capstone panels FLOAT over the diagram rather than splitting
    // the row — the schematic keeps its full width (and therefore its scale)
    // whichever mode is active.
    var PANEL_BASE = {
      position: 'absolute', top: inset.top + 'px', right: 0, bottom: inset.bottom + 'px',
      zIndex: 45,
      overflow: 'hidden',
      background: 'linear-gradient(180deg,#1f2a3c,#18212f)',
      borderLeft: '1px solid #46536b',
      boxShadow: '-18px 0 46px rgba(6,10,20,.55)'
    };

    if (showPanel && panelCollapsed) {
      return React.createElement('div', {
        className: 'relative h-screen w-full overflow-hidden',
        'data-mode': currentMode
      },
        React.createElement('div', {
          style: { width: '100%' },
          className: 'h-full overflow-hidden'
        }, props.mainContent),

        // Collapsed grab strip, floating over the right edge
        React.createElement('div', {
          className: 'flex flex-col items-center',
          style: Object.assign({}, PANEL_BASE, { width: '38px' })
        }, edgeCluster)
      );
    }

    return React.createElement('div', {
      className: 'relative h-screen w-full overflow-hidden',
      'data-mode': currentMode
    },
      // Main content keeps the full width in every mode
      React.createElement('div', {
        style: { width: '100%' },
        className: 'h-full overflow-hidden'
      }, props.mainContent),

      // Side panel (companion or capstone) — overlaid, not inline
      showPanel && React.createElement('div', {
        style: Object.assign({}, PANEL_BASE, {
          width: layout.panelWidth,
          minWidth: currentMode === 'capstone' ? '440px' : '360px',
          maxWidth: '620px'
        })
      },
        edgeCluster,
        props.panelContent || null
      )
    );
  }

  // ─── Expose on window ──────────────────────────────────────────────────────

  window.ModeController = ModeController;
  window.ModeSelector = ModeSelector;
  window.ModeLayoutWrapper = ModeLayoutWrapper;

})();
