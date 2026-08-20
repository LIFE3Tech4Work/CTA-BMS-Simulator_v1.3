/**
 * StudentRoster.js — student identity for the six classroom seats
 *
 * The seats themselves (student_a … student_f) are sign-in credentials defined in
 * auth/AuthContext.js. That is all the app knew about a student, so every screen
 * that named one showed "student_c" — fine for a login, useless on an assignment
 * list or a results table an instructor has to read.
 *
 * This holds the human record for each seat: first name, last name, email. The
 * seat id stays the key, so nothing about assignment or grading changes — an
 * exercise is still assigned to `student_c`; the roster only decides how that seat
 * is DISPLAYED.
 *
 * Deliberately a thin store behind a small API. When the Supabase migration lands
 * (docs/supabase-schema.sql), the profiles table already carries display_name and
 * email per account, and this becomes a query against it rather than a rewrite of
 * every screen that shows a name.
 *
 * No import/export — exposes window.StudentRoster.
 */
(function () {
  'use strict';

  var KEY = 'cta_student_roster';

  function seats() {
    // With a backend, the roster IS the signed-up accounts — real user ids, pulled
    // down by syncDown. Without one, the six fixed seats PLUS anyone who has
    // registered locally.
    //
    // The union matters: self-registered students were invisible to the Exercise
    // Report, so an instructor could never see them or reset their password, while
    // the six demo seats that WERE listed have no stored credential to reset. That
    // combination made the reset control unreachable for every row.
    var B = window.SupabaseBackend;
    if (B && B.isConfigured()) {
      var map = read();
      var ids = Object.keys(map).filter(function (id) {
        // Skip instructors and the six fallback seat ids: a real backend means real
        // accounts, and mixing the placeholder seats in makes an exercise assignable
        // to a seat nobody signs in as.
        if (/^student_[a-f]$/.test(id)) return false;
        return map[id] && map[id].role !== 'instructor';
      });

      // Locally-registered accounts are registrations too. They are keyed by email
      // rather than by user id, which is what sign-in resolves them to, so they are
      // valid assignment targets and belong in the same list.
      var LA = window.LocalAccounts;
      if (LA && LA.all) {
        LA.all().forEach(function (a) {
          var key = a.username || a.email;
          if (!key) return;
          if (/^student_[a-f]$/.test(key)) return;
          if (a.securityLevel && a.securityLevel !== 'Oper') return;   // instructors
          if (ids.indexOf(key) < 0) ids.push(key);
        });
      }
      if (ids.length) return ids;
    }
    var fixed = (window.AuthHelpers && window.AuthHelpers.STUDENT_SEATS) ||
      ['student_a', 'student_b', 'student_c', 'student_d', 'student_e', 'student_f'];
    var LA = window.LocalAccounts;
    if (!LA || typeof LA.all !== 'function') return fixed;
    var registered = LA.all().map(function (a) { return a.username; })
      .filter(function (u) { return fixed.indexOf(u) < 0; });
    return fixed.concat(registered);
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function write(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {}
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  var listeners = [];
  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  /** The stored record for a seat, or an empty one. Never null, so callers need no guard. */
  function get(seatId) {
    var r = read()[seatId] || {};
    // Fall back to the local account record, so a self-registered student shows their
    // real name and email in the report rather than a bare username. They never
    // appear in the roster store — that is written by syncDown or by an instructor
    // naming a fixed seat.
    if (!r.firstName && !r.lastName && !r.email && window.LocalAccounts) {
      var acct = window.LocalAccounts.get(seatId);
      if (acct) {
        return {
          seatId: seatId,
          firstName: acct.firstName || '',
          lastName: acct.lastName || '',
          email: acct.email || ''
        };
      }
    }
    return {
      seatId: seatId,
      firstName: r.firstName || '',
      lastName: r.lastName || '',
      email: r.email || ''
    };
  }

  function set(seatId, fields) {
    var map = read();
    var cur = map[seatId] || {};
    map[seatId] = {
      firstName: fields.firstName !== undefined ? String(fields.firstName).trim() : (cur.firstName || ''),
      lastName: fields.lastName !== undefined ? String(fields.lastName).trim() : (cur.lastName || ''),
      email: fields.email !== undefined ? String(fields.email).trim() : (cur.email || '')
    };
    write(map);
    return get(seatId);
  }

  function all() { return seats().map(get); }

  /** True once someone has actually been entered for this seat. */
  function isNamed(seatId) {
    var r = get(seatId);
    return !!(r.firstName || r.lastName);
  }

  /** "Ada Lovelace" if named, otherwise the seat id — never an empty string. */
  function displayName(seatId) {
    var r = get(seatId);
    var full = (r.firstName + ' ' + r.lastName).trim();
    return full || seatId;
  }

  /** "Ada Lovelace · ada@school.edu", falling back gracefully as fields are filled. */
  function displayLong(seatId) {
    var r = get(seatId);
    var name = displayName(seatId);
    return r.email ? name + ' \u00b7 ' + r.email : name;
  }

  /** Initials for a compact avatar; the seat letter when unnamed. */
  function initials(seatId) {
    var r = get(seatId);
    if (r.firstName || r.lastName) {
      return ((r.firstName[0] || '') + (r.lastName[0] || '')).toUpperCase();
    }
    var m = /_([a-z])$/i.exec(seatId);
    return (m ? m[1] : '?').toUpperCase();
  }

  /** How many seats have a name on them — used to prompt the instructor once. */
  function namedCount() {
    return seats().filter(isNamed).length;
  }

  window.StudentRoster = {
    KEY: KEY,
    seats: seats,
    get: get,
    set: set,
    all: all,
    isNamed: isNamed,
    displayName: displayName,
    displayLong: displayLong,
    initials: initials,
    namedCount: namedCount,
    subscribe: subscribe
  };
})();
