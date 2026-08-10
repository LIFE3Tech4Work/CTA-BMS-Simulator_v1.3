/* Dashboard.jsx — Instructor Dashboard for viewing submitted capstone worksheets
 * Lists submitted worksheets from localStorage["capstone_submissions"]
 * Polls localStorage every 5 seconds for new submissions
 * Gates access to Engr+ security level (via AuthContext)
 * No import/export — exposes window.InstructorDashboard
 */

(function() {
  'use strict';

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useContext = React.useContext;
  var useCallback = React.useCallback;

  /**
   * Read submissions from localStorage.
   * Returns an array of submission objects or empty array.
   */
  function readSubmissions() {
    try {
      var raw = localStorage.getItem('capstone_submissions');
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (e) {
      return [];
    }
  }

  /**
   * InstructorDashboard component.
   * Shows a list of submitted worksheets with participant ID and timestamp.
   * Clicking a submission expands to show full worksheet content (all 5 sections).
   * Access is gated to Engr+ security level.
   */
  function InstructorDashboard() {
    var auth = useContext(window.AuthContext);
    var submissions = useState(readSubmissions);
    var submissionsList = submissions[0];
    var setSubmissionsList = submissions[1];

    var expandedState = useState(null);
    var expandedId = expandedState[0];
    var setExpandedId = expandedState[1];

    // Poll localStorage every 5 seconds for new submissions
    useEffect(function() {
      var interval = setInterval(function() {
        setSubmissionsList(readSubmissions());
      }, 5000);
      return function() { clearInterval(interval); };
    }, []);

    // Gate access to Engr+ security level
    if (!auth || !auth.authenticated) {
      return React.createElement('div', {
        className: 'flex items-center justify-center h-screen bg-gray-900 text-white'
      },
        React.createElement('div', { className: 'text-center' },
          React.createElement('h1', { className: 'text-2xl font-bold text-red-400' }, 'Access Denied'),
          React.createElement('p', { className: 'text-gray-400 mt-2' }, 'You must be authenticated to access the Instructor Dashboard.'),
          React.createElement('button', {
            className: 'mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500',
            onClick: function() { window.location.hash = '#/auth'; }
          }, 'Sign In')
        )
      );
    }

    // Check Engr+ privilege
    var hasAccess = window.AuthHelpers
      ? window.AuthHelpers.hasPrivilege(auth.securityLevel, 'Engr')
      : (auth.securityLevel === 'Engr' || auth.securityLevel === 'Mngr');

    if (!hasAccess) {
      return React.createElement('div', {
        className: 'flex items-center justify-center h-screen bg-gray-900 text-white'
      },
        React.createElement('div', { className: 'text-center' },
          React.createElement('h1', { className: 'text-2xl font-bold text-red-400' }, 'Insufficient Privileges'),
          React.createElement('p', { className: 'text-gray-400 mt-2' }, 'Instructor Dashboard requires Engr or higher security level.'),
          React.createElement('p', { className: 'text-gray-500 text-sm mt-1' }, 'Current level: ' + auth.securityLevel),
          React.createElement('button', {
            className: 'mt-4 px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600',
            onClick: function() { window.location.hash = '#/symmetre'; }
          }, '← Back to Station')
        )
      );
    }

    // Toggle expanded submission
    function handleToggle(index) {
      setExpandedId(expandedId === index ? null : index);
    }

    // Format timestamp for display
    function formatTimestamp(ts) {
      if (!ts) return 'Unknown';
      try {
        var d = new Date(ts);
        return d.toLocaleString();
      } catch (e) {
        return String(ts);
      }
    }

    // Render a single submission row
    function renderSubmission(submission, index) {
      var isExpanded = expandedId === index;
      var participantId = submission.operator || submission.participantId || 'Unknown';
      var timestamp = submission.timestamp || submission.lastSaved || '';

      return React.createElement('div', {
        key: index,
        className: 'border border-gray-700 rounded mb-2 overflow-hidden'
      },
        // Header row (clickable)
        React.createElement('div', {
          className: 'flex items-center justify-between px-4 py-3 bg-gray-800 cursor-pointer hover:bg-gray-750 transition-colors',
          onClick: function() { handleToggle(index); }
        },
          React.createElement('div', { className: 'flex items-center gap-3' },
            React.createElement('span', { className: 'text-lg' }, isExpanded ? '▼' : '▶'),
            React.createElement('div', null,
              React.createElement('span', { className: 'text-white font-medium' }, participantId),
              React.createElement('span', { className: 'text-gray-500 text-sm ml-3' }, formatTimestamp(timestamp))
            )
          ),
          React.createElement('span', {
            className: 'px-2 py-1 text-xs rounded ' +
              (submission.submitted ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300')
          }, submission.submitted ? 'Submitted' : 'Draft')
        ),

        // Expanded content (all 5 sections)
        isExpanded && React.createElement('div', { className: 'px-4 py-4 bg-gray-850 border-t border-gray-700' },
          submission.sections && submission.sections.length > 0
            ? submission.sections.map(function(section, sIdx) {
                return React.createElement('div', {
                  key: sIdx,
                  className: 'mb-4 last:mb-0'
                },
                  React.createElement('h4', {
                    className: 'text-blue-300 font-semibold text-sm mb-1'
                  }, 'Section ' + (section.id || (sIdx + 1)) + ': ' + (section.title || 'Untitled')),
                  React.createElement('div', {
                    className: 'bg-gray-900 rounded p-3 text-gray-200 text-sm whitespace-pre-wrap border border-gray-700'
                  }, section.content || React.createElement('span', { className: 'text-gray-500 italic' }, '(No response provided)'))
                );
              })
            : React.createElement('p', { className: 'text-gray-500 italic' }, 'No worksheet sections available.')
        )
      );
    }

    // Main dashboard layout
    return React.createElement('div', { className: 'flex h-screen bg-gray-900' },
      React.createElement('div', { className: 'flex-1 flex flex-col overflow-hidden' },
        // Header
        React.createElement('div', {
          className: 'px-6 py-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between'
        },
          React.createElement('div', null,
            React.createElement('h1', { className: 'text-xl font-bold text-white' }, 'Instructor Dashboard'),
            React.createElement('p', { className: 'text-gray-400 text-sm mt-1' },
              submissionsList.length + ' submission' + (submissionsList.length !== 1 ? 's' : '') + ' received'
            )
          ),
          React.createElement('div', { className: 'flex items-center gap-3' },
            // UnlockCapstone inline
            window.UnlockCapstone
              ? React.createElement(window.UnlockCapstone, null)
              : null,
            React.createElement('button', {
              className: 'px-3 py-2 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 hover:text-white',
              onClick: function() { window.location.hash = '#/symmetre'; }
            }, '← Back to Station')
          )
        ),

        // Submissions list
        React.createElement('div', { className: 'flex-1 overflow-auto p-6' },
          submissionsList.length === 0
            ? React.createElement('div', { className: 'text-center py-12' },
                React.createElement('p', { className: 'text-gray-500 text-lg' }, 'No submissions yet.'),
                React.createElement('p', { className: 'text-gray-600 text-sm mt-2' }, 'Submissions will appear here when students submit their capstone worksheets.'),
                React.createElement('p', { className: 'text-gray-600 text-xs mt-1' }, 'Polling every 5 seconds...')
              )
            : React.createElement('div', null,
                submissionsList.map(renderSubmission)
              )
        )
      )
    );
  }

  // Expose on window
  window.InstructorDashboard = InstructorDashboard;
})();
