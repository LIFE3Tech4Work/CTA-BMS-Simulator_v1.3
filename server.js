/**
 * Static file server for CTA BMS Simulator
 * Serves the src/ directory on the configured port.
 * Designed for Railway deployment (reads PORT from env).
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
