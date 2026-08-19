/**
 * config.example.js — template for local development.
 *
 * Copy to src/config.js and fill in your own values, OR (preferred) don't create
 * that file at all: server.js generates /config.js at runtime from environment
 * variables, so a deployed instance never needs a config file on disk.
 *
 *   SUPABASE_URL=https://xxxxxxxx.supabase.co
 *   SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
 *
 * A NOTE ON WHAT IS AND IS NOT SECRET
 * ───────────────────────────────────
 * The publishable key CANNOT be hidden from users. It is sent to every browser
 * that loads the app, so anyone can read it in devtools — that is true of any
 * client-side database connection, not a shortcoming of this setup. Supabase
 * designs it that way on purpose.
 *
 * What actually protects the data is Row Level Security: the policies in
 * docs/supabase-schema.sql decide what this key is ALLOWED to do. A student
 * holding it can read their own assignments and nothing else.
 *
 * Keeping it out of the repo (which this arrangement does) is still worth doing —
 * it means rotating a key does not require a commit, and a public repo does not
 * hand over your project URL and key together in one place.
 *
 * The SECRET key (sb_secret_...) is a different matter entirely: it bypasses RLS
 * completely. It must never appear in this file, in src/, or anywhere the browser
 * can reach. Nothing in this app needs it.
 */
window.CTA_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabasePublishableKey: 'sb_publishable_YOUR_KEY_HERE',
};
