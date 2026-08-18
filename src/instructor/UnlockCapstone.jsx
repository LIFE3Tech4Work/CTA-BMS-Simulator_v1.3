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
      // Unlocked reads as a status, not another button competing for attention:
      // a lit dot and a quiet label, with Lock as the only action.
      return React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('span', {
          style: { display: 'inline-flex', alignItems: 'center', gap: '7px',
                   padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
                   fontWeight: 700, letterSpacing: '.2px', fontFamily: 'inherit',
                   background: 'rgba(63,143,90,.16)', border: '1px solid #2f7a52',
                   color: '#8ff0b5' }
        },
          React.createElement('span', {
            style: { width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                     background: '#6ee7a8', boxShadow: '0 0 6px #6ee7a8' }
          }),
          'Capstone Unlocked'
        ),
        React.createElement('button', {
          type: 'button',
          style: { padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
                   fontWeight: 700, letterSpacing: '.2px', cursor: 'pointer',
                   fontFamily: 'inherit', background: '#1b2230',
                   border: '1px solid #38445c', color: '#c3cfdd' },
          onMouseEnter: function (e) { e.currentTarget.style.background = '#232c3d'; },
          onMouseLeave: function (e) { e.currentTarget.style.background = '#1b2230'; },
          onClick: handleLock,
          title: 'Lock capstone access for students'
        }, 'Lock')
      );
    }

    // Was a bright green Tailwind button with a padlock emoji, which shouted
    // louder than anything else on the dashboard and did not belong to the
    // station's palette. Same restrained treatment as the other chrome controls.
    return React.createElement('button', {
      type: 'button',
      style: { display: 'inline-flex', alignItems: 'center', gap: '7px',
               padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
               fontWeight: 700, letterSpacing: '.2px', cursor: 'pointer',
               fontFamily: 'inherit', background: '#1b2230',
               border: '1px solid #38445c', color: '#c3cfdd' },
      onMouseEnter: function (e) { e.currentTarget.style.background = '#232c3d'; },
      onMouseLeave: function (e) { e.currentTarget.style.background = '#1b2230'; },
      onClick: handleUnlock,
      title: 'Unlock capstone mode for all students'
    },
      React.createElement('span', {
        style: { width: '7px', height: '7px', borderRadius: '50%',
                 background: '#5d6b83', flexShrink: 0 }
      }),
      'Unlock Capstone'
    );
  }

  // Expose on window
  window.UnlockCapstone = UnlockCapstone;
})();
