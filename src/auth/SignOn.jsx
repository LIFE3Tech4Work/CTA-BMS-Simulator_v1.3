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
      className: 'flex items-center justify-center h-screen bg-bms-dark'
    },
      React.createElement('div', {
        className: 'w-full max-w-md'
      },
        // Main dialog container
        React.createElement('div', {
          className: 'bg-gray-800 border border-gray-600 rounded shadow-2xl overflow-hidden'
        },
          // Title bar (Honeywell EBI style)
          React.createElement('div', {
            className: 'bg-gradient-to-r from-blue-900 to-blue-800 px-4 py-2 flex items-center justify-between border-b border-gray-600'
          },
            React.createElement('div', { className: 'flex items-center gap-2' },
              // Honeywell icon placeholder
              React.createElement('div', {
                className: 'w-5 h-5 bg-red-600 rounded-sm flex items-center justify-center'
              },
                React.createElement('span', { className: 'text-white text-xs font-bold' }, 'H')
              ),
              React.createElement('span', {
                className: 'text-white text-sm font-semibold tracking-wide'
              }, 'Honeywell EBI Sign On')
            ),
            // Window control dots (decorative)
            React.createElement('div', { className: 'flex gap-1' },
              React.createElement('div', { className: 'w-3 h-3 rounded-full bg-gray-500' }),
              React.createElement('div', { className: 'w-3 h-3 rounded-full bg-gray-500' }),
              React.createElement('div', { className: 'w-3 h-3 rounded-full bg-gray-500' })
            )
          ),

          // Form body
          React.createElement('div', { className: 'p-6' },
            // System info
            React.createElement('div', {
              className: 'text-center mb-6'
            },
              React.createElement('p', {
                className: 'text-gray-300 text-sm'
              }, 'Enterprise Buildings Integrator'),
              React.createElement('p', {
                className: 'text-gray-500 text-xs mt-1'
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
                  className: 'block text-gray-300 text-sm mb-1'
                }, 'Operator Name'),
                React.createElement('input', {
                  id: 'signon-operator',
                  type: 'text',
                  value: operator,
                  onChange: handleOperatorChange,
                  maxLength: 32,
                  autoComplete: 'username',
                  autoFocus: true,
                  className: 'w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-bms-cyan focus:ring-1 focus:ring-bms-cyan',
                  placeholder: 'Enter operator name'
                })
              ),

              // Password field
              React.createElement('div', { className: 'mb-4' },
                React.createElement('label', {
                  htmlFor: 'signon-password',
                  className: 'block text-gray-300 text-sm mb-1'
                }, 'Password'),
                React.createElement('input', {
                  id: 'signon-password',
                  type: 'password',
                  value: password,
                  onChange: handlePasswordChange,
                  maxLength: 64,
                  autoComplete: 'current-password',
                  className: 'w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-bms-cyan focus:ring-1 focus:ring-bms-cyan',
                  placeholder: 'Enter password'
                })
              ),

              // Error message area (hidden by default)
              error ? React.createElement('div', {
                className: 'mb-4 px-3 py-2 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm',
                role: 'alert'
              }, error) : null,

              // Sign On button
              React.createElement('button', {
                type: 'submit',
                disabled: isLoading || !operator || !password,
                className: 'w-full py-2 px-4 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded border border-blue-500 disabled:border-gray-500 transition-colors'
              }, isLoading ? 'Signing On...' : 'Sign On')
            ),

            // Demo credentials hint
            React.createElement('div', {
              className: 'mt-4 pt-4 border-t border-gray-700'
            },
              React.createElement('p', {
                className: 'text-gray-500 text-xs text-center mb-2'
              }, 'Demo Accounts'),
              React.createElement('div', { className: 'flex justify-center gap-4 text-xs' },
                React.createElement('div', { className: 'text-gray-400' },
                  React.createElement('span', { className: 'text-gray-500' }, 'Student: '),
                  React.createElement('span', { className: 'text-bms-cyan' }, 'cta_student / bms2026')
                )
              )
            )
          ),

          // Status bar (bottom)
          React.createElement('div', {
            className: 'bg-gray-900 border-t border-gray-600 px-4 py-1 flex justify-between items-center'
          },
            React.createElement('span', { className: 'text-gray-500 text-xs' }, 'Honeywell | EBI R700'),
            React.createElement('span', { className: 'text-gray-500 text-xs' }, 'Security: Not Authenticated')
          )
        )
      )
    );
  }

  // Expose on window
  window.SignOn = SignOn;
})();
