/**
 * Automated Screenshot Script for CTA BMS Simulator
 * 
 * Uses Puppeteer to:
 * 1. Log in as both Student and Instructor
 * 2. Navigate to every screen/route
 * 3. Capture full-page screenshots
 * 4. Output to screenshots/ directory
 * 
 * Usage:
 *   npm run screenshots
 * 
 * Prerequisites:
 *   - npm install (installs puppeteer)
 *   - App running locally (npm start) or provide BASE_URL env var
 * 
 * Environment variables:
 *   BASE_URL — URL of the running app (default: http://localhost:3000)
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '..', 'screenshots');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Credentials
const ACCOUNTS = [
  { name: 'student', operator: 'cta_student', password: 'bms2026' },
  { name: 'instructor', operator: 'cta_instructor', password: 'bms2026' },
];

// Routes to capture for each role
const ROUTES = [
  { name: 'auth-screen', hash: '#/auth', waitFor: 2000, description: 'Sign On Screen' },
  { name: 'symmetre-ahu44', hash: '#/symmetre/AHU-4-4', waitFor: 3000, description: 'SymmetrE Station — AHU-4-4' },
  { name: 'symmetre-ahu46', hash: '#/symmetre/AHU-4-6', waitFor: 2000, description: 'SymmetrE Station — AHU-4-6' },
  { name: 'alarms', hash: '#/alarms', waitFor: 2000, description: 'Alarm Summary' },
  { name: 'schedule', hash: '#/schedule', waitFor: 2000, description: 'Schedule Manager' },
  { name: 'reports', hash: '#/reports', waitFor: 2000, description: 'Point Attribute Report' },
  { name: 'instructor-dashboard', hash: '#/instructor', waitFor: 2000, description: 'Instructor Dashboard' },
];

// Mode-specific screenshots (only on SymmetrE)
const MODES = [
  { name: 'companion-mode', mode: 'companion', waitFor: 2000, description: 'Companion Mode (30% panel)' },
  { name: 'explore-mode', mode: 'freeExplore', waitFor: 2000, description: 'Free Explore Mode (100%)' },
  { name: 'capstone-mode', mode: 'capstone', waitFor: 2000, description: 'Capstone Mode (35% worksheet)' },
];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login(page, operator, password) {
  // Navigate to auth screen
  await page.goto(`${BASE_URL}/#/auth`, { waitUntil: 'networkidle0', timeout: 30000 });
  await delay(2000);

  // Fill in credentials
  const operatorInput = await page.$('input[id="signon-operator"]');
  const passwordInput = await page.$('input[id="signon-password"]');

  if (!operatorInput || !passwordInput) {
    // Fallback: find by placeholder
    const inputs = await page.$$('input');
    if (inputs.length >= 2) {
      await inputs[0].type(operator);
      await inputs[1].type(password);
    }
  } else {
    await operatorInput.type(operator);
    await passwordInput.type(password);
  }

  // Submit
  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
  }

  // Wait for navigation to SymmetrE
  await delay(2000);
}

async function setMode(page, mode) {
  // Use the ModeController via page.evaluate
  await page.evaluate((m) => {
    if (window.ModeController && window.ModeController.setMode) {
      window.ModeController.setMode(m);
    }
  }, mode);
  await delay(1500);
}

async function captureScreenshot(page, filename, description) {
  const filepath = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  ✓ ${description} → ${filename}`);
}

async function run() {
  console.log('🚀 CTA BMS Simulator — Screenshot Capture');
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Output: ${OUTPUT_DIR}/`);
  console.log('');

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1440, height: 900 },
  });

  for (const account of ACCOUNTS) {
    console.log(`\n📸 Capturing as: ${account.name} (${account.operator})`);
    console.log('─'.repeat(50));

    const page = await browser.newPage();

    // Capture auth screen BEFORE login
    if (account === ACCOUNTS[0]) {
      await page.goto(`${BASE_URL}/#/auth`, { waitUntil: 'networkidle0', timeout: 30000 });
      await delay(2000);
      await captureScreenshot(page, '00-auth-screen.png', 'Sign On Screen');
    }

    // Login
    await login(page, account.operator, account.password);

    // Capture each route
    for (const route of ROUTES) {
      // Skip instructor dashboard for student role
      if (route.name === 'instructor-dashboard' && account.name === 'student') continue;
      // Skip auth screen (already captured)
      if (route.name === 'auth-screen') continue;

      await page.goto(`${BASE_URL}/${route.hash}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await delay(route.waitFor);

      const filename = `${account.name}-${route.name}.png`;
      await captureScreenshot(page, filename, route.description);
    }

    // Mode-specific screenshots (on SymmetrE screen)
    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-4`, { waitUntil: 'networkidle0', timeout: 30000 });
    await delay(2000);

    for (const modeConfig of MODES) {
      await setMode(page, modeConfig.mode);
      await delay(modeConfig.waitFor);

      const filename = `${account.name}-${modeConfig.name}.png`;
      await captureScreenshot(page, filename, modeConfig.description);
    }

    // Extra: capture EBI Point Detail (click a point address)
    await page.goto(`${BASE_URL}/#/ebi/AI301@DEV4004/general`, { waitUntil: 'networkidle0', timeout: 30000 });
    await delay(2000);
    await captureScreenshot(page, `${account.name}-ebi-general.png`, 'EBI Point Detail — General Tab');

    await page.goto(`${BASE_URL}/#/ebi/AI301@DEV4004/history`, { waitUntil: 'networkidle0', timeout: 30000 });
    await delay(2000);
    await captureScreenshot(page, `${account.name}-ebi-history.png`, 'EBI Point Detail — History Tab');

    await page.goto(`${BASE_URL}/#/ebi/AI301@DEV4004/recent-events`, { waitUntil: 'networkidle0', timeout: 30000 });
    await delay(2000);
    await captureScreenshot(page, `${account.name}-ebi-recent-events.png`, 'EBI Point Detail — Recent Events Tab');

    await page.close();
  }

  await browser.close();

  // Generate manifest
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png')).sort();
  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewport: '1440x900',
    screenshots: files.map(f => ({
      filename: f,
      role: f.startsWith('student-') ? 'student' : f.startsWith('instructor-') ? 'instructor' : 'shared',
    })),
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`\n✅ Done! ${files.length} screenshots saved to screenshots/`);
  console.log('   Manifest: screenshots/manifest.json');
}

run().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
