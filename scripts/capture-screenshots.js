/**
 * Puppeteer Screenshot Capture for CTA BMS Simulator
 * 
 * Captures all screenshots needed for the Navigation Manual v1.1
 * Cross-references every figure and phase from the manual.
 * 
 * Run: node scripts/capture-screenshots.js
 * Requires: local server running on http://localhost:3000
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BMS_URL || 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login(page, username, password) {
  await page.goto(`${BASE_URL}/#/auth`, { waitUntil: 'networkidle0' });
  await delay(2000); // Wait for Babel to compile and React to mount

  // Type credentials
  const inputs = await page.$$('input');
  if (inputs.length >= 2) {
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type(username);
    await inputs[1].click({ clickCount: 3 });
    await inputs[1].type(password);
  }

  // Submit
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await btn.evaluate(el => el.textContent);
    if (text.includes('Sign On') || text.includes('Log In') || text.includes('Sign In')) {
      await btn.click();
      break;
    }
  }

  await delay(3000); // Wait for navigation + simulation init
}

async function setSimSpeed(page, speed) {
  // Use the Action menu to set speed
  await page.evaluate((spd) => {
    if (window.SimulationEngine) {
      if (spd === 'pause') window.SimulationEngine.pause();
      else if (spd === '60x') window.SimulationEngine.setSpeed('60x');
      else if (spd === '3600x') window.SimulationEngine.setSpeed('3600x');
      else if (spd === '1x') window.SimulationEngine.setSpeed('1x');
      else window.SimulationEngine.start();
    }
  }, speed);
  await delay(500);
}

async function overridePoint(page, address, value) {
  await page.evaluate((addr, val) => {
    if (window.PointRegistry) {
      const point = window.PointRegistry.points.get(addr);
      if (point) {
        point.currentValue = val;
        point.mode = 'Manual';
        // Notify subscribers
        const subs = window.PointRegistry._subscribers || new Map();
        const callbacks = subs.get(addr);
        if (callbacks) {
          callbacks.forEach(cb => cb(point));
        }
      }
    }
  }, address, value);
  await delay(500);
}

async function captureScreenshot(page, filename, description) {
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  ✓ ${filename} — ${description}`);
  return { filename, description };
}

async function main() {
  console.log('\n🎬 CTA BMS Simulator — Screenshot Capture v1.1\n');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Output: ${SCREENSHOT_DIR}\n`);

  const browser = await puppeteer.launch({
    // 1. Add this new line to point to your Mac's Chrome application
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    
    // 2. Keep your existing settings exactly as they were
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: VIEWPORT
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    screenshots: []
  };

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 0: AUTH SCREEN
    // ═══════════════════════════════════════════════════════════════════
    console.log('Phase 0 — Auth Screen');
    await page.goto(`${BASE_URL}/#/auth`, { waitUntil: 'networkidle0' });
    await delay(3000);
    manifest.screenshots.push(await captureScreenshot(page, '00-auth-screen.png', 'Sign On screen with demo credentials visible'));

    // ═══════════════════════════════════════════════════════════════════
    // INSTRUCTOR SESSION
    // ═══════════════════════════════════════════════════════════════════
    console.log('\nInstructor Session (cta_instructor)');
    await login(page, 'cta_instructor', 'bms2026');

    // Initialize simulation
    await setSimSpeed(page, '60x');
    await delay(3000); // Let simulation advance a few rows
    await setSimSpeed(page, 'pause');
    await delay(1000);

    // --- SymmetrE Station: AHU-4-4 ---
    console.log('  SymmetrE Station');
    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-4`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-symmetre-ahu44.png', 'SymmetrE Station AHU-4-4 with zone label, OA Strip, Controls Sidebar, LL97 Panel'));

    // --- SymmetrE Station: AHU-4-6 ---
    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-6`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-symmetre-ahu46.png', 'SymmetrE Station AHU-4-6 with Meeting Rooms zone label'));

    // --- OA Strip close-up (crop from AHU-4-4) ---
    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-4`, { waitUntil: 'networkidle0' });
    await delay(2000);

    // --- Manual Override Demo ---
    console.log('  Manual Override Demo');
    await overridePoint(page, 'AO101@DEV4004', 50.0);
    await delay(1000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-symmetre-override.png', 'SymmetrE Station with fan speed manually overridden to 50%'));

    // --- EBI Point Detail: General Tab (overridden point) ---
    console.log('  EBI Point Detail');
    await page.goto(`${BASE_URL}/#/ebi/AO101@DEV4004/general`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-ebi-general.png', 'EBI General Tab showing point metadata, left sidebar with Manual mode (purple)'));

    // --- EBI: History Tab ---
    await page.goto(`${BASE_URL}/#/ebi/AI301@DEV4004/history`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-ebi-history.png', 'EBI History Tab with cyan trend chart on black background'));

    // --- EBI: Alarms Tab ---
    await page.goto(`${BASE_URL}/#/ebi/AO103@DEV4004/alarms`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-ebi-alarms.png', 'EBI Alarms Tab showing alarm configuration for Preheat Coil'));

    // --- EBI: Recent Events Tab (with manual override seeded) ---
    await page.goto(`${BASE_URL}/#/ebi/AO101@DEV4004/recent-events`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-ebi-recent-events.png', 'EBI Recent Events Tab showing Mode Transition: Auto → Manual'));

    // --- Alarm Summary ---
    console.log('  Alarm Summary');
    await page.goto(`${BASE_URL}/#/alarms`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-alarms.png', 'Alarm Summary with 6 pre-loaded faults, flashing icons for unacknowledged'));

    // --- Alarm Summary: After acknowledging one ---
    // Right-click first alarm row and acknowledge
    await page.evaluate(() => {
      // Find and acknowledge the first active unacknowledged alarm
      if (window.FaultEngine && window.FaultEngine.acknowledge) {
        window.FaultEngine.acknowledge('F-02', 'cta_instructor');
      }
    });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-alarms-acknowledged.png', 'Alarm Summary after acknowledging F-02 — icon changes from flashing to solid'));

    // --- Schedule Manager ---
    console.log('  Schedule Manager');
    await page.goto(`${BASE_URL}/#/schedule`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-schedule.png', 'Schedule Manager with AHU-4-4 normal schedule'));

    // --- Schedule Manager: AHU-9-2 fault ---
    await page.evaluate(() => {
      // Click AHU-9-2 in the tree if available
      const items = document.querySelectorAll('[class*="cursor-pointer"]');
      for (const item of items) {
        if (item.textContent.includes('AHU-9-2')) {
          item.click();
          break;
        }
      }
    });
    await delay(1000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-schedule-fault.png', 'Schedule Manager showing AHU-9-2 24/7 fault schedule (red rows)'));

    // --- Point Attribute Report ---
    console.log('  Point Attribute Report');
    await page.goto(`${BASE_URL}/#/reports`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-reports.png', 'Point Attribute Report showing points in Manual Override'));

    // --- Instructor Dashboard ---
    console.log('  Instructor Dashboard');
    await page.goto(`${BASE_URL}/#/instructor`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-instructor-dashboard.png', 'Instructor Dashboard with Unlock Capstone button'));

    // --- Companion Mode ---
    console.log('  Modes');
    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-4`, { waitUntil: 'networkidle0' });
    await delay(1000);
    await page.evaluate(() => {
      if (window.setModeState) window.setModeState({ currentMode: 'companion' });
    });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-companion-mode.png', 'Companion Mode — 70/30 split with slide panel on right'));

    // --- Explore Mode ---
    await page.evaluate(() => {
      if (window.setModeState) window.setModeState({ currentMode: 'freeExplore' });
    });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-explore-mode.png', 'Free Explore Mode — full width with scenario cards'));

    // --- Capstone Mode ---
    await page.evaluate(() => {
      if (window.setModeState) window.setModeState({ currentMode: 'capstone' });
    });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-capstone-mode.png', 'Capstone Mode — 65/35 split with worksheet panel'));

    // --- Simultaneous Heat/Cool scenario ---
    console.log('  Scenario 3: Simultaneous Heat + Cool');
    await page.evaluate(() => {
      if (window.setModeState) window.setModeState({ currentMode: 'freeExplore' });
    });
    await delay(500);
    await page.evaluate(() => {
      // Load scenario 3
      if (window.ScenarioManager && window.ScenarioManager.loadScenario) {
        window.ScenarioManager.loadScenario(3);
      } else if (window.SimulationEngine) {
        window.SimulationEngine.jumpToRow(300);
      }
    });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'instructor-scenario3-simheatcool.png', 'Scenario 3 — Simultaneous Heating and Cooling amber overlay'));

    // ═══════════════════════════════════════════════════════════════════
    // STUDENT SESSION
    // ═══════════════════════════════════════════════════════════════════
    console.log('\nStudent Session (cta_student)');

    // Sign off instructor
    await page.goto(`${BASE_URL}/#/auth`, { waitUntil: 'networkidle0' });
    await delay(1000);
    await page.evaluate(() => {
      if (window.setAuthState && window.AuthHelpers) {
        window.setAuthState(window.AuthHelpers.createUnauthenticatedState());
      }
    });
    await delay(1000);

    // Login as student
    await login(page, 'cta_student', 'bms2026');
    await setSimSpeed(page, '60x');
    await delay(3000);
    await setSimSpeed(page, 'pause');

    // --- Student SymmetrE Station ---
    console.log('  SymmetrE Station');
    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-4`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-symmetre-ahu44.png', 'Student view: SymmetrE Station AHU-4-4'));

    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-6`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-symmetre-ahu46.png', 'Student view: SymmetrE Station AHU-4-6'));

    // --- Student EBI ---
    console.log('  EBI Point Detail');
    await page.goto(`${BASE_URL}/#/ebi/AI301@DEV4004/general`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-ebi-general.png', 'Student view: EBI General Tab — Supply Air Temp'));

    await page.goto(`${BASE_URL}/#/ebi/AI301@DEV4004/history`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-ebi-history.png', 'Student view: EBI History Tab with trend chart'));

    await page.goto(`${BASE_URL}/#/ebi/AI301@DEV4004/recent-events`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-ebi-recent-events.png', 'Student view: EBI Recent Events Tab'));

    // --- Student Alarms ---
    console.log('  Alarm Summary');
    await page.goto(`${BASE_URL}/#/alarms`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-alarms.png', 'Student view: Alarm Summary'));

    // --- Student Schedule ---
    console.log('  Schedule Manager');
    await page.goto(`${BASE_URL}/#/schedule`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-schedule.png', 'Student view: Schedule Manager (read-only)'));

    // --- Student Reports ---
    console.log('  Reports');
    await page.goto(`${BASE_URL}/#/reports`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-reports.png', 'Student view: Point Attribute Report'));

    // --- Student Modes ---
    console.log('  Modes');
    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-4`, { waitUntil: 'networkidle0' });
    await delay(1000);
    await page.evaluate(() => {
      if (window.setModeState) window.setModeState({ currentMode: 'companion' });
    });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-companion-mode.png', 'Student view: Companion Mode'));

    await page.evaluate(() => {
      if (window.setModeState) window.setModeState({ currentMode: 'freeExplore' });
    });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-explore-mode.png', 'Student view: Free Explore Mode'));

    await page.evaluate(() => {
      if (window.setModeState) window.setModeState({ currentMode: 'capstone' });
    });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'student-capstone-mode.png', 'Student view: Capstone Mode'));

    // ═══════════════════════════════════════════════════════════════════
    // NEW SCREENSHOTS (Manual v1.1 additions)
    // ═══════════════════════════════════════════════════════════════════
    console.log('\nNew Screenshots for Manual v1.1');

    // Re-login as instructor for remaining shots
    await page.goto(`${BASE_URL}/#/auth`, { waitUntil: 'networkidle0' });
    await delay(1000);
    await page.evaluate(() => {
      if (window.setAuthState && window.AuthHelpers) {
        window.setAuthState(window.AuthHelpers.createUnauthenticatedState());
      }
    });
    await delay(1000);
    await login(page, 'cta_instructor', 'bms2026');
    await setSimSpeed(page, '60x');
    await delay(2000);
    await setSimSpeed(page, 'pause');

    // --- Zone label close-up AHU-4-4 ---
    console.log('  Zone labels');
    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-4`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'v11-zone-label-ahu44.png', 'AHU-4-4 zone label: Serves Hotel Guest Rooms — Floors 4–12'));

    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-6`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'v11-zone-label-ahu46.png', 'AHU-4-6 zone label: Serves Meeting Rooms & Conference — Level 4'));

    // --- EBI with left sidebar visible (Manual override) ---
    console.log('  EBI left sidebar with override');
    await overridePoint(page, 'AO101@DEV4004', 50.0);
    await delay(500);
    await page.goto(`${BASE_URL}/#/ebi/AO101@DEV4004/general`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'v11-ebi-sidebar-manual.png', 'EBI left sidebar showing Manual mode (purple), Ovrd dot filled, 50.0%'));

    // --- EBI Recent Events with seeded mode transition ---
    await page.goto(`${BASE_URL}/#/ebi/AO101@DEV4004/recent-events`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'v11-ebi-recent-events-seeded.png', 'Recent Events showing seeded Mode Transition: Auto → Manual'));

    // --- Alarm Source click navigation ---
    console.log('  Alarm source navigation');
    await page.goto(`${BASE_URL}/#/alarms`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'v11-alarm-source-links.png', 'Alarm Summary with clickable Source addresses (blue links)'));

    // --- Menu bar (showing Station, View, Action, Help, Sign Off) ---
    console.log('  Menu bar');
    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-4`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'v11-menu-bar.png', 'Menu bar showing: Station, View, Action, Help, Sign Off (Edit/Configure removed)'));

    // --- LL97 Panel after running at 3600x ---
    console.log('  LL97 Panel accumulation');
    await setSimSpeed(page, '3600x');
    await delay(5000); // Let it accumulate for 5 seconds (~5 sim hours)
    await setSimSpeed(page, 'pause');
    await delay(1000);
    manifest.screenshots.push(await captureScreenshot(page, 'v11-ll97-accumulating.png', 'LL97 Panel after 3600x speed — energy/emissions accumulated'));

    // --- 4-tab EBI (no Command Priorities or Advanced) ---
    console.log('  4-tab EBI');
    await page.goto(`${BASE_URL}/#/ebi/AI401@DEV4004/general`, { waitUntil: 'networkidle0' });
    await delay(2000);
    manifest.screenshots.push(await captureScreenshot(page, 'v11-ebi-4tabs.png', 'EBI Point Detail showing 4 tabs only (General, Alarms, History, Recent Events)'));

    // --- Point type badge on hover ---
    console.log('  Point type badges');
    await page.goto(`${BASE_URL}/#/symmetre/AHU-4-4`, { waitUntil: 'networkidle0' });
    await delay(2000);
    // Hover over a point to show badge
    const pointValues = await page.$$('[class*="cursor-pointer"][title*="Click to view"]');
    if (pointValues.length > 0) {
      await pointValues[0].hover();
      await delay(500);
    }
    manifest.screenshots.push(await captureScreenshot(page, 'v11-point-badge-hover.png', 'AHU graphic showing point type badge (AI/AO/BI) on hover'));

    // ═══════════════════════════════════════════════════════════════════
    // DONE
    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n✅ Done! ${manifest.screenshots.length} screenshots captured.`);
    console.log(`   Output: ${SCREENSHOT_DIR}/\n`);

    // Write manifest
    const manifestPath = path.join(SCREENSHOT_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`   Manifest: ${manifestPath}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

main();
