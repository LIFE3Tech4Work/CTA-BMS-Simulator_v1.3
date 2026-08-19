/**
 * LocalAccounts.js — self-registered accounts for the sign-up flow
 *
 * The simulator shipped with a fixed set of credentials in AuthContext.js and no
 * way to create an account, so a class could only ever share the seats an
 * administrator had already defined. This adds registration, password change and
 * recovery on top, stored locally.
 *
 * The built-in demo accounts (cta_student, cta_instructor, student_a…f) still work
 * and are unchanged — they are just no longer advertised on the sign-on screen.
 *
 * ── WHAT THIS IS AND IS NOT ──────────────────────────────────────────────────
 * This is a classroom simulator running on a browser, with no server. That means:
 *
 *   • Accounts exist only in THIS browser on THIS machine. Registering on one
 *     computer does not let you sign in on another.
 *   • Passwords are held in local storage. They are hashed rather than left in
 *     plain text, but a hash computed in the browser protects nobody who has
 *     access to the machine — it only avoids passwords being readable at a
 *     glance. Do not reuse a real password here.
 *   • Recovery cannot send email. It verifies the address on the account and lets
 *     the password be reset directly, which is only acceptable because nothing
 *     private is behind it.
 *
 * All three limits go away with the Supabase migration (docs/supabase-schema.sql):
 * real accounts, server-side password hashing, and an actual emailed reset link.
 * The API here is deliberately the shape Supabase auth already has — signUp,
 * signIn, resetPassword — so that swap is a rewrite of this file alone.
 *
 * No import/export — exposes window.LocalAccounts.
 */
