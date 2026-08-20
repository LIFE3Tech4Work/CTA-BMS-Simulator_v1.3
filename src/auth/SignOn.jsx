/* SignOn.jsx — LIFE3 BMS Simulator sign-on
 *
 * Three modes in one dialog: sign in, create an account, recover a password. The
 * screen previously offered only sign-in against a fixed credential list, and
 * printed a demo username and password on the face of it — fine for a private
 * demo, wrong for anything a class uses.
 *
 * The demo accounts still work exactly as before (cta_student, cta_instructor,
 * student_a…f, all with bms2026); they are simply no longer advertised. Anyone who
 * needs them has been told them.
 *
 * "Operator Name" is now "Username or Email Address": self-registered accounts are
 * created with both, and people reach for their email first.
 *
 * Registration is handled by auth/LocalAccounts.js — read the note at the top of
 * that file for what local accounts can and cannot promise. Recovery cannot email
 * without a server, which the recover panel says plainly rather than implying a
 * link is on its way.
 *
 * No import/export — exposes window.SignOn.
 */

(function() {
  'use strict';

  const { useState, useCallback } = React;

  // ─── Shared field styling ───────────────────────────────────────────────────
  const FIELD_CLASS = 'w-full px-3 py-2 rounded text-white text-sm focus:outline-none';
  const FIELD_STYLE = { background: '#1b2536', border: '1px solid #46536b', fontFamily: 'inherit' };

  function focusOn(e) { e.target.style.borderColor = '#35bdd3'; e.target.style.boxShadow = '0 0 0 1px #35bdd3'; }
  function focusOff(e) { e.target.style.borderColor = '#46536b'; e.target.style.boxShadow = 'none'; }


  function Field(props) {
    // Live validation state: 'ok' tints the border green, 'bad' red. Null leaves it
    // neutral, which is what an untouched field should look like — colouring a
    // field the moment it renders scolds someone for not having typed yet.
    var st = props.state;
    var borderColor = st === 'bad' ? '#c0392b' : (st === 'ok' ? '#2f7a52' : '#46536b');
    var hintColor = st === 'bad' ? '#ff8a7e' : (st === 'ok' ? '#8ff0b5' : '#6f7f97');
    return React.createElement('div', { className: props.wrapClass || 'mb-4' },
      React.createElement('label', {
        htmlFor: props.id,
        className: 'block text-sm mb-1', style: { color: '#c7d4e6' }
      }, props.label),
      React.createElement('input', {
        id: props.id,
        type: props.type || 'text',
        value: props.value,
        onChange: props.onChange,
        maxLength: props.maxLength || 64,
        autoComplete: props.autoComplete,
        autoFocus: props.autoFocus,
        className: FIELD_CLASS,
        style: Object.assign({}, FIELD_STYLE, { border: '1px solid ' + borderColor }),
        onFocus: focusOn,
        onBlur: function (e) {
          e.target.style.borderColor = borderColor;
          e.target.style.boxShadow = 'none';
        },
        placeholder: props.placeholder
      }),
      props.hint ? React.createElement('p', {
        className: 'text-xs mt-1', style: { color: hintColor }
      }, props.hint) : null
    );
  }

  function primaryButtonStyle(disabled) {
    return {
      background: disabled ? '#1b2230' : 'linear-gradient(180deg,#3f6fbf,#2d5aa8)',
      border: '1px solid ' + (disabled ? '#38445c' : '#2d5aa8'),
      color: disabled ? '#5d6b83' : '#fff',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit'
    };
  }

  function SignOn() {
    // 'signin' | 'signup' | 'recover'
    const [mode, setMode] = useState('signin');

    const [operator, setOperator] = useState('');
    const [password, setPassword] = useState('');

    // Sign-up fields
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [confirm, setConfirm] = useState('');

    // Recovery fields
    const [newPassword, setNewPassword] = useState('');

    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    function switchMode(next) {
      setMode(next);
      setError('');
      setNotice('');
      setClearable('');
      setPassword('');
      setConfirm('');
      setNewPassword('');
    }

    // ─── Sign in ──────────────────────────────────────────────────────────────
    const handleSignIn = useCallback(function(e) {
      e.preventDefault();
      setError(''); setNotice(''); setIsLoading(true);

      // Built-in demo accounts first, and synchronously — they must keep working
      // with no backend, no network and no waiting.
      var demo = window.AuthHelpers.login(operator.trim(), password);
      if (demo) {
        if (window.setAuthState) window.setAuthState(demo);
        setTimeout(function () {
          window.location.hash = '#/symmetre';
          setIsLoading(false);
        }, 300);
        return;
      }

      // Then a real account. Asynchronous, because this is a network call when a
      // backend is configured.
      var LA = window.LocalAccounts;
      if (!LA || !LA.signInAsync) {
        setError('That email and password do not match an account.');
        setPassword(''); setIsLoading(false);
        return;
      }
      LA.signInAsync(operator.trim(), password).then(function (res) {
        if (res && res.ok) {
          // createAuthState is the only correct way to build this — it carries the
          // privilege functions every screen calls, and the field is `authenticated`,
          // not `isAuthenticated`. A hand-rolled fallback object got both wrong.
          if (!window.AuthHelpers.createAuthState) {
            setError('Sign-in is unavailable: the auth layer failed to load.');
            setIsLoading(false);
            return;
          }
          var st = window.AuthHelpers.createAuthState(res.username, res.securityLevel || 'Oper');
          if (window.setAuthState) window.setAuthState(st);
          window.location.hash = '#/symmetre';
        } else {
          // Deliberately does not say which of the two was wrong.
          setError((res && res.error) || 'That email and password do not match an account.');
          setPassword('');
        }
        setIsLoading(false);
      });
    }, [operator, password]);

    // ─── Create account ───────────────────────────────────────────────────────
    const handleSignUp = useCallback(function(e) {
      e.preventDefault();
      setError(''); setNotice('');

      if (password !== confirm) { setError('The two passwords do not match.'); return; }
      if (!window.LocalAccounts) { setError('Account creation is unavailable.'); return; }

      setIsLoading(true);
      window.LocalAccounts.signUpAsync({
        email: email, password: password,
        firstName: firstName, lastName: lastName
      }).then(function (res) {
        if (!res || !res.ok) {
          setError((res && res.error) || 'Could not create the account.');
          setClearable(res && res.localDuplicate ? email.trim() : '');
          setIsLoading(false);
          // A duplicate is not a dead end — it means they already have an account.
          // Send them to sign-in with the address kept, rather than leaving them on a
          // form that will keep refusing.
          if (res && res.duplicate) {
            setOperator(email.trim());
            setMode('signin');
            setNotice('You already have an account with that email. Sign in below, or use Forgot password.');
            setError('');
          }
          return;
        }
        // If the project still requires email confirmation, say so plainly rather
        // than dropping them at a sign-in form that will reject them.
        if (res.needsConfirmation) {
          setNotice('Account created. Check your email for a confirmation link, then sign in.');
          switchMode('signin');
          setIsLoading(false);
          return;
        }
        // Sign the new account straight in — making someone re-type credentials they
        // set ten seconds ago is friction with no purpose.
        return window.LocalAccounts.signInAsync(email.trim(), password).then(function (si) {
          if (si && si.ok && window.AuthHelpers.createAuthState) {
            var st = window.AuthHelpers.createAuthState(si.username, si.securityLevel || 'Oper');
            if (window.setAuthState) window.setAuthState(st);
            window.location.hash = '#/symmetre';
          } else {
            setNotice('Account created. Sign in with your new details.');
            switchMode('signin');
          }
          setIsLoading(false);
        });
      });
    }, [operator, email, password, confirm, firstName, lastName]);

    // ─── Recover ──────────────────────────────────────────────────────────────
    const handleRecover = useCallback(function(e) {
      e.preventDefault();
      setError(''); setNotice('');
      if (!window.LocalAccounts) { setError('Password reset is unavailable.'); return; }

      // Only reachable with a backend: without one there is no way to prove the
      // person asking owns the address, so no reset is offered at all.
      if (!backendOn) { setError('Password reset needs an instructor. Ask them to reset it for you.'); return; }
      setIsLoading(true);
      window.LocalAccounts.resetPasswordAsync(email, newPassword).then(function (res) {
        setIsLoading(false);
        if (!res || !res.ok) { setError((res && res.error) || 'Could not send the reset link.'); return; }
        setNotice('If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.');
        setMode('signin');
        setPassword('');
        setNewPassword('');
      });
    }, [operator, email, newPassword]);

    // Back first, on the left, then the title beneath it. The previous single row
    // put the title left and the back link right, directly under a centred system
    // block — three competing alignments in three stacked rows, which is what made
    // it read oddly. Stacking them left-aligned gives one edge to follow.
    function subHeader(title) {
      return React.createElement('div', { className: 'mb-4' },
        React.createElement('button', {
          type: 'button',
          onClick: function () { switchMode('signin'); },
          className: 'text-xs mb-2',
          style: { background: 'none', border: 'none', color: '#9db0c8', padding: 0,
                   cursor: 'pointer', fontFamily: 'inherit', display: 'block' }
        }, '\u2190 Back to sign in'),
        React.createElement('div', {
          className: 'text-base font-semibold', style: { color: '#e8edf6' }
        }, title)
      );
    }

    // ─── Live validation ──────────────────────────────────────────────────────
    // Checked as you type rather than only on submit, so a mistyped confirmation
    // is caught where it happened instead of after pressing the button. Rules come
    // from LocalAccounts so the form and the store cannot disagree.
    var LA = window.LocalAccounts || {};
    var EMAIL_RE = LA.EMAIL_RE || /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    var MIN_PW = LA.MIN_PASSWORD || 6;

    var emailTyped = email.trim().length > 0;
    var emailValid = EMAIL_RE.test(email.trim());
    var emailTaken = emailTyped && emailValid && LA.exists && LA.exists(email.trim());

    var pwTyped = password.length > 0;
    var pwLongEnough = password.length >= MIN_PW;

    var confirmTyped = confirm.length > 0;
    var pwMatch = confirmTyped && password === confirm;

    function emailState() {
      if (!emailTyped) return null;
      return (emailValid && !emailTaken) ? 'ok' : 'bad';
    }
    function emailHint() {
      if (!emailTyped) return 'This is what you will sign in with.';
      if (!emailValid) return 'That does not look like an email address.';
      if (emailTaken) return 'An account with that email already exists.';
      return 'This is what you will sign in with.';
    }
    function pwHint() {
      if (!pwTyped) return 'At least ' + MIN_PW + ' characters';
      return pwLongEnough
        ? 'Long enough'
        : (MIN_PW - password.length) + ' more character' + ((MIN_PW - password.length) === 1 ? '' : 's');
    }
    function confirmHint() {
      if (!confirmTyped) return 'Repeat it';
      return pwMatch ? 'Passwords match' : 'Passwords do not match';
    }

    var signInDisabled = isLoading || !operator || !password;
    var signUpDisabled = !emailValid || emailTaken || !pwLongEnough || !pwMatch ||
                         !firstName.trim() || !lastName.trim();
    var backendOn = !!(window.LocalAccounts && window.LocalAccounts.backendActive());
    var recoverDisabled = !emailValid;

    return React.createElement('div', {
      className: 'flex justify-center h-screen',
      style: {
        background: '#141a26',
        fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif",
        // The scroller. Without it a panel taller than the window has nowhere to go,
        // because the page shell sets overflow-y: hidden on the body.
        overflowY: 'auto',
        // Breathing room that also guarantees the card never sits flush against a
        // clipped edge when it does overflow.
        padding: '16px'
      }
    },
      React.createElement('div', {
        className: 'w-full max-w-md',
        // Centres a short panel exactly as items-center did, but a tall one grows
        // downward into the scroll instead of out of both ends.
        style: { margin: 'auto' }
      },
        React.createElement('div', {
          className: 'rounded-md shadow-2xl overflow-hidden',
          style: { background: 'linear-gradient(180deg,#243044,#1b2536)', border: '1px solid #171f2d' }
        },
          // Title bar
          React.createElement('div', {
            className: 'px-4 py-2 flex items-center justify-between',
            style: { background: 'linear-gradient(180deg,#33425d,#2b3850)', borderBottom: '1px solid #171f2d' }
          },
            React.createElement('div', { className: 'flex items-center gap-2' },
              React.createElement('img', {
                src: 'assets/LIFE3_White_Logo.png',
                alt: 'LIFE3',
                className: 'h-5 w-auto select-none',
                draggable: false,
              }),
              React.createElement('span', {
                className: 'text-white text-sm font-semibold tracking-wide'
              }, 'LIFE3 BMS Simulator')
            )
            // The three fake window dots are gone: this is a full-page sign-on, not
            // a window, so they implied controls that were never clickable.
          ),

          React.createElement('div', { className: 'p-6' },
            // The centred building block belongs to the sign-on screen itself. On the
            // sub-screens it sat above a left-aligned heading and fought it, so it is
            // dropped there — the sub-header says where you are instead.
            mode === 'signin' ? React.createElement('div', { className: 'text-center mb-5' },
              React.createElement('p', { className: 'text-sm', style: { color: '#e8edf6' } },
                'Enterprise Buildings Integrator'),
              React.createElement('p', { className: 'text-xs mt-1', style: { color: '#9db0c8' } },
                'CTA Training Building — NYC Downtown')
            ) : null,

            notice ? React.createElement('div', {
              className: 'mb-4 px-3 py-2 rounded text-sm',
              style: { background: 'rgba(63,143,90,.16)', border: '1px solid #2f7a52', color: '#8ff0b5' },
              role: 'status'
            }, notice) : null,

            // ── SIGN IN ──────────────────────────────────────────────────────
            mode === 'signin' ? React.createElement('form', { onSubmit: handleSignIn },
              React.createElement(Field, {
                id: 'signon-operator',
                // Renamed from "Operator Name": accounts now carry an email, and
                // that is what people reach for first.
                label: 'Username or Email Address',
                value: operator,
                onChange: function (e) { setOperator(e.target.value.slice(0, 64)); },
                autoComplete: 'username',
                autoFocus: true,
                placeholder: 'Username or email'
              }),
              React.createElement(Field, {
                id: 'signon-password',
                label: 'Password',
                type: 'password',
                value: password,
                onChange: function (e) { setPassword(e.target.value.slice(0, 64)); },
                autoComplete: 'current-password',
                placeholder: 'Enter password'
              }),
              error ? React.createElement('div', {
                className: 'mb-4 px-3 py-2 rounded text-sm',
                style: { background: 'rgba(224,52,43,.14)', border: '1px solid #8a2018', color: '#ff8a7e' },
                role: 'alert'
              }, error) : null,
              React.createElement('button', {
                type: 'submit',
                disabled: signInDisabled,
                className: 'w-full py-2 px-4 text-sm font-semibold rounded transition-colors',
                style: primaryButtonStyle(signInDisabled)
              }, isLoading ? 'Signing On...' : 'Sign On'),
              React.createElement('div', { className: 'flex justify-between mt-3' },
                React.createElement('button', {
                  type: 'button',
                  onClick: function () { switchMode('signup'); },
                  className: 'text-xs',
                  style: { background: 'none', border: 'none', color: '#6fd3e8', cursor: 'pointer', fontFamily: 'inherit' }
                }, 'Create an account'),
                React.createElement('button', {
                  type: 'button',
                  onClick: function () { switchMode('recover'); },
                  className: 'text-xs',
                  style: { background: 'none', border: 'none', color: '#9db0c8', cursor: 'pointer', fontFamily: 'inherit' }
                }, 'Forgot password?')
              )
            ) : null,

            // ── CREATE ACCOUNT ───────────────────────────────────────────────
            mode === 'signup' ? React.createElement('form', { onSubmit: handleSignUp },
              subHeader('Create an account'),
              React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                React.createElement(Field, {
                  id: 'su-first', label: 'First Name', value: firstName,
                  onChange: function (e) { setFirstName(e.target.value.slice(0, 40)); },
                  autoComplete: 'given-name', autoFocus: true, placeholder: 'First'
                }),
                React.createElement(Field, {
                  id: 'su-last', label: 'Last Name', value: lastName,
                  onChange: function (e) { setLastName(e.target.value.slice(0, 40)); },
                  autoComplete: 'family-name', placeholder: 'Last'
                })
              ),
              React.createElement(Field, {
                id: 'su-email', label: 'Email Address', type: 'email', value: email,
                onChange: function (e) { setEmail(e.target.value.slice(0, 80)); },
                autoComplete: 'email', placeholder: 'name@example.com',
                state: emailState(), hint: emailHint()
              }),
                            React.createElement('div', { className: 'grid grid-cols-2 gap-3' },
                React.createElement(Field, {
                  id: 'su-pass', label: 'Password', type: 'password', value: password,
                  onChange: function (e) { setPassword(e.target.value.slice(0, 64)); },
                  autoComplete: 'new-password', placeholder: '',
                  state: pwTyped ? (pwLongEnough ? 'ok' : 'bad') : null,
                  hint: pwHint()
                }),
                React.createElement(Field, {
                  id: 'su-confirm', label: 'Confirm Password', type: 'password', value: confirm,
                  onChange: function (e) { setConfirm(e.target.value.slice(0, 64)); },
                  autoComplete: 'new-password', placeholder: '',
                  state: confirmTyped ? (pwMatch ? 'ok' : 'bad') : null,
                  hint: confirmHint()
                })
              ),
              error ? React.createElement('div', {
                className: 'mb-4 px-3 py-2 rounded text-sm',
                style: { background: 'rgba(224,52,43,.14)', border: '1px solid #8a2018', color: '#ff8a7e' },
                role: 'alert'
              },
                error,
                // A browser-only record is the one blocker the person can clear
                // themselves, so offer the action rather than an error they can only
                // read — the alternative is walking someone through devtools.
                clearable ? React.createElement('button', {
                  type: 'button',
                  onClick: function () {
                    if (window.LocalAccounts && window.LocalAccounts.forget) {
                      window.LocalAccounts.forget(clearable);
                    }
                    setClearable('');
                    setError('');
                    setNotice('Local record cleared. Create your account again.');
                  },
                  style: { display: 'block', marginTop: '7px', padding: '4px 10px',
                           borderRadius: '4px', fontSize: '12px', fontWeight: 600,
                           cursor: 'pointer', fontFamily: 'inherit',
                           background: 'rgba(255,255,255,.08)',
                           border: '1px solid #8a2018', color: '#ffb3aa' }
                }, 'Clear the local record and try again') : null
              ) : null,
              // The browser-only caveat is a real limitation someone would otherwise
              // discover on a second machine, so it stays. With a backend there is no
              // caveat to give, and a line saying so was just noise under the button.
              backendOn ? null : React.createElement('p', {
                className: 'text-xs mt-3 leading-relaxed', style: { color: '#6f7f97' }
              }, 'No backend is configured, so this account is stored in this browser only and will not work on another computer. Do not reuse a password from anywhere else.')
            ) : null,

            // ── FORGOT PASSWORD ──────────────────────────────────────────────
            mode === 'recover' ? React.createElement('form', { onSubmit: handleRecover },
              subHeader('Reset your password'),
              React.createElement('p', {
                className: 'text-xs mb-4 leading-relaxed', style: { color: '#9db0c8' }
              }, backendOn
                ? 'Enter the email on your account. A reset link will be sent to it — open it to set a new password.'
                : 'Resetting your own password needs an email to be sent, and this copy of the simulator has no mail server. Ask your instructor to reset it for you — they can do it in seconds.'),
                            backendOn ? React.createElement(Field, {
                id: 'rc-email', label: 'Email Address', type: 'email', value: email,
                onChange: function (e) { setEmail(e.target.value.slice(0, 80)); },
                autoComplete: 'email', autoFocus: true, placeholder: 'name@example.com'
              }) : null,

              error ? React.createElement('div', {
                className: 'mb-4 px-3 py-2 rounded text-sm',
                style: { background: 'rgba(224,52,43,.14)', border: '1px solid #8a2018', color: '#ff8a7e' },
                role: 'alert'
              }, error) : null,
              backendOn ? React.createElement('button', {
                type: 'submit',
                disabled: recoverDisabled,
                className: 'w-full py-2 px-4 text-sm font-semibold rounded transition-colors',
                style: primaryButtonStyle(recoverDisabled)
              }, 'Send Reset Link') : null,
              React.createElement('p', {
                className: 'text-xs mt-3', style: { color: '#6f7f97' }
              }, backendOn
                  ? 'Using an account your instructor set up? Ask them to reset it for you.'
                  : 'Instructors: sign in, open View \u2192 Exercise Report, and use Reset Password beside the student\'s name.')
            ) : null
          ),

          // Status bar
          React.createElement('div', {
            className: 'px-4 py-1 flex justify-between items-center',
            style: { background: '#0e1420', borderTop: '1px solid #171f2d' }
          },
            React.createElement('span', { className: 'text-xs', style: { color: '#9db0c8' } }, 'LIFE3 | EBI R700'),
            React.createElement('span', { className: 'text-xs', style: { color: '#9db0c8' } }, 'Security: Not Authenticated')
          )
        )
      )
    );
  }

  window.SignOn = SignOn;
})();
