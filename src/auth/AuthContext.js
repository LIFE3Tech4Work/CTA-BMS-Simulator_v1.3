/* AuthContext.js — Security level hierarchy and privilege checks
 * Loaded before App.jsx via <script type="text/babel">
 * No import/export — exposes window.AuthHelpers
 */

(function() {
  'use strict';

  // Security level hierarchy (ascending privilege order)
  const SECURITY_LEVELS = ['ViewOnly', 'AckOnly', 'Oper', 'Supv', 'Engr', 'Mngr'];

  // Demo accounts for credential validation
  const DEMO_ACCOUNTS = [
    { operator: 'cta_student', password: 'bms2026', securityLevel: 'Oper' },
    { operator: 'cta_instructor', password: 'bms2026', securityLevel: 'Engr' }
  ];

  /**
   * Check if a user at `userLevel` has at least `requiredLevel` privilege.
   * Each level includes all privileges of lower levels.
   */
  function hasPrivilege(userLevel, requiredLevel) {
    const userIndex = SECURITY_LEVELS.indexOf(userLevel);
    const requiredIndex = SECURITY_LEVELS.indexOf(requiredLevel);
    if (userIndex === -1 || requiredIndex === -1) return false;
    return userIndex >= requiredIndex;
  }

  /**
   * Validate credentials against demo accounts.
   * Returns { valid: true, securityLevel } or { valid: false }.
   */
  function validateCredentials(operator, password) {
    const account = DEMO_ACCOUNTS.find(
      a => a.operator === operator && a.password === password
    );
    if (account) {
      return { valid: true, securityLevel: account.securityLevel };
    }
    return { valid: false };
  }

  /**
   * Create privilege check methods for a given security level.
   */
  function createPrivilegeChecks(securityLevel) {
    return {
      canWrite: function() { return hasPrivilege(securityLevel, 'Oper'); },
      canAcknowledge: function() { return hasPrivilege(securityLevel, 'AckOnly'); },
      canModifySchedules: function() { return hasPrivilege(securityLevel, 'Supv'); },
      canConfigurePoints: function() { return hasPrivilege(securityLevel, 'Engr'); },
      canManageAccounts: function() { return securityLevel === 'Mngr'; }
    };
  }

  /**
   * Build a full auth state object from operator info.
   */
  function createAuthState(operator, securityLevel) {
    const privileges = createPrivilegeChecks(securityLevel);
    return {
      authenticated: true,
      operator: operator,
      securityLevel: securityLevel,
      canWrite: privileges.canWrite,
      canAcknowledge: privileges.canAcknowledge,
      canModifySchedules: privileges.canModifySchedules,
      canConfigurePoints: privileges.canConfigurePoints,
      canManageAccounts: privileges.canManageAccounts
    };
  }

  /**
   * Default unauthenticated state.
   */
  function createUnauthenticatedState() {
    return {
      authenticated: false,
      operator: '',
      securityLevel: 'ViewOnly',
      canWrite: function() { return false; },
      canAcknowledge: function() { return false; },
      canModifySchedules: function() { return false; },
      canConfigurePoints: function() { return false; },
      canManageAccounts: function() { return false; }
    };
  }

  /**
   * Login: validates credentials, returns new auth state or null on failure.
   */
  function login(operator, password) {
    var result = validateCredentials(operator, password);
    if (result.valid) {
      return createAuthState(operator, result.securityLevel);
    }
    return null;
  }

  /**
   * Logout: returns unauthenticated state.
   */
  function logout() {
    return createUnauthenticatedState();
  }

  // Expose on window
  window.AuthHelpers = {
    SECURITY_LEVELS: SECURITY_LEVELS,
    DEMO_ACCOUNTS: DEMO_ACCOUNTS,
    hasPrivilege: hasPrivilege,
    validateCredentials: validateCredentials,
    createPrivilegeChecks: createPrivilegeChecks,
    createAuthState: createAuthState,
    createUnauthenticatedState: createUnauthenticatedState,
    login: login,
    logout: logout
  };
})();