(function () {
  'use strict';

  var KEY = 'cta_local_accounts';

  // Shared with the sign-on form so the live field validation and the store agree
  // on what counts as valid — two copies of a rule drift, and then the form says
  // one thing while the submit says another.
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var MIN_PASSWORD = 6;

  // Not a security measure — see the note above. A stable non-reversible-at-a-
  // glance digest so stored records do not read as a password list.
  function digest(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      h1 = ((h1 ^ s.charCodeAt(i)) * 0x01000193) >>> 0;
      h2 = ((h2 + s.charCodeAt(i) * (i + 7)) * 0x85ebca6b) >>> 0;
    }
    return h1.toString(36) + '-' + h2.toString(36) + '-' + s.length;
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function write(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {}
  }

  function normalise(username) {
    return String(username || '').trim().toLowerCase();
  }

  /** Built-in credentials, so registration cannot shadow a demo account. */
  function isReserved(username) {
    var u = normalise(username);
    var demo = (window.AuthHelpers && window.AuthHelpers.DEMO_ACCOUNTS) || [];
    return demo.some(function (a) { return normalise(a.operator) === u; });
  }

  function exists(username) {
    return !!read()[normalise(username)];
  }

  function get(username) {
    var r = read()[normalise(username)];
    return r ? Object.assign({}, r) : null;
  }

  /**
   * Create an account. Returns { ok } or { ok:false, error } with a message meant
   * to be shown to the person typing, not logged.
   */
  function signUp(fields) {
    var email = String(fields.email || '').trim();
    var password = String(fields.password || '');
    var firstName = String(fields.firstName || '').trim();
    var lastName = String(fields.lastName || '').trim();
    // The email IS the identifier — the form no longer asks for a username, so
    // there is nothing to invent one from and nothing for a student to forget.
    // Kept in `username` because that is the key every other screen already reads
    // as the operator (assignments, attempts, roster).
    var username = normalise(email);

    if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email address.' };
    if (isReserved(username)) return { ok: false, error: 'That address is reserved. Use another.' };
    if (exists(username)) return { ok: false, error: 'An account with that email already exists.' };
    if (password.length < MIN_PASSWORD) {
      return { ok: false, error: 'Password must be at least ' + MIN_PASSWORD + ' characters.' };
    }
    if (!firstName || !lastName) return { ok: false, error: 'Enter your first and last name.' };

    var map = read();
    map[username] = {
      username: username,
      email: email,
      firstName: firstName,
      lastName: lastName,
      // Students get operator rights, same as the seat accounts. Instructor level
      // is never self-assigned — see promote() below.
      securityLevel: 'Oper',
      hash: digest(password + '|' + username),
      createdAt: new Date().toISOString()
    };
    write(map);
    return { ok: true, account: get(username) };
  }

  /**
   * Validate a sign-in. Returns the securityLevel, or null.
   *
   * Accepts either the username or the email on the account, because the sign-on
   * field is labelled "Username or Email Address" — and a student who just
   * registered with an email will reach for that first. Keying on the username
   * alone made the label promise an input the lookup rejected.
   */
  function signIn(identifier, password) {
    var map = read();
    var typed = normalise(identifier);
    var r = map[typed];

    if (!r) {
      // Fall back to an email match. Emails are compared case-insensitively, the
      // way every mail system treats them.
      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i++) {
        var cand = map[keys[i]];
        if (cand && String(cand.email || '').trim().toLowerCase() === typed) { r = cand; break; }
      }
    }
    if (!r) return null;

    // The digest is salted with the account's OWN username, so it must be verified
    // against that — not against whatever string was typed, which may be an email.
    if (r.hash !== digest(String(password) + '|' + normalise(r.username))) return null;
    return { securityLevel: r.securityLevel || 'Oper', username: r.username };
  }

  /**
   * Recovery. Without a mail server this verifies the email on the account and
   * lets the password be set directly — acceptable only because this store holds
   * nothing private. Supabase replaces it with a real emailed link.
   */
  function resetPassword(username, email, newPassword) {
    var u = normalise(username);
    var map = read();
    var r = map[u];
    if (!r) return { ok: false, error: 'No account with that username.' };
    if (String(r.email).toLowerCase() !== String(email || '').trim().toLowerCase()) {
      return { ok: false, error: 'That email does not match the one on the account.' };
    }
    if (String(newPassword || '').length < MIN_PASSWORD) {
      return { ok: false, error: 'New password must be at least ' + MIN_PASSWORD + ' characters.' };
    }
    r.hash = digest(String(newPassword) + '|' + u);
    map[u] = r;
    write(map);
    return { ok: true };
  }

  /** Instructor rights, granted deliberately rather than at signup. */
  function promote(username, level) {
    var u = normalise(username);
    var map = read();
    if (!map[u]) return false;
    map[u].securityLevel = level || 'Engr';
    write(map);
    return true;
  }

  function all() {
    var map = read();
    return Object.keys(map).map(function (k) { return Object.assign({}, map[k]); });
  }

  /** True when a real backend is available, in which case it owns accounts. */
  function backend() {
    var B = window.SupabaseBackend;
    return (B && B.isConfigured()) ? B : null;
  }

  // ─── Async API, used by the sign-on screen ───────────────────────────────────
  // Supabase auth is asynchronous and local accounts are not, so the screen talks
  // to these promise-returning wrappers and does not need to know which is in play.
  // With no backend configured they resolve against local storage, so a classroom
  // with no internet still works.

  function signUpAsync(fields) {
    var B = backend();
    if (!B) return Promise.resolve(signUp(fields));
    return B.signUp(fields).then(function (res) {
      if (!res.ok && res.local) return signUp(fields);
      return res;
    });
  }

  function signInAsync(identifier, password) {
    var B = backend();
    if (!B) {
      var r = signIn(identifier, password);
      return Promise.resolve(r ? { ok: true, username: r.username, securityLevel: r.securityLevel }
                               : { ok: false, error: 'That email and password do not match an account.' });
    }
    return B.signIn(identifier, password).then(function (res) {
      if (!res.ok && res.local) {
        var lr = signIn(identifier, password);
        return lr ? { ok: true, username: lr.username, securityLevel: lr.securityLevel } : res;
      }
      if (!res.ok) return res;
      // Pull this user's rows down before the app renders, so the first screen they
      // see is not an empty exercise list that fills in a second later.
      return B.currentProfile().then(function (profile) {
        return B.syncDown().then(function () {
          return {
            ok: true,
            username: (res.user && res.user.id) || identifier,
            email: (res.user && res.user.email) || identifier,
            displayName: profile && profile.display_name,
            // Instructor rights come from the profiles table, never from anything
            // the browser could set.
            securityLevel: (profile && profile.role === 'instructor') ? 'Engr' : 'Oper'
          };
        });
      });
    });
  }

  /**
   * With a backend this emails a reset link; without one it verifies the address on
   * the account and sets the password directly, which is only acceptable because
   * local storage holds nothing private.
   */
  function resetPasswordAsync(email, newPassword) {
    var B = backend();
    if (!B) return Promise.resolve(resetPassword(email, email, newPassword));
    return B.resetPassword(email).then(function (res) {
      if (!res.ok && res.local) return resetPassword(email, email, newPassword);
      return res.ok ? { ok: true, emailed: true } : res;
    });
  }

  window.LocalAccounts = {
    backendActive: function () { return !!backend(); },
    signUpAsync: signUpAsync,
    signInAsync: signInAsync,
    resetPasswordAsync: resetPasswordAsync,
    KEY: KEY,
    EMAIL_RE: EMAIL_RE,
    MIN_PASSWORD: MIN_PASSWORD,
    exists: exists,
    get: get,
    signUp: signUp,
    signIn: signIn,
    resetPassword: resetPassword,
    promote: promote,
    all: all
  };
})();
