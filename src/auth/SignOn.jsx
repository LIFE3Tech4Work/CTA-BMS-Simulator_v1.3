/* SignOn.jsx — Honeywell EBI-style sign-on dialog
 * Loaded via <script type="text/babel"> before App.jsx
 * No import/export — exposes window.SignOn
 */

(function() {
  'use strict';

  const { useState, useCallback } = React;

  function SignOn() {
    const [operator, setOperator] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = useCallback(function(e) {
      e.preventDefault();
      setError('');
      setIsLoading(true);

      var authResult = window.AuthHelpers.login(operator, password);

      if (authResult) {
        // Valid credentials — update auth state and navigate
        if (window.setAuthState) {
          window.setAuthState(authResult);
        }
        // Navigate to SymmetrE within 1 second
        setTimeout(function() {
          window.location.hash = '#/symmetre';
          setIsLoading(false);
        }, 300);
      } else {
        // Invalid credentials — show error, clear password
        setError('Invalid operator name or password');
        setPassword('');
        setIsLoading(false);
      }
    }, [operator, password]);

    const handleOperatorChange = useCallback(function(e) {
      var value = e.target.value;
      if (value.length <= 32) {
        setOperator(value);
      }
    }, []);

    const handlePasswordChange = useCallback(function(e) {
      var value = e.target.value;
      if (value.length <= 64) {
        setPassword(value);
      }
    }, []);

    return React.createElement('div', {
      className: 'flex items-center justify-center h-screen',
      style: { background: '#141a26', fontFamily: "'Barlow','Segoe UI',system-ui,sans-serif" }
    },
      React.createElement('div', {
        className: 'w-full max-w-md'
      },
        // Main dialog container
        React.createElement('div', {
          className: 'rounded-md shadow-2xl overflow-hidden',
          style: { background: 'linear-gradient(180deg,#243044,#1b2536)', border: '1px solid #171f2d' }
        },
          // Title bar (Honeywell EBI style)
          React.createElement('div', {
            className: 'px-4 py-2 flex items-center justify-between',
            style: { background: 'linear-gradient(180deg,#33425d,#2b3850)', borderBottom: '1px solid #171f2d' }
          },
            React.createElement('div', { className: 'flex items-center gap-2' },
              // LIFE3 mark
              React.createElement('img', {
                src: 'assets/LIFE3_White_Logo.png',
                alt: 'LIFE3',
                className: 'h-5 w-auto select-none',
                draggable: false,
              }),
              React.createElement('span', {
                className: 'text-white text-sm font-semibold tracking-wide'
              }, 'LIFE3 BMS Simulator')
            ),
            // Window control dots (decorative)
            React.createElement('div', { className: 'flex gap-1' },
              React.createElement('div', { className: 'w-3 h-3 rounded-full', style: { background: 'rgba(255,255,255,.22)' } }),
              React.createElement('div', { className: 'w-3 h-3 rounded-full', style: { background: 'rgba(255,255,255,.22)' } }),
              React.createElement('div', { className: 'w-3 h-3 rounded-full', style: { background: 'rgba(255,255,255,.22)' } })
            )
          ),

          // Form body
          React.createElement('div', { className: 'p-6' },
            // System info
            React.createElement('div', {
              className: 'text-center mb-6'
            },
              React.createElement('p', {
                className: 'text-sm', style: { color: '#e8edf6' }
              }, 'Enterprise Buildings Integrator'),
              React.createElement('p', {
                className: 'text-xs mt-1', style: { color: '#9db0c8' }
              }, 'CTA Training Building — NYC Downtown')
            ),

            // Login form
            React.createElement('form', {
              onSubmit: handleSubmit
            },
              // Operator name field
              React.createElement('div', { className: 'mb-4' },
                React.createElement('label', {
                  htmlFor: 'signon-operator',
                  className: 'block text-sm mb-1', style: { color: '#c7d4e6' }
                }, 'Operator Name'),
                React.createElement('input', {
                  id: 'signon-operator',
                  type: 'text',
                  value: operator,
                  onChange: handleOperatorChange,
                  maxLength: 32,
                  autoComplete: 'username',
                  autoFocus: true,
                  className: 'w-full px-3 py-2 rounded text-white text-sm focus:outline-none',
                  style: { background: '#1b2536', border: '1px solid #46536b', fontFamily: 'inherit' },
                  onFocus: function (e) { e.target.style.borderColor = '#35bdd3'; e.target.style.boxShadow = '0 0 0 1px #35bdd3'; },
                  onBlur: function (e) { e.target.style.borderColor = '#46536b'; e.target.style.boxShadow = 'none'; },
                  placeholder: 'Enter operator name'
                })
              ),

              // Password field
              React.createElement('div', { className: 'mb-4' },
                React.createElement('label', {
                  htmlFor: 'signon-password',
                  className: 'block text-sm mb-1', style: { color: '#c7d4e6' }
                }, 'Password'),
                React.createElement('input', {
                  id: 'signon-password',
                  type: 'password',
                  value: password,
                  onChange: handlePasswordChange,
                  maxLength: 64,
                  autoComplete: 'current-password',
                  className: 'w-full px-3 py-2 rounded text-white text-sm focus:outline-none',
                  style: { background: '#1b2536', border: '1px solid #46536b', fontFamily: 'inherit' },
                  onFocus: function (e) { e.target.style.borderColor = '#35bdd3'; e.target.style.boxShadow = '0 0 0 1px #35bdd3'; },
                  onBlur: function (e) { e.target.style.borderColor = '#46536b'; e.target.style.boxShadow = 'none'; },
                  placeholder: 'Enter password'
                })
              ),

              // Error message area (hidden by default)
              error ? React.createElement('div', {
                className: 'mb-4 px-3 py-2 rounded text-sm',
                style: { background: 'rgba(224,52,43,.14)', border: '1px solid #8a2018', color: '#ff8a7e' },
                role: 'alert'
              }, error) : null,

              // Sign On button
              React.createElement('button', {
                type: 'submit',
                disabled: isLoading || !operator || !password,
                className: 'w-full py-2 px-4 text-sm font-semibold rounded transition-colors',
                style: (function () {
                  var off = isLoading || !operator || !password;
                  return {
                    background: off ? '#1b2230' : 'linear-gradient(180deg,#3f6fbf,#2d5aa8)',
                    border: '1px solid ' + (off ? '#38445c' : '#2d5aa8'),
                    color: off ? '#5d6b83' : '#fff',
                    cursor: off ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit'
                  };
                })()
              }, isLoading ? 'Signing On...' : 'Sign On')
            ),

            // Demo credentials hint
            React.createElement('div', {
              className: 'mt-4 pt-4', style: { borderTop: '1px solid #2b3850' }
            },
              React.createElement('p', {
                className: 'text-xs text-center mb-2', style: { color: '#9db0c8' }
              }, 'Demo Accounts'),
              React.createElement('div', { className: 'flex justify-center gap-4 text-xs' },
                React.createElement('div', null,
                  React.createElement('span', { style: { color: '#9db0c8' } }, 'Student: '),
                  React.createElement('span', { style: { color: '#6fd3e8', fontWeight: 700, fontSize: '13.5px' } }, 'cta_student / bms2026')
                )
              )
            )
          ),

          // Status bar (bottom)
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

  // Expose on window
  window.SignOn = SignOn;
})();
