/**
 * ResetPassword.jsx — the page an emailed reset link opens
 *
 * Supabase's reset email carries a recovery token in the URL. The SDK exchanges it
 * for a short-lived session automatically (detectSessionInUrl), so this screen only
 * has to collect a new password and call updateUser.
 *
 * It must be reachable while signed out — that is the entire point — so App.jsx
 * routes '#/reset' before its authentication check.
 *
 * No import/export — exposes window.ResetPassword.
 */
(function () {
  'use strict';

  var useState = React.useState, useEffect = React.useEffect;

  function ResetPassword() {
    var [password, setPassword] = useState('');
    var [confirm, setConfirm] = useState('');
    var [err, setErr] = useState('');
    var [done, setDone] = useState(false);
    var [busy, setBusy] = useState(false);
    // Whether the link actually established a session. A reset link that has expired
    // or been used already leaves no session, and saying so is better than letting
    // someone type a new password into a form that cannot save it.
    var [linkOk, setLinkOk] = useState(null);

    useEffect(function () {
      var B = window.SupabaseBackend;
      if (!B || !B.isConfigured()) { setLinkOk(false); return; }
      B.getClient().then(function (c) {
        if (!c) { setLinkOk(false); return; }
        // Give the SDK a moment to consume the token from the URL fragment.
        setTimeout(function () {
          c.auth.getSession().then(function (r) {
            setLinkOk(!!(r && r.data && r.data.session));
          });
        }, 400);
      });
    }, []);

    var MIN_PW = (window.LocalAccounts && window.LocalAccounts.MIN_PASSWORD) || 6;
    var longEnough = password.length >= MIN_PW;
    var matches = confirm.length > 0 && password === confirm;

    function submit(e) {
      e.preventDefault();
      setErr('');
      if (!longEnough) { setErr('Password must be at least ' + MIN_PW + ' characters.'); return; }
      if (!matches) { setErr('The two passwords do not match.'); return; }
      setBusy(true);
      window.SupabaseBackend.updatePassword(password).then(function (res) {
        setBusy(false);
        if (!res || !res.ok) { setErr((res && res.error) || 'Could not update the password.'); return; }
        setDone(true);
      });
    }

    var fieldStyle = {
      width: '100%', padding: '8px 10px', borderRadius: '4px', fontSize: '13px',
      background: '#1b2536', border: '1px solid #46536b', color: '#fff',
      fontFamily: 'inherit'
    };

    return React.createElement('div', {
      className: 'flex items-center justify-center h-screen',
      style: { background: '#141a26', fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" }
    },
      React.createElement('div', {
        style: { width: '100%', maxWidth: '420px', borderRadius: '6px', overflow: 'hidden',
                 background: 'linear-gradient(180deg,#243044,#1b2536)', border: '1px solid #171f2d' }
      },
        React.createElement('div', {
          style: { padding: '10px 16px', background: 'linear-gradient(180deg,#33425d,#2b3850)',
                   borderBottom: '1px solid #171f2d', display: 'flex', alignItems: 'center', gap: '8px' }
        },
          React.createElement('img', {
            src: 'assets/LIFE3_White_Logo.png', alt: 'LIFE3',
            style: { height: '20px', width: 'auto' }, draggable: false
          }),
          React.createElement('span', {
            style: { color: '#fff', fontSize: '13px', fontWeight: 600, letterSpacing: '.3px' }
          }, 'Set a new password')
        ),

        React.createElement('div', { style: { padding: '22px' } },
          done
            ? React.createElement('div', null,
                React.createElement('p', {
                  style: { color: '#8ff0b5', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5 }
                }, 'Password updated. You can sign in with it now.'),
                React.createElement('button', {
                  type: 'button',
                  onClick: function () { window.location.hash = '#/'; },
                  style: { width: '100%', padding: '9px', borderRadius: '4px', fontSize: '13px',
                           fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#fff',
                           background: 'linear-gradient(180deg,#3f6fbf,#2d5aa8)', border: '1px solid #2d5aa8' }
                }, 'Go to sign in')
              )
            : linkOk === false
              ? React.createElement('div', null,
                  React.createElement('p', {
                    style: { color: '#ff8a7e', fontSize: '13px', lineHeight: 1.5, marginBottom: '14px' }
                  }, 'This reset link is no longer valid \u2014 they expire, and can only be used once. Request a new one from the sign-in screen.'),
                  React.createElement('button', {
                    type: 'button',
                    onClick: function () { window.location.hash = '#/'; },
                    style: { width: '100%', padding: '9px', borderRadius: '4px', fontSize: '13px',
                             fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                             background: '#1b2230', border: '1px solid #46536b', color: '#c3cfdd' }
                  }, 'Back to sign in')
                )
              : React.createElement('form', { onSubmit: submit },
                  React.createElement('label', {
                    style: { display: 'block', fontSize: '13px', color: '#c7d4e6', marginBottom: '4px' }
                  }, 'New Password'),
                  React.createElement('input', {
                    type: 'password', value: password, autoFocus: true,
                    onChange: function (e) { setPassword(e.target.value.slice(0, 64)); },
                    style: fieldStyle
                  }),
                  React.createElement('p', {
                    style: { fontSize: '11px', marginTop: '4px', marginBottom: '12px',
                             color: password.length ? (longEnough ? '#8ff0b5' : '#ff8a7e') : '#6f7f97' }
                  }, password.length
                      ? (longEnough ? 'Long enough' : (MIN_PW - password.length) + ' more characters')
                      : 'At least ' + MIN_PW + ' characters'),

                  React.createElement('label', {
                    style: { display: 'block', fontSize: '13px', color: '#c7d4e6', marginBottom: '4px' }
                  }, 'Confirm Password'),
                  React.createElement('input', {
                    type: 'password', value: confirm,
                    onChange: function (e) { setConfirm(e.target.value.slice(0, 64)); },
                    style: fieldStyle
                  }),
                  React.createElement('p', {
                    style: { fontSize: '11px', marginTop: '4px', marginBottom: '14px',
                             color: confirm.length ? (matches ? '#8ff0b5' : '#ff8a7e') : '#6f7f97' }
                  }, confirm.length ? (matches ? 'Passwords match' : 'Passwords do not match') : 'Repeat it'),

                  err ? React.createElement('div', {
                    style: { marginBottom: '12px', padding: '8px 10px', borderRadius: '4px',
                             fontSize: '12px', background: 'rgba(224,52,43,.14)',
                             border: '1px solid #8a2018', color: '#ff8a7e' }
                  }, err) : null,

                  React.createElement('button', {
                    type: 'submit',
                    disabled: busy || !longEnough || !matches,
                    style: {
                      width: '100%', padding: '9px', borderRadius: '4px', fontSize: '13px',
                      fontWeight: 600, fontFamily: 'inherit',
                      cursor: (busy || !longEnough || !matches) ? 'not-allowed' : 'pointer',
                      background: (busy || !longEnough || !matches)
                        ? '#1b2230' : 'linear-gradient(180deg,#3f6fbf,#2d5aa8)',
                      border: '1px solid ' + ((busy || !longEnough || !matches) ? '#38445c' : '#2d5aa8'),
                      color: (busy || !longEnough || !matches) ? '#5d6b83' : '#fff'
                    }
                  }, busy ? 'Saving\u2026' : 'Set Password')
                )
        )
      )
    );
  }

  window.ResetPassword = ResetPassword;
})();
