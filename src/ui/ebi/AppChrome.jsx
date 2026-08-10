/* AppChrome.jsx — EBI Point Detail outer frame/shell
 * Breadcrumb navigation, tab bar, content area, and status bar.
 * No import/export — exposes window.EBIAppChrome
 * Reads from: window.PointRegistry.getMetadata(pointId)
 * Gets pointId from route params (passed via props)
 */

const EBIAppChrome = (function() {
  const { useState, useEffect, useCallback, useMemo } = React;

  // ─── Constants ──────────────────────────────────────────────────────────────

  const EBI_TABS = [
    { id: 'general', label: 'General' },
    { id: 'alarms', label: 'Alarms' },
    { id: 'history', label: 'History' },
    { id: 'recent-events', label: 'Recent Events' },
  ];

  // System name for breadcrumb (top-level facility)
  const SYSTEM_NAME = 'CTA Building NYC';

  // ─── Breadcrumb Derivation ──────────────────────────────────────────────────

  /**
   * Derives breadcrumb path from point metadata.
   * Format: System > Subsystem > Point Name
   * e.g. "CTA Building NYC > AHU-4-4 > AHU-4-4 Supply Air Temp"
   */
  function deriveBreadcrumb(pointId) {
    if (!pointId || !window.PointRegistry) {
      return { system: SYSTEM_NAME, subsystem: 'Unknown', pointName: pointId || 'Unknown' };
    }

    const metadata = window.PointRegistry.getMetadata(pointId);
    if (!metadata) {
      return { system: SYSTEM_NAME, subsystem: 'Unknown', pointName: pointId };
    }

    return {
      system: SYSTEM_NAME,
      subsystem: metadata.subsystem || 'Unknown',
      pointName: metadata.name || pointId,
    };
  }

  // ─── Breadcrumb Component ───────────────────────────────────────────────────

  function Breadcrumb({ pointId }) {
    const crumb = useMemo(function() {
      return deriveBreadcrumb(pointId);
    }, [pointId]);

    function handleSystemClick() {
      // Navigate to SymmetrE home
      window.location.hash = '#/symmetre';
    }

    function handleSubsystemClick() {
      // Navigate to the corresponding AHU graphic
      var ahuId = crumb.subsystem;
      window.location.hash = '#/symmetre/' + encodeURIComponent(ahuId);
    }

    return React.createElement('nav', {
      className: 'flex items-center px-4 py-2 bg-gray-700 border-b border-gray-600 text-sm',
      'aria-label': 'Breadcrumb'
    },
      // System segment
      React.createElement('button', {
        className: 'text-blue-300 hover:text-blue-100 hover:underline cursor-pointer',
        onClick: handleSystemClick,
        'aria-label': 'Navigate to ' + crumb.system
      }, crumb.system),
      // Separator
      React.createElement('span', { className: 'mx-2 text-gray-400' }, '>'),
      // Subsystem segment
      React.createElement('button', {
        className: 'text-blue-300 hover:text-blue-100 hover:underline cursor-pointer',
        onClick: handleSubsystemClick,
        'aria-label': 'Navigate to ' + crumb.subsystem
      }, crumb.subsystem),
      // Separator
      React.createElement('span', { className: 'mx-2 text-gray-400' }, '>'),
      // Point Name (current, not clickable)
      React.createElement('span', {
        className: 'text-white font-medium'
      }, crumb.pointName)
    );
  }

  // ─── Tab Bar Component ──────────────────────────────────────────────────────

  function TabBar({ activeTab, onTabChange, pointId }) {
    return React.createElement('div', {
      className: 'flex items-center bg-gray-800 border-b border-gray-600 px-2',
      role: 'tablist',
      'aria-label': 'EBI Point Detail tabs'
    },
      EBI_TABS.map(function(tab) {
        var isActive = activeTab === tab.id;
        return React.createElement('button', {
          key: tab.id,
          role: 'tab',
          'aria-selected': isActive ? 'true' : 'false',
          'aria-controls': 'tabpanel-' + tab.id,
          className: 'px-4 py-2 text-xs font-medium border-b-2 transition-colors ' +
            (isActive
              ? 'border-cyan-400 text-cyan-300 bg-gray-700'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'),
          onClick: function() { onTabChange(tab.id); }
        }, tab.label);
      })
    );
  }

  // ─── Status Bar Component ───────────────────────────────────────────────────

  function StatusBar() {
    return React.createElement('div', {
      className: 'h-6 bg-gray-800 border-t border-gray-600 px-4 flex items-center justify-between text-xs text-gray-400'
    },
      React.createElement('span', null, 'Honeywell | EBI R700'),
      React.createElement('span', null, 'Enterprise Buildings Integrator')
    );
  }

  // ─── Main EBI AppChrome Component ───────────────────────────────────────────

  function AppChrome({ pointId, children }) {
    // Determine the active tab from the hash route, default to 'general'
    var initialTab = 'general';
    var hash = window.location.hash || '';
    var parts = hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'ebi' && parts[2]) {
      initialTab = parts[2];
    }

    var _useState = useState(initialTab);
    var activeTab = _useState[0];
    var setActiveTab = _useState[1];

    // Sync active tab with hash changes (e.g., browser back/forward)
    useEffect(function() {
      function handleHashChange() {
        var h = window.location.hash || '';
        var p = h.replace(/^#\/?/, '').split('/');
        if (p[0] === 'ebi' && p[2]) {
          setActiveTab(p[2]);
        }
      }
      window.addEventListener('hashchange', handleHashChange);
      return function() {
        window.removeEventListener('hashchange', handleHashChange);
      };
    }, []);

    // Handle tab change: update state and hash route
    var handleTabChange = useCallback(function(tabId) {
      setActiveTab(tabId);
      // Update hash route: #/ebi/{pointId}/{tabName}
      if (pointId) {
        window.location.hash = '#/ebi/' + encodeURIComponent(pointId) + '/' + tabId;
      }
    }, [pointId]);

    // Render the appropriate tab content
    function renderTabContent() {
      // Check for registered tab content components on window
      switch (activeTab) {
        case 'general':
          if (window.EBIGeneralTab) {
            return React.createElement(window.EBIGeneralTab, { pointId: pointId });
          }
          break;
        case 'alarms':
          if (window.EBIAlarmsTab) {
            return React.createElement(window.EBIAlarmsTab, { pointId: pointId });
          }
          break;
        case 'history':
          if (window.EBIHistoryTab) {
            return React.createElement(window.EBIHistoryTab, { pointId: pointId });
          }
          break;
        case 'recent-events':
          if (window.EBIRecentEventsTab) {
            return React.createElement(window.EBIRecentEventsTab, { pointId: pointId });
          }
          break;
        default:
          break;
      }

      // Fallback placeholder for tabs without a registered component
      return React.createElement('div', {
        className: 'flex items-center justify-center h-full text-gray-500 text-sm'
      }, 'Tab content: ' + activeTab);
    }

    return React.createElement('div', {
      className: 'flex flex-col h-screen w-screen overflow-hidden bg-gray-900'
    },
      // Top: Breadcrumb navigation
      React.createElement(Breadcrumb, { pointId: pointId }),
      // Below: Tab bar
      React.createElement(TabBar, {
        activeTab: activeTab,
        onTabChange: handleTabChange,
        pointId: pointId
      }),
      // Center: Tab content area
      React.createElement('div', {
        className: 'flex-1 overflow-hidden flex',
        role: 'tabpanel',
        id: 'tabpanel-' + activeTab,
        'aria-labelledby': activeTab
      },
        // Left panel (PointSidebar) if available
        window.EBIPointSidebar
          ? React.createElement(window.EBIPointSidebar, { pointId: pointId })
          : null,
        // Main content area
        React.createElement('div', {
          className: 'flex-1 overflow-auto'
        },
          children || renderTabContent()
        )
      ),
      // Bottom: Status bar
      React.createElement(StatusBar, null)
    );
  }

  return AppChrome;
})();

// Expose globally — no import/export
window.EBIAppChrome = EBIAppChrome;
