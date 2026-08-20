/**
 * ReviewFlags.jsx — the instructor-facing review queue
 *
 * Flagged points had nowhere to be seen. The dialog composed a prompt and warned that
 * nothing was saved, so a flag existed only in whatever the instructor pasted somewhere
 * else. This is the list: what was flagged, on which point, by whom, when, and whether
 * it has been dealt with.
 *
 * Lives in the Exercise Report, above capstone submissions, because it is the other
 * thing an instructor comes to that screen to check.
 *
 * No import/export — exposes window.ReviewFlags.
 */
(function () {
  'use strict';

  var useState = React.useState, useEffect = React.useEffect;

  /** Engr+ only. Read live, since this component mounts from a route and a menu. */
  function isInstructor() {
    var A = window.AuthHelpers, level = window.CTAAuthLevel;
    return !!(A && A.hasPrivilege && level && A.hasPrivilege(level, 'Engr'));
  }

  function ReviewFlags(props) {
    var Q = window.ReviewQueue;
    // Gated here rather than only at the route: this list is mounted directly too, and
    // the destructive controls live inside it.
    if (!isInstructor()) return null;
    var [, bump] = useState(0);
    var [showResolved, setShowResolved] = useState(false);
    var [copiedId, setCopiedId] = useState(null);

    useEffect(function () {
      if (!Q) return;
      return Q.subscribe(function () { bump(function (n) { return n + 1; }); });
    }, []);

    if (!Q) return null;

    var all = Q.all();
    var open = all.filter(function (f) { return !f.resolvedAt; });
    var shown = showResolved ? all : open;

    function copy(f) {
      var text = Q.promptFor(f);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          setCopiedId(f.id);
          setTimeout(function () { setCopiedId(null); }, 1800);
        }).catch(function () {});
      }
    }

    function when(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    }

    function nameFor(id) {
      var R = window.StudentRoster;
      if (R && R.displayName) {
        var n = R.displayName(id);
        if (n && n !== id) return n;
      }
      return id || 'instructor';
    }

    return React.createElement('div', { className: 'mb-6' },
      React.createElement('div', {
        className: 'flex items-center justify-between mb-3'
      },
        React.createElement('div', { className: 'flex items-center gap-2' },
          // Omitted when this section IS the screen, which already has the heading.
          (props && props.hideTitle) ? null
            : React.createElement('span', { className: 'text-sm font-bold text-white' }, 'Review Queue'),
          // The count is the point of a queue — how much is outstanding.
          React.createElement('span', {
            style: {
              fontSize: '10px', fontWeight: 800, letterSpacing: '.4px',
              padding: '2px 7px', borderRadius: '999px',
              background: open.length ? 'rgba(230,162,60,.2)' : 'rgba(63,143,90,.18)',
              border: '1px solid ' + (open.length ? '#a5721f' : '#2f7a52'),
              color: open.length ? '#ffd79a' : '#8ff0b5'
            }
          }, open.length ? open.length + ' OPEN' : 'ALL CLEAR')
        ),
        all.length > open.length ? React.createElement('button', {
          type: 'button',
          onClick: function () { setShowResolved(!showResolved); },
          style: { background: 'none', border: 'none', cursor: 'pointer',
                   fontFamily: 'inherit', fontSize: '11px', color: '#6fd3e8' }
        }, showResolved ? 'Hide resolved' : 'Show resolved (' + (all.length - open.length) + ')') : null
      ),

      shown.length === 0
        ? React.createElement('div', {
            style: { fontSize: '12px', color: '#6f7f97', lineHeight: 1.5,
                     padding: '12px', borderRadius: '6px', background: '#1b2230',
                     border: '1px solid #2b3850' }
          }, 'Nothing flagged. Use Flag for Review on any point that looks wrong \u2014 it is saved here with the reading at the time, so it can be investigated later.')
        : React.createElement('div', null,
            shown.map(function (f) {
              var done = !!f.resolvedAt;
              return React.createElement('div', {
                key: f.id,
                style: {
                  padding: '9px 11px', marginBottom: '6px', borderRadius: '6px',
                  background: '#1b2230',
                  border: '1px solid ' + (done ? '#2b3850' : '#a5721f'),
                  opacity: done ? 0.62 : 1
                }
              },
                React.createElement('div', {
                  style: { display: 'flex', alignItems: 'baseline', gap: '9px', marginBottom: '4px' }
                },
                  React.createElement('span', {
                    style: { fontSize: '11px', fontWeight: 800, color: '#e8edf6' }
                  }, (f.unitId || '\u2014') + ' \u00b7 ' + (f.pointLabel || f.pointKey || '\u2014')),
                  // The reading at the moment it was flagged, not now — "it looked
                  // wrong" is not actionable a week later without the number.
                  React.createElement('span', {
                    style: { fontSize: '10.5px', color: '#9db0c8', fontVariantNumeric: 'tabular-nums' }
                  }, f.valueAtFlag ? 'was ' + f.valueAtFlag : ''),
                  React.createElement('span', {
                    style: { marginLeft: 'auto', fontSize: '10px', color: '#6f7f97',
                             fontVariantNumeric: 'tabular-nums', flexShrink: 0 }
                  }, nameFor(f.flaggedBy) + ' \u00b7 ' + when(f.createdAt))
                ),
                React.createElement('div', {
                  style: { fontSize: '11.5px', color: '#c3cfdd', lineHeight: 1.45, marginBottom: '7px' }
                }, f.note),
                React.createElement('div', { style: { display: 'flex', gap: '6px' } },
                  React.createElement('button', {
                    type: 'button',
                    onClick: function () { done ? Q.reopen(f.id) : Q.resolve(f.id); },
                    style: { padding: '3px 9px', borderRadius: '4px', fontSize: '10.5px',
                             fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                             background: done ? '#1b2230' : 'rgba(63,143,90,.18)',
                             border: '1px solid ' + (done ? '#46536b' : '#2f7a52'),
                             color: done ? '#c3cfdd' : '#8ff0b5' }
                  }, done ? 'Reopen' : 'Mark resolved'),
                  React.createElement('button', {
                    type: 'button',
                    onClick: function () { copy(f); },
                    title: 'Copy a paste-ready description of this point and note',
                    style: { padding: '3px 9px', borderRadius: '4px', fontSize: '10.5px',
                             fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                             background: '#1b2230', border: '1px solid #46536b', color: '#c3cfdd' }
                  }, copiedId === f.id ? '\u2713 Copied' : 'Copy prompt'),
                  React.createElement('button', {
                    type: 'button',
                    onClick: function () { Q.remove(f.id); },
                    style: { padding: '3px 9px', borderRadius: '4px', fontSize: '10.5px',
                             fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                             marginLeft: 'auto', background: 'none', border: 'none',
                             color: '#7f8ea6' }
                  }, 'Delete')
                )
              );
            })
          )
    );
  }

  /**
   * Standalone screen, reached from Help → Review Queue. Same chrome as the other
   * secondary screens: back control at the left edge, above the heading.
   */
  function ReviewQueueScreen() {
    if (!isInstructor()) {
      return React.createElement('div', {
        className: 'flex flex-col items-center justify-center h-screen',
        style: { background: '#141a26', fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" }
      },
        React.createElement('div', {
          style: { fontSize: '15px', fontWeight: 800, color: '#ff8a7e', marginBottom: '6px' }
        }, 'Insufficient Privileges'),
        React.createElement('div', {
          style: { fontSize: '12.5px', color: '#9db0c8', marginBottom: '16px' }
        }, 'The Review Queue is available to instructors.'),
        React.createElement('button', {
          type: 'button',
          onClick: function () { window.location.hash = '#/symmetre'; },
          style: { padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                   cursor: 'pointer', fontFamily: 'inherit', background: '#1b2230',
                   border: '1px solid #38445c', color: '#c3cfdd' }
        }, '\u2190 Back to Station')
      );
    }
    return React.createElement('div', {
      className: 'flex flex-col h-screen',
      style: { background: '#141a26', fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif",
               padding: '18px 22px', overflowY: 'auto' }
    },
      React.createElement('button', {
        type: 'button',
        style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                 borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                 background: '#1b2230', border: '1px solid #38445c', color: '#c3cfdd',
                 fontFamily: 'inherit', flexShrink: 0, alignSelf: 'flex-start',
                 marginBottom: '10px' },
        onClick: function () { window.location.hash = '#/symmetre'; },
        title: 'Return to SymmetrE Station'
      }, '\u2190 Back'),
      React.createElement('h1', {
        style: { fontSize: '19px', fontWeight: 800, color: '#fff', marginBottom: '3px' }
      }, 'Review Queue'),
      React.createElement('p', {
        style: { fontSize: '12px', color: '#9db0c8', marginBottom: '16px' }
      }, 'Points flagged as looking wrong, with the reading at the time they were raised.'),
      React.createElement(ReviewFlags, { hideTitle: true })
    );
  }

  window.ReviewFlags = ReviewFlags;
  window.ReviewQueueScreen = ReviewQueueScreen;
})();
