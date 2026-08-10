/* UnlockCapstone.jsx — Instructor control to unlock capstone mode for students
 * Writes localStorage["capstone_unlocked"] = "true" when activated.
 * Student tabs read this flag to gate capstone access.
 * Shows current unlock status.
 * No import/export — exposes window.UnlockCapstone
 */

(function() {
  'use strict';

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useContext = React.useContext;

  /**
   * Read the current unlock status from localStorage.
   */
  function isCapstoneUnlocked() {
    try {
      return localStorage.getItem('capstone_unlocked') === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * UnlockCapstone component.
   * Button that writes capstone_unlocked: true flag to localStorage.
   * Shows current unlock status (locked/unlocked).
   */
  function UnlockCapstone() {
    var auth = useContext(window.AuthContext);
    var state = useState(isCapstoneUnlocked);
    var unlocked = state[0];
    var setUnlocked = state[1];

    // Gate access to Engr+ security level
    var hasAccess = false;
    if (auth && auth.authenticated) {
      hasAccess = window.AuthHelpers
        ? window.AuthHelpers.hasPrivilege(auth.securityLevel, 'Engr')
        : (auth.securityLevel === 'Engr' || auth.securityLevel === 'Mngr');
    }

    // Sync status on mount and periodically
    useEffect(function() {
      setUnlocked(isCapstoneUnlocked());
      var interval = setInterval(function() {
        setUnlocked(isCapstoneUnlocked());
      }, 2000);
      return function() { clearInterval(interval); };
    }, []);

    function handleUnlock() {
      try {
        localStorage.setItem('capstone_unlocked', 'true');
        setUnlocked(true);
      } catch (e) {
        // localStorage unavailable
        alert('Unable to write to localStorage. Capstone unlock failed.');
      }
    }

    function handleLock() {
      try {
        localStorage.removeItem('capstone_unlocked');
        setUnlocked(false);
      } catch (e) {
        alert('Unable to write to localStorage. Capstone lock failed.');
      }
    }

    if (!hasAccess) {
      return null; // Not visible to non-Engr+ users
    }

    if (unlocked) {
      return React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('span', {
          className: 'inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-green-900 text-green-300'
        },
          React.createElement('span', { className: 'w-2 h-2 rounded-full bg-green-400 inline-block' }),
          'Capstone Unlocked'
        ),
        React.createElement('button', {
          className: 'px-2 py-1 text-xs bg-red-900 text-red-300 rounded hover:bg-red-800 hover:text-red-200',
          onClick: handleLock,
          title: 'Lock capstone access for students'
        }, 'Lock')
      );
    }

    return React.createElement('button', {
      className: 'px-3 py-2 text-sm bg-green-700 text-white rounded hover:bg-green-600 font-medium',
      onClick: handleUnlock,
      title: 'Unlock capstone mode for all students'
    }, '🔓 Unlock Capstone');
  }

  // Expose on window
  window.UnlockCapstone = UnlockCapstone;
})();
