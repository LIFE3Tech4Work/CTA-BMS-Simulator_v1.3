/**
 * config.js — LOCAL DEVELOPMENT ONLY, and not committed.
 *
 * .gitignore excludes this file. On Railway it does not exist at all: server.js
 * generates /config.js on the fly from environment variables, which is why the
 * credentials never enter the repository.
 *
 * This copy exists so the app runs in a plain static preview (no Node server) and
 * so the shape of the object is visible. Empty strings mean "no backend", which the
 * app treats as a valid state: accounts and exercises fall back to local storage and
 * the sign-on screen says so plainly.
 *
 * To point a local copy at Supabase, fill these in:
 *   supabaseUrl:            https://<project>.supabase.co   (Settings → Data API)
 *   supabasePublishableKey: sb_publishable_...               (Settings → API Keys)
 *
 * The publishable key is safe in a browser — it is sent to every visitor, and Row
 * Level Security in docs/supabase-schema.sql is what protects the data. The SECRET
 * key bypasses RLS entirely and must never appear here.
 */
window.CTA_CONFIG = {
  supabaseUrl: '',
  supabasePublishableKey: '',
};
