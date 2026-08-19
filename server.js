/**
 * Static file server for CTA BMS Simulator
 * Serves the src/ directory on the configured port.
 * Designed for Railway deployment (reads PORT from env).
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Runtime configuration ───────────────────────────────────────────────────
// Supabase credentials are served from environment variables rather than a file
// in src/, so they never enter the repository. Set these in Railway (Variables
// tab) or a local .env:
//
//   SUPABASE_URL=https://xxxxxxxx.supabase.co
//   SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
//
// The publishable key is sent to the browser by design and cannot be hidden from
// users — Row Level Security is what limits what it can do. Keeping it out of the
// repo still matters: rotating it needs no commit, and a public repo does not
// hand over the URL and key together. The SECRET key is never used here.
//
// A committed src/config.js would take precedence via express.static below, which
// is why .gitignore excludes it — it exists only as a local-dev convenience.
app.get('/config.js', (req, res) => {
  const local = path.join(__dirname, 'src', 'config.js');
  if (fs.existsSync(local)) return res.sendFile(local);
  const cfg = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  };
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  // Absent credentials are reported rather than failing silently later, when the
  // symptom would be an empty exercise list with no explanation.
  res.send(
    'window.CTA_CONFIG = ' + JSON.stringify(cfg) + ';\n' +
    (cfg.supabaseUrl && cfg.supabasePublishableKey
      ? ''
      : 'console.warn("[CTA] Supabase is not configured — set SUPABASE_URL and ' +
        'SUPABASE_PUBLISHABLE_KEY. Running on local storage only.");\n')
  );
});

// Serve all static files from src/
app.use(express.static(path.join(__dirname, 'src'), {
  extensions: ['html', 'js', 'jsx', 'css'],
  setHeaders(res, filePath) {
    // Set correct MIME types for JS modules
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    if (filePath.endsWith('.jsx')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    // Disable caching for development
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// SPA fallback: serve index.html for any unmatched route
// (supports hash-based routing — all routes resolve to index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CTA BMS Simulator running on port ${PORT}`);
  console.log(`Open: http://localhost:${PORT}`);
});
