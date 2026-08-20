/**
 * SupabaseBackend.js — real accounts and shared storage
 *
 * Until now every account, exercise, group and attempt lived in localStorage, which
 * meant a student who signed up on one machine existed only on that machine and an
 * instructor could not see any results at all. This is the layer that makes those
 * things real.
 *
 * ── DESIGN: WRITE-THROUGH CACHE ──────────────────────────────────────────────
 * Every screen in this app reads its data synchronously (ExerciseStore.getExercise,
 * StudentGroups.all, and so on). Supabase is asynchronous. Rewriting every screen
 * to await would have meant touching all of them, so instead:
 *
 *   • reads stay synchronous, served from the same localStorage keys as before
 *   • signing in pulls the server's rows down into those keys
 *   • writes go to localStorage immediately AND to Supabase in the background
 *
 * So the UI is unchanged, the local copy is a cache rather than the record, and the
 * app still works with no backend configured — which matters, because a classroom
 * with no internet should still be able to run an exercise.
 *
 * The honest limitation: a background write that fails leaves the local copy ahead
 * of the server until the next sync. Failures are surfaced through
 * getStatus().lastError rather than swallowed, and syncDown() is safe to re-run.
 *
 * ── WHAT IS SECRET ───────────────────────────────────────────────────────────
 * The publishable key ships to the browser and cannot be hidden; Row Level Security
 * in docs/supabase-schema.sql is what actually protects the data. server.js serves
 * the key from a Railway environment variable so it stays out of the repository.
 *
 * No import/export — exposes window.SupabaseBackend.
 */
