/**
 * config.js — Supabase connection for LOCAL DEVELOPMENT and the design preview.
 *
 * NOT COMMITTED: .gitignore excludes this file. On Railway it does not exist at all —
 * server.js generates /config.js on the fly from SUPABASE_URL and
 * SUPABASE_PUBLISHABLE_KEY, which is why the credentials never enter the repository.
 *
 * Filled in here so the app actually talks to Supabase when opened directly, rather
 * than silently falling back to browser-only accounts. With these empty, sign-up
 * stores locally and the sign-on screen says so — accurate, but it meant the real
 * flow could not be seen or tested outside a deployment.
 *
 * The publishable key is safe in a browser: it ships to every visitor by design, and
 * Row Level Security in docs/supabase-schema.sql is what protects the data. The
 * SECRET key bypasses RLS entirely and must never appear here.
 */
window.CTA_CONFIG = {
  supabaseUrl: 'https://ffyziyufdzeiqytlyldr.supabase.co',
  supabasePublishableKey: 'sb_publishable_vRNoc442mZBTCJ2z19dw9Q_0Hr7TIr0',
};
