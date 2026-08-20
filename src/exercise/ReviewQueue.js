/**
 * ReviewQueue.js — persisted record of instructor-flagged points
 *
 * The Flag for Review tab composed a copy-paste prompt and warned "No note is saved
 * here — copy it before closing this dialog." So closing the dialog lost the flag, and
 * there was no record of what had been flagged, by whom, or whether it was dealt with.
 * A QA queue that forgets is not a queue.
 *
 * Same write-through shape as the exercise store: local storage is the cache so reads
 * stay synchronous, and Supabase is the record when configured. That keeps this working
 * on a machine with no backend, which is how the simulator is often run.
 *
 * Schema lives in docs/supabase-schema.sql as public.review_flags.
 *
 * No import/export — exposes window.ReviewQueue.
 */
(function () {
  'use strict';

  var KEY = 'cta_review_flags';
  var listeners = [];

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }
  function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  /**
   * Engr+ check, duplicated from the UI on purpose: resolve/reopen/remove write the
   * local cache BEFORE the server call, and RLS refuses a student's server write
   * silently — so without this a flag could disappear from the screen while still
   * existing in the database.
   */
  function mayEdit() {
    var A = window.AuthHelpers, level = window.CTAAuthLevel;
    return !!(A && A.hasPrivilege && level && A.hasPrivilege(level, 'Engr'));
  }

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

  /** Newest first — a review queue is read from the top. */
  function all() {
    return read().slice().sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  function open() { return all().filter(function (f) { return !f.resolvedAt; }); }

  function newId() {
    return 'flag-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  /**
   * Record a flag. Everything needed to find the point again later, because "the
   * economizer setpoint looked wrong" is not actionable a week afterwards.
   */
  function add(f) {
    var note = String((f && f.note) || '').trim();
    if (!note) return { ok: false, error: 'Add a note describing what looks wrong.' };
    var row = {
      id: newId(),
      unitId: f.unitId || '',
      pointKey: f.pointKey || '',
      pointLabel: f.pointLabel || '',
      pointAddr: f.pointAddr || '',
      valueAtFlag: (f.valueAtFlag === undefined || f.valueAtFlag === null) ? '' : String(f.valueAtFlag),
      statusAtFlag: f.statusAtFlag || '',
      note: note,
      flaggedBy: f.flaggedBy || window.CTAAuthOperator || 'instructor',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null
    };
    var list = read();
    list.push(row);
    write(list);
    push(row);
    return { ok: true, flag: row };
  }

  function resolve(id, by) {
    if (!mayEdit()) return false;
    var list = read();
    var row = list.filter(function (f) { return f.id === id; })[0];
    if (!row) return false;
    row.resolvedAt = new Date().toISOString();
    row.resolvedBy = by || window.CTAAuthOperator || 'instructor';
    write(list);
    push(row);
    return true;
  }

  /** Reopen, for something marked done that turned out not to be. */
  function reopen(id) {
    if (!mayEdit()) return false;
    var list = read();
    var row = list.filter(function (f) { return f.id === id; })[0];
    if (!row) return false;
    row.resolvedAt = null;
    row.resolvedBy = null;
    write(list);
    push(row);
    return true;
  }

  function remove(id) {
    if (!mayEdit()) return false;
    write(read().filter(function (f) { return f.id !== id; }));
    var B = window.SupabaseBackend;
    if (B && B.isConfigured() && B.deleteReviewFlag) B.deleteReviewFlag(id);
  }

  function push(row) {
    var B = window.SupabaseBackend;
    if (B && B.isConfigured() && B.pushReviewFlag) B.pushReviewFlag(row);
  }

  /** The prompt the old tab produced, kept — it was genuinely useful to paste. */
  function promptFor(f) {
    return [
      'BMS Simulator — instructor-flagged point',
      '',
      'Screen: ' + (f.unitId || '—'),
      'Point: ' + (f.pointLabel || f.pointKey || '—') +
        (f.pointAddr ? ' (' + f.pointAddr + ')' : ''),
      'Value when flagged: ' + (f.valueAtFlag || '—'),
      'Status when flagged: ' + (f.statusAtFlag || '—'),
      'Flagged by: ' + (f.flaggedBy || '—') + ' on ' +
        (f.createdAt ? new Date(f.createdAt).toLocaleString('en-US') : '—'),
      '',
      'Instructor note:',
      f.note || ''
    ].join('\n');
  }

  window.ReviewQueue = {
    KEY: KEY,
    all: all,
    open: open,
    add: add,
    resolve: resolve,
    reopen: reopen,
    remove: remove,
    promptFor: promptFor,
    subscribe: subscribe
  };
})();
