/**
 * StudentGroups.js — teams within a class, for group assignments
 *
 * Exercises could only be assigned seat by seat, which meant an instructor running
 * a team project had to remember which three students were Team A and tick them
 * individually on every exercise — and nothing recorded that they were a team, so
 * the results table couldn't show them together either.
 *
 * A group is a named set of seats. Assignment then has three modes:
 *
 *   whole class  — everyone, no targeting to maintain
 *   groups       — one or more teams
 *   individuals  — specific seats, the original behaviour
 *
 * All three resolve down to a flat seat list before an exercise is saved, so
 * ExerciseStore.exercisesFor() and everything downstream of it is unchanged. The
 * targeting is stored alongside that list purely so the author dialog can show what
 * was chosen and the results table can group by team.
 *
 * Mirrors the Supabase model in docs/supabase-schema.sql (groups + group_members +
 * assignments), so the migration is a swap of this file's storage rather than a
 * redesign of how assignment works.
 *
 * No import/export — exposes window.StudentGroups.
 */
(function () {
  'use strict';

  var KEY = 'cta_student_groups';

  function seats() {
    // Delegates to the roster so groups are built from real accounts when a backend
    // is configured, and from the six fixed seats when it is not.
    var R = window.StudentRoster;
    if (R && typeof R.seats === 'function') return R.seats();
    return (window.AuthHelpers && window.AuthHelpers.STUDENT_SEATS) ||
      ['student_a', 'student_b', 'student_c', 'student_d', 'student_e', 'student_f'];
  }

  var listeners = [];
  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }
  function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    notify();
  }

  function all() { return read(); }

  function get(id) {
    var found = read().filter(function (g) { return g.id === id; })[0];
    return found ? Object.assign({}, found) : null;
  }

  function newId() {
    return 'grp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  /** Create a group. Name is required; seats may be filled in later. */
  function create(name, seatIds) {
    var trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, error: 'Give the group a name.' };
    var list = read();
    if (list.some(function (g) { return g.name.toLowerCase() === trimmed.toLowerCase(); })) {
      return { ok: false, error: 'A group with that name already exists.' };
    }
    var g = {
      id: newId(),
      name: trimmed,
      seatIds: (seatIds || []).slice(),
      createdAt: new Date().toISOString()
    };
    list.push(g);
    write(list);
    return { ok: true, group: g };
  }

  function rename(id, name) {
    var trimmed = String(name || '').trim();
    if (!trimmed) return false;
    var list = read();
    var g = list.filter(function (x) { return x.id === id; })[0];
    if (!g) return false;
    g.name = trimmed;
    write(list);
    return true;
  }

  function remove(id) {
    write(read().filter(function (g) { return g.id !== id; }));
  }

  /** Add or remove a seat. A seat may belong to more than one group — teams
   *  sometimes overlap, and refusing that would be a rule nobody asked for. */
  function toggleSeat(groupId, seatId) {
    var list = read();
    var g = list.filter(function (x) { return x.id === groupId; })[0];
    if (!g) return false;
    var i = g.seatIds.indexOf(seatId);
    if (i >= 0) g.seatIds.splice(i, 1); else g.seatIds.push(seatId);
    write(list);
    return true;
  }

  function groupsForSeat(seatId) {
    return read().filter(function (g) { return g.seatIds.indexOf(seatId) >= 0; });
  }

  /** Human label: "Team A (3)" — the count is what tells an instructor it is set up. */
  function label(g) {
    if (!g) return '';
    var total = g.seatIds ? g.seatIds.length : 0;
    var live = resolvableMembers(g).length;
    // "Team B (0 of 3)" makes a stale team visible instead of silently assigning to
    // nobody while claiming three.
    if (live !== total) return g.name + ' (' + live + ' of ' + total + ')';
    return g.name + ' (' + total + ')';
  }

  /**
   * Flatten a targeting choice to the seat list an exercise is actually assigned
   * to. One place, so the author dialog, the store and the results table can never
   * disagree about who an exercise reached.
   *
   * assignment = { mode: 'class'|'groups'|'students', groupIds: [], seatIds: [] }
   */
  function resolveSeats(assignment) {
    var a = assignment || {};
    var valid = seats();
    // A group built before real accounts existed still holds placeholder ids like
    // student_c. Those are exactly what seats() filters out, so returning them would
    // assign an exercise to three people who cannot sign in — and report "3 students
    // will see this" while doing it. Membership is filtered against the live seat list.
    function keep(list) {
      return list.filter(function (s) { return valid.indexOf(s) >= 0; });
    }
    if (a.mode === 'class') return valid.slice();
    if (a.mode === 'groups') {
      var out = [];
      (a.groupIds || []).forEach(function (gid) {
        var grp = get(gid);
        if (!grp) return;
        grp.seatIds.forEach(function (s) { if (out.indexOf(s) < 0) out.push(s); });
      });
      return keep(out);
    }
    return keep(a.seatIds || []);
  }

  /** Members of a group that are still real accounts. */
  function resolvableMembers(grp) {
    if (!grp) return [];
    var valid = seats();
    return grp.seatIds.filter(function (s) { return valid.indexOf(s) >= 0; });
  }

  /** What the assignment says, in words, for the author dialog and the report. */
  function describe(assignment) {
    var a = assignment || {};
    if (a.mode === 'class') return 'Whole class';
    if (a.mode === 'groups') {
      var names = (a.groupIds || []).map(function (gid) {
        var g = get(gid);
        return g ? g.name : null;
      }).filter(Boolean);
      if (!names.length) return 'No group selected';
      return names.join(', ');
    }
    // Counted through resolveSeats, not off the raw list: describing "6 students" while
    // only two have accounts is how an instructor believes an exercise landed when it
    // did not.
    var named = (a.seatIds || []).length;
    var live = resolveSeats(a).length;
    if (!named) return 'Nobody selected';
    if (live < named) {
      return live + ' of ' + named + ' student' + (named === 1 ? '' : 's') +
             ' \u2014 ' + (named - live) + ' have no account yet';
    }
    var n = named;
    var R = window.StudentRoster;
    if (n <= 2 && R) {
      return (a.seatIds || []).map(function (s) { return R.displayName(s); }).join(', ');
    }
    return n + ' student' + (n === 1 ? '' : 's');
  }

  window.StudentGroups = {
    KEY: KEY,
    seats: seats,
    resolvableMembers: resolvableMembers,
    all: all,
    get: get,
    create: create,
    rename: rename,
    remove: remove,
    toggleSeat: toggleSeat,
    groupsForSeat: groupsForSeat,
    label: label,
    resolveSeats: resolveSeats,
    describe: describe,
    subscribe: subscribe
  };
})();