(function () {
  'use strict';

  var SDK_URLS = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
    'https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'
  ];

  var client = null;
  var sdkPromise = null;
  var status = { configured: false, ready: false, signedIn: false, lastError: null, lastSync: null };
  var listeners = [];

  function cfg() { return window.CTA_CONFIG || {}; }
  function isConfigured() {
    var c = cfg();
    return !!(c.supabaseUrl && c.supabasePublishableKey);
  }
  status.configured = isConfigured();

  function notify() {
    listeners.forEach(function (fn) { try { fn(getStatus()); } catch (e) {} });
  }
  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }
  function getStatus() { return Object.assign({}, status); }

  function fail(where, err) {
    var detail = (err && (err.message || err.details || err.hint || err.code)) || String(err);
    status.lastError = where + ': ' + detail;
    // Full object, not just the message: PostgREST puts the useful part in code/details
    // (42501 is an RLS refusal, 23503 a missing foreign key), and those name the fix.
    if (window.console) console.error('[Supabase] ' + where, err);
    // Logged rather than swallowed — a silent sync failure is how a class ends up
    // looking at stale data with no idea why.
    if (window.console) console.warn('[Supabase] ' + status.lastError);
    notify();
  }

  /** Load the SDK once, on first use rather than on page load. */
  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
      var i = 0;
      function attempt() {
        if (i >= SDK_URLS.length) {
          return reject(new Error('could not load the Supabase SDK from any CDN'));
        }
        var el = document.createElement('script');
        el.src = SDK_URLS[i++];
        el.async = true;
        el.onload = function () {
          if (window.supabase && window.supabase.createClient) resolve(window.supabase);
          else attempt();
        };
        el.onerror = attempt;   // try the next host rather than giving up
        document.head.appendChild(el);
      }
      attempt();
    });
    return sdkPromise;
  }

  /** The client, or null when unconfigured. Safe to call repeatedly. */
  function getClient() {
    if (!isConfigured()) return Promise.resolve(null);
    if (client) return Promise.resolve(client);
    return loadSdk().then(function (sdk) {
      var c = cfg();
      client = sdk.createClient(c.supabaseUrl, c.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      status.ready = true;
      notify();
      return client;
    }).catch(function (e) { fail('client', e); return null; });
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Create an account. The email is the identifier — the sign-up form asks for no
   * username, so there is nothing to invent or forget.
   *
   * First and last name go into user metadata, which the profiles trigger in
   * docs/supabase-schema.sql reads to fill display_name. role is never sent: the
   * trigger always writes 'student', because anything the client could set is a
   * door a student can walk through.
   */
  function signUp(fields) {
    return getClient().then(function (c) {
      if (!c) {
        // Distinguish "not set up" from "set up but unreachable": only the first may
        // fall back to browser-only storage.
        return isConfigured()
          ? { ok: false, unreachable: true,
              error: 'Could not reach the account server. Check your connection and try again \u2014 do not create a local-only account.' }
          : { ok: false, error: 'No backend configured.', local: true };
      }
      var first = String(fields.firstName || '').trim();
      var last = String(fields.lastName || '').trim();
      return c.auth.signUp({
        email: String(fields.email || '').trim(),
        password: String(fields.password || ''),
        options: {
          data: {
            display_name: (first + ' ' + last).trim(),
            first_name: first,
            last_name: last
          }
        }
      }).then(function (res) {
        var user = res.data && res.data.user;
        var session = res.data && res.data.session;

        if (res.error) {
          var msg = (res.error && res.error.message) || '';
          // A confirmation-email failure hides whether the address was already taken:
          // Supabase attempts the send before it would tell us, so the identities
          // signal below never arrives. Ask the sign-in endpoint instead — if the
          // address exists, a deliberately wrong password comes back as "invalid
          // credentials"; if it does not exist, Supabase says the same thing, so this
          // only distinguishes the case where our OWN password is accepted.
          if (/confirmation email|sending.*email|error sending/i.test(msg)) {
            return c.auth.signInWithPassword({
              email: String(fields.email || '').trim(),
              password: String(fields.password || '')
            }).then(function (probe) {
              if (probe.data && probe.data.session) {
                // Those exact credentials already work — the account is theirs.
                status.signedIn = true;
                notify();
                return {
                  ok: false, duplicate: true, alreadyUsable: true,
                  error: 'You already have an account with that email, and that password works. Sign in below.'
                };
              }
              return { ok: false, error: friendly(res.error) };
            }).catch(function () { return { ok: false, error: friendly(res.error) }; });
          }
          return { ok: false, error: friendly(res.error) };
        }

        // Empty identities means the address is already registered. Supabase returns
        // this INSTEAD of an error to avoid confirming which emails exist, so without
        // the check a duplicate sign-up looks like a brand-new account.
        if (user && Array.isArray(user.identities) && user.identities.length === 0) {
          return {
            ok: false,
            duplicate: true,
            error: 'An account with that email already exists. Sign in instead, or reset the password if you have forgotten it.'
          };
        }

        // With email confirmation switched off (Authentication → Providers → Email)
        // a session comes back immediately and the student is straight in.
        status.signedIn = !!session;
        notify();
        return { ok: true, needsConfirmation: !session, user: user };
      });
    }).catch(function (e) { fail('signUp', e); return { ok: false, error: 'Sign-up failed. ' + e.message }; });
  }

  function signIn(email, password) {
    return getClient().then(function (c) {
      if (!c) {
        // Distinguish "not set up" from "set up but unreachable": only the first may
        // fall back to browser-only storage.
        return isConfigured()
          ? { ok: false, unreachable: true,
              error: 'Could not reach the account server. Check your connection and try again \u2014 do not create a local-only account.' }
          : { ok: false, error: 'No backend configured.', local: true };
      }
      return c.auth.signInWithPassword({
        email: String(email || '').trim(),
        password: String(password || '')
      }).then(function (res) {
        if (res.error) return { ok: false, error: friendly(res.error) };
        status.signedIn = true;
        notify();
        return { ok: true, user: res.data.user, session: res.data.session };
      });
    }).catch(function (e) { fail('signIn', e); return { ok: false, error: 'Sign-in failed. ' + e.message }; });
  }

  /** Emails a real reset link back to this app's #/reset route. */
  function resetPassword(email) {
    return getClient().then(function (c) {
      if (!c) {
        // Distinguish "not set up" from "set up but unreachable": only the first may
        // fall back to browser-only storage.
        return isConfigured()
          ? { ok: false, unreachable: true,
              error: 'Could not reach the account server. Check your connection and try again \u2014 do not create a local-only account.' }
          : { ok: false, error: 'No backend configured.', local: true };
      }
      var redirect = window.location.origin + window.location.pathname + '#/reset';
      return c.auth.resetPasswordForEmail(String(email || '').trim(), { redirectTo: redirect })
        .then(function (res) {
          if (res.error) return { ok: false, error: friendly(res.error) };
          // Supabase reports success whether or not the address is registered, and
          // that is correct — telling an anonymous visitor which emails have accounts
          // hands them a list of who to target. The UI wording matches: "if an
          // account exists", never "sent".
          return { ok: true, emailed: true, ambiguous: true };
        });
    }).catch(function (e) { fail('resetPassword', e); return { ok: false, error: e.message }; });
  }

  /** Called from the #/reset route, once the recovery link has established a session. */
  function updatePassword(newPassword) {
    return getClient().then(function (c) {
      if (!c) return { ok: false, error: 'No backend configured.' };
      return c.auth.updateUser({ password: String(newPassword || '') }).then(function (res) {
        if (res.error) return { ok: false, error: friendly(res.error) };
        return { ok: true };
      });
    }).catch(function (e) { fail('updatePassword', e); return { ok: false, error: e.message }; });
  }

  function signOut() {
    return getClient().then(function (c) {
      if (!c) return;
      return c.auth.signOut().then(function () {
        status.signedIn = false;
        notify();
      });
    }).catch(function (e) { fail('signOut', e); });
  }

  /** The signed-in user's profile row, or null. */
  function currentProfile() {
    return getClient().then(function (c) {
      if (!c) return null;
      return c.auth.getUser().then(function (u) {
        var user = u && u.data && u.data.user;
        if (!user) return null;
        return c.from('profiles').select('*').eq('id', user.id).maybeSingle()
          .then(function (r) {
            if (r.error) { fail('profile', r.error); return null; }
            return r.data ? Object.assign({}, r.data, { email: r.data.email || user.email }) : null;
          });
      });
    }).catch(function (e) { fail('currentProfile', e); return null; });
  }

  /** Supabase's messages are terse and sometimes leak internals; these do not. */
  function friendly(err) {
    var m = (err && err.message) || '';
    if (/already registered|already exists/i.test(m)) return 'An account with that email already exists.';
    if (/Invalid login credentials/i.test(m)) return 'That email and password do not match an account.';
    if (/Email not confirmed/i.test(m)) return 'Check your email for a confirmation link before signing in.';
    if (/Password should be at least/i.test(m)) return 'Password is too short.';
    if (/rate limit|too many/i.test(m)) return 'Too many attempts just now. Wait a minute and try again.';
    if (/valid email/i.test(m)) return 'Enter a valid email address.';
    if (/confirmation email|sending.*email|error sending/i.test(m)) {
      return 'Accounts cannot be created yet: this project still has email confirmation ' +
             'switched on and cannot send mail. An instructor needs to turn off ' +
             '"Confirm email" in Supabase \u2192 Authentication \u2192 Providers \u2192 Email.';
    }
    // A network failure must not read as a credential problem — otherwise someone
    // retypes a correct password repeatedly and hits the rate limit.
    if (/fetch|network|Failed to fetch|NetworkError/i.test(m)) {
      return 'Could not reach the server. Check the connection and try again.';
    }
    if (/signup.*disabled|not allowed/i.test(m)) {
      return 'Account creation is turned off for this project. Ask your instructor for an account.';
    }
    if (/weak.*password|pwned/i.test(m)) return 'That password is too easily guessed. Choose another.';
    if (/same.*password|different from the old/i.test(m)) {
      return 'That is already your password. Choose a different one.';
    }
    if (/session|expired|invalid.*token/i.test(m)) {
      return 'That link has expired. Request a new one.';
    }
    return m || 'Something went wrong.';
  }

  // ─── Data sync ──────────────────────────────────────────────────────────────
  // Mirrors server rows into the localStorage keys the existing stores already read,
  // so no screen had to change to become backend-aware.

  var EX_KEY = 'cta_exercises';
  var ATTEMPT_KEY = 'cta_exercise_attempts';
  var GROUP_KEY = 'cta_student_groups';
  var ROSTER_KEY = 'cta_student_roster';

  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function readLocal(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  /** Server row -> the shape ExerciseStore already expects. */
  function rowToExercise(row) {
    return {
      id: row.id,
      title: row.title,
      unitId: row.unit_id,
      instructions: row.instructions,
      setup: row.setup || {},
      weather: row.weather,
      goal: row.goal,
      assignment: (row.goal && row.goal.__assignment) || row.assignment || null,
      trends: (row.goal && row.goal.__trends) || null,
      assignedTo: (row.goal && row.goal.__assignedTo) || [],
      published: !!row.published,
      createdBy: row.created_by,
      createdAt: row.created_at
    };
  }

  /**
   * Pull everything this user is allowed to see. RLS decides that, so a student
   * gets their own assignments and attempts and an instructor gets the exercises
   * they authored plus every attempt against them — the same query either way.
   */
  function syncDown() {
    return getClient().then(function (c) {
      if (!c) return { ok: false, local: true };
      return c.auth.getSession().then(function (sess) {
        // No Supabase session means a demo/local account. Nothing to sync, and
        // querying anyway would fail as anon — reported as a permission error that
        // looks like a misconfigured database.
        if (!(sess && sess.data && sess.data.session)) {
          return { ok: false, noSession: true };
        }
        return syncDownAuthed(c);
      });
    }).catch(function (e) { fail('syncDown', e); return { ok: false }; });
  }

  function syncDownAuthed(c) {
    return Promise.resolve().then(function () {
      return Promise.all([
        c.from('exercises').select('*'),
        c.from('attempts').select('*'),
        c.from('groups').select('id,name,class_id'),
        c.from('group_members').select('group_id,student_id'),
        c.from('profiles').select('id,email,display_name,role'),
        c.from('review_flags').select('*')
      ]).then(function (res) {
        var exRes = res[0], atRes = res[1], grRes = res[2], gmRes = res[3], prRes = res[4];
        var rfRes = res[5];
        if (rfRes && !rfRes.error && (rfRes.data || []).length) {
          writeLocal('cta_review_flags', (rfRes.data || []).map(function (r) {
            return {
              id: r.id, unitId: r.unit_id, pointKey: r.point_key,
              pointLabel: r.point_label, pointAddr: r.point_addr,
              valueAtFlag: r.value_at_flag, statusAtFlag: r.status_at_flag,
              note: r.note, flaggedBy: r.flagged_by,
              createdAt: r.created_at, resolvedAt: r.resolved_at, resolvedBy: null
            };
          }));
        }
        if (exRes.error) { fail('exercises', exRes.error); return { ok: false }; }

        // Do NOT overwrite the local list when the server has nothing. On a fresh
        // project the exercises table is empty, and a blind write would erase the
        // seeded starter exercises — a student's first sign-in would show an empty
        // list. The server is authoritative only once it actually holds rows.
        var serverEx = (exRes.data || []).map(rowToExercise);
        if (serverEx.length) writeLocal(EX_KEY, serverEx);

        // Same reasoning for attempts and groups: an empty server response is
        // "nothing uploaded yet", not "the student has no work".
        if (!atRes.error && (atRes.data || []).length) {
          writeLocal(ATTEMPT_KEY, (atRes.data || []).map(function (a) {
            return {
              exerciseId: a.exercise_id,
              operator: a.student_id,
              startedAt: a.started_at,
              // completedAt is what statusFor and durationOf read; passed_at is the
              // column. Mapping only one of them made every synced attempt look unfinished.
              passedAt: a.passed_at,
              completedAt: a.passed_at,
              passed: !!a.passed_at,
              diagnosis: a.diagnosis || '',
              progress: a.progress || {},
              actions: a.actions || []
            };
          }));
        }

        if (!grRes.error && !gmRes.error && (grRes.data || []).length) {
          var members = {};
          (gmRes.data || []).forEach(function (m) {
            (members[m.group_id] = members[m.group_id] || []).push(m.student_id);
          });
          writeLocal(GROUP_KEY, (grRes.data || []).map(function (g) {
            return { id: g.id, name: g.name, seatIds: members[g.id] || [], classId: g.class_id };
          }));
        }

        if (!prRes.error) {
          // The roster is keyed by the identifier the rest of the app treats as the
          // operator, which for a real account is its user id.
          var roster = readLocal(ROSTER_KEY, {}) || {};
          (prRes.data || []).forEach(function (p) {
            var name = String(p.display_name || '').trim();
            var sp = name.indexOf(' ');
            roster[p.id] = {
              firstName: sp > 0 ? name.slice(0, sp) : name,
              lastName: sp > 0 ? name.slice(sp + 1) : '',
              email: p.email || '',
              // Kept so the assignment picker can leave instructors out.
              role: p.role || 'student'
            };
          });
          writeLocal(ROSTER_KEY, roster);
        }

        status.lastSync = new Date().toISOString();
        status.lastError = null;
        notify();
        return { ok: true };
      });
    }).catch(function (e) { fail('syncDown', e); return { ok: false }; });
  }

  /**
   * Push one exercise. assignedTo and the targeting ride inside goal, so the server
   * needs no extra column for a shape that is still settling — the assignments
   * table is the durable form and is written alongside.
   */
  /**
   * Write the assignment rows for an exercise, replacing whatever was there.
   *
   * These are what make an exercise visible to a student: the RLS policy on
   * exercises calls is_assigned_to_me(), which reads this table. An exercise with no
   * assignment row is readable only by its author.
   *
   * Rows are per student. Class- and group-scoped rows would be fewer, but they only
   * resolve if that class or group also exists on the server — and the flattened seat
   * list is the one thing all three targeting modes produce, so this works today
   * without a class-management screen.
   *
   * Seat ids from the local roster (student_a…) are not real user ids and are skipped;
   * a UUID means a genuine account.
   */
  function pushAssignments(c, ex) {
    var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var all = ex.assignedTo || [];
    var ids = all.filter(function (s) { return UUID.test(String(s)); });
    var skipped = all.filter(function (s) { return !UUID.test(String(s)); });
    if (skipped.length && window.console) {
      console.warn('[Supabase] not real accounts, skipped: ' + skipped.join(', ') +
        ' \u2014 these students will not see the exercise.');
    }
    // Clear first so un-assigning actually removes access rather than only adding.
    return c.from('assignments').delete().eq('exercise_id', ex.id).then(function () {
      if (!ids.length) return { ok: true };
      if (window.console) console.info('[Supabase] pushAssignments', { exercise: ex.id, students: ids });
      return c.from('assignments').insert(ids.map(function (sid) {
        return { exercise_id: ex.id, student_id: sid };
      })).then(function (r) {
        if (r.error) { fail('pushAssignments', r.error); return { ok: false }; }
        if (window.console) console.info('[Supabase] assignments inserted', ids.length);
        return { ok: true };
      });
    });
  }

  function pushExercise(ex) {
    return getClient().then(function (c) {
      if (!c) return { ok: false, local: true };
      return c.auth.getUser().then(function (u) {
        var uid = u && u.data && u.data.user && u.data.user.id;
        if (window.console) console.info('[Supabase] pushExercise', { id: ex.id, authUid: uid });
        if (!uid) {
          // created_by must be auth.uid() or the RLS policy on assignments refuses the
          // insert, which is the failure that leaves an exercise assigned to nobody.
          fail('pushExercise', new Error('no Supabase session \u2014 sign in again'));
          return { ok: false, error: 'Not signed in to the account server.' };
        }
        var goal = Object.assign({}, ex.goal, {
          __assignment: ex.assignment || null,
          __assignedTo: ex.assignedTo || [],
          // Rides in goal for the same reason assignment does: no column of its own yet,
          // and without this an authored trend is lost on the next sync.
          __trends: ex.trends || null
        });
        return c.from('exercises').upsert({
          id: ex.id,
          title: ex.title,
          unit_id: ex.unitId,
          instructions: ex.instructions || '',
          setup: ex.setup || {},
          weather: ex.weather || null,
          goal: goal,
          published: !!ex.published,
          created_by: uid
        }).then(function (r) {
          if (r.error) { fail('pushExercise', r.error); return { ok: false, error: r.error.message }; }
          if (window.console) console.info('[Supabase] exercise upserted', ex.id);
          // Assignment rows are what make the exercise VISIBLE to a student: the RLS
          // policy on exercises calls is_assigned_to_me(), which reads this table.
          // Without them a published exercise is readable only by its author, and
          // every student sees an empty list with no error to explain it.
          //
          // Written per student rather than per class, because that works whether or
          // not classes and groups exist on the server yet — the flattened seat list
          // is the one thing every targeting mode produces.
          return pushAssignments(c, ex).then(function () { return { ok: true }; });
        });
      });
    }).catch(function (e) { fail('pushExercise', e); return { ok: false, error: e.message }; });
  }

  function deleteExercise(id) {
    return getClient().then(function (c) {
      if (!c) return;
      return c.from('exercises').delete().eq('id', id).then(function (r) {
        if (r.error) fail('deleteExercise', r.error);
      });
    }).catch(function (e) { fail('deleteExercise', e); });
  }

  /** Attempts are per (exercise, student), so this upserts on that pair. */
  function pushAttempt(attempt) {
    return getClient().then(function (c) {
      if (!c) return { ok: false, local: true };
      return c.auth.getUser().then(function (u) {
        var uid = u && u.data && u.data.user && u.data.user.id;
        if (!uid) return { ok: false };
        return c.from('attempts').upsert({
          exercise_id: attempt.exerciseId,
          student_id: uid,
          started_at: attempt.startedAt || new Date().toISOString(),
          passed_at: attempt.passedAt || attempt.completedAt || null,
          actions: attempt.actions || [],
          // The written answer and the saved diagram state. Without these the server
          // holds only whether a student passed, so a diagnosis exercise — where the
          // reasoning IS the work — would sync as an empty pass or nothing at all.
          diagnosis: attempt.diagnosis || null,
          progress: attempt.progress || {}
        }, { onConflict: 'exercise_id,student_id' }).then(function (r) {
          if (r.error) { fail('pushAttempt', r.error); return { ok: false }; }
          return { ok: true };
        });
      });
    }).catch(function (e) { fail('pushAttempt', e); return { ok: false }; });
  }

  /** Flagged points, so a review raised on one machine is visible on another. */
  function pushReviewFlag(flag) {
    return getClient().then(function (c) {
      if (!c) return { ok: false, local: true };
      return c.auth.getUser().then(function (u) {
        var uid = u && u.data && u.data.user && u.data.user.id;
        if (!uid) return { ok: false };
        return c.from('review_flags').upsert({
          id: flag.id,
          unit_id: flag.unitId || '',
          point_key: flag.pointKey || '',
          point_label: flag.pointLabel || '',
          point_addr: flag.pointAddr || '',
          value_at_flag: String(flag.valueAtFlag || ''),
          status_at_flag: flag.statusAtFlag || '',
          note: flag.note || '',
          flagged_by: uid,
          created_at: flag.createdAt,
          resolved_at: flag.resolvedAt || null
        }).then(function (r) {
          if (r.error) { fail('pushReviewFlag', r.error); return { ok: false }; }
          return { ok: true };
        });
      });
    }).catch(function (e) { fail('pushReviewFlag', e); return { ok: false }; });
  }

  function deleteReviewFlag(id) {
    return getClient().then(function (c) {
      if (!c) return;
      return c.from('review_flags').delete().eq('id', id).then(function (r) {
        if (r.error) fail('deleteReviewFlag', r.error);
      });
    }).catch(function (e) { fail('deleteReviewFlag', e); });
  }

  window.SupabaseBackend = {
    pushReviewFlag: pushReviewFlag,
    deleteReviewFlag: deleteReviewFlag,
    isConfigured: isConfigured,
    getStatus: getStatus,
    subscribe: subscribe,
    getClient: getClient,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    resetPassword: resetPassword,
    updatePassword: updatePassword,
    currentProfile: currentProfile,
    syncDown: syncDown,
    pushExercise: pushExercise,
    deleteExercise: deleteExercise,
    pushAttempt: pushAttempt
  };
})();
