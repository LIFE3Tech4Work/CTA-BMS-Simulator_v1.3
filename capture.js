/**
 * BMS Simulator — Comprehensive Screenshot Capture
 * Captures every screen, tab, and fault state in the app.
 *
 * Usage (on your Mac):
 *   npm install puppeteer-core
 *   node capture.js
 *
 * Output: ./screenshots/  (PNG per screen + manifest.json)
 */

const puppeteer = require('./node_modules/puppeteer-core');
const path = require('path');
const fs   = require('fs');

const BASE_URL = 'https://web-production-04f1b.up.railway.app';
const OUT_DIR  = path.join(__dirname, 'screenshots');
const VIEWPORT = { width: 1440, height: 900 };

function getChromePath() {
  if (process.platform === 'darwin')
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'win32')
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  return '/opt/google/chrome/chrome';
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Login helper ─────────────────────────────────────────────────────────────
async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);
  const pw = await page.$('input[type="password"]');
  if (!pw) return;
  const users = await page.$$('input[type="text"], input[name*="user" i]');
  if (users[0]) { await users[0].click({ clickCount: 3 }); await users[0].type('cta_instructor', { delay: 40 }); }
  await pw.click({ clickCount: 3 });
  await pw.type('bms2026', { delay: 40 });
  const btn = await page.$('button[type="submit"], button');
  if (btn) { await btn.click(); await sleep(3000); }
}

// ─── Navigate + screenshot helper ─────────────────────────────────────────────
async function shot(browser, { name, hash, settle = 3000, preShot, clip, section, caption }) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await login(page);
  const url = BASE_URL + '/' + (hash || '');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(settle);
  if (preShot) await preShot(page);
  const opts = { path: path.join(OUT_DIR, name + '.png') };
  if (clip) opts.clip = clip;
  await page.screenshot(opts);
  await page.close();
  process.stdout.write(`  ✓ ${name}.png\n`);
  return { file: name + '.png', section, caption };
}

// ─── Screen list ──────────────────────────────────────────────────────────────
// Sections map to manual chapters; captions become figure labels.
const SCREENS = [

  // ════════════════════════════════════════════════════════════════════════════
  // 00 — SIGN-ON
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '00_signin',
    hash: '',
    section: 'sign-on',
    caption: 'Sign-on screen. Use cta_instructor / bms2026 for classroom facilitation.',
    settle: 2000,
    preShot: async (page) => {
      // Clear any existing session so the login form appears
      await page.evaluate(() => {
        try { localStorage.clear(); sessionStorage.clear(); } catch(e) {}
        if (window.setAuthState) window.setAuthState({ authenticated: false, operator: '', securityLevel: 'ViewOnly' });
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 01 — AHU-4-4  (Pre-Function / Ballroom Level 2)
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '01a_AHU44_normal',
    hash: '#/symmetre/AHU-4-4',
    section: 'ahu44',
    caption: 'AHU-4-4 — healthy baseline state. Read the OA Strip and Controls Sidebar before any diagnosis.',
  },
  {
    name: '01b_AHU44_OA_strip',
    hash: '#/symmetre/AHU-4-4',
    section: 'ahu44',
    caption: 'OA Strip close-up — OAT, RH, dewpoint, wetbulb, enthalpy. Read this first on every screen load.',
    clip: { x: 0, y: 0, width: 1440, height: 90 },
  },
  {
    name: '01c_AHU44_controls_sidebar',
    hash: '#/symmetre/AHU-4-4',
    section: 'ahu44',
    caption: 'AHU-4-4 Controls Sidebar — editable setpoints (white boxes) vs calculated read-only outputs.',
  },
  {
    name: '01d_AHU44_manual_override',
    hash: '#/symmetre/AHU-4-4',
    section: 'ahu44',
    caption: 'AHU-4-4 with M badge (manual override) on OA damper forced to 0%. First red flag to investigate.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) window.AHU44NewController.setValue('oaDamperPosition', 0);
      });
      await sleep(1500);
    },
  },
  {
    name: '01e_AHU44_fault_N01_SAT',
    hash: '#/symmetre/AHU-4-4',
    section: 'ahu44',
    caption: 'N-01 fault — supply air temperature outside 52–58°F design band. CHW valve and setpoint mismatch.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) {
          window.AHU44NewController.setValue('coolingCoilSetpoint', 72);
          window.AHU44NewController.setValue('fanSpeedSetpoint', 30);
        }
      });
      await sleep(2000);
    },
  },
  {
    name: '01f_AHU44_fault_N02_CO2',
    hash: '#/symmetre/AHU-4-4',
    section: 'ahu44',
    caption: 'N-02 fault — CO₂ exceeds 1,100 ppm (ASHRAE 62.1 upper threshold). Ventilation shortfall.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) window.AHU44NewController.setValue('co2Sensor', 1250);
      });
      await sleep(1500);
    },
  },
  {
    name: '01g_AHU44_fault_N04_damper',
    hash: '#/symmetre/AHU-4-4',
    section: 'ahu44',
    caption: 'N-04 fault — OA damper below 20% minimum while fan is running. Ventilation and IAQ concern.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) window.AHU44NewController.setValue('oaDamperPosition', 5);
      });
      await sleep(1500);
    },
  },
  {
    name: '01h_AHU44_schedule_off',
    hash: '#/symmetre/AHU-4-4',
    section: 'ahu44',
    caption: 'AHU-4-4 with Run Schedule set to Off — unit stops, all outputs go to idle state.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) window.AHU44NewController.setValue('runSchedule', false);
      });
      await sleep(1500);
    },
  },
  {
    name: '01i_AHU44_fire_alarm',
    hash: '#/symmetre/AHU-4-4',
    section: 'ahu44',
    caption: 'AHU-4-4 with fire alarm Shutdown active — unit forced off regardless of schedule.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) window.AHU44NewController.setValue('fireAlarmShutdown', true);
      });
      await sleep(1500);
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 02 — AHU-4-6  (Meeting Room 2nd Level)
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '02a_AHU46_normal',
    hash: '#/symmetre/AHU-4-6',
    section: 'ahu46',
    caption: 'AHU-4-6 — Meeting Room 2nd Level. Real Honeywell SymmetrE screenshot with live overlay.',
  },
  {
    name: '02b_AHU46_controls_sidebar',
    hash: '#/symmetre/AHU-4-6',
    section: 'ahu46',
    caption: 'AHU-4-6 Controls Sidebar — key difference: minimum OA damper position defaults to 60% for meeting rooms.',
  },
  {
    name: '02c_AHU46_fault_M02_CO2',
    hash: '#/symmetre/AHU-4-6',
    section: 'ahu46',
    caption: 'M-02 fault — CO₂ > 1,100 ppm on AHU-4-6. Meeting rooms fill fast with occupants.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU46Controller) window.AHU46Controller.setValue('co2Sensor', 1300);
      });
      await sleep(1500);
    },
  },
  {
    name: '02d_AHU46_fault_M04_damper',
    hash: '#/symmetre/AHU-4-6',
    section: 'ahu46',
    caption: 'M-04 fault — OA damper below 60% minimum (meeting room ASHRAE 62.1 requirement).',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU46Controller) window.AHU46Controller.setValue('oaDamperPosition', 20);
      });
      await sleep(1500);
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 03 — AHU-23-1  (Boiler Room / SVG schematic)
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '03a_AHU231_normal',
    hash: '#/symmetre/AHU-23-1',
    section: 'ahu231',
    caption: 'AHU-23-1 — SVG schematic view. Boiler room ventilation unit, no chilled water coils.',
  },
  {
    name: '03b_AHU231_controls_sidebar',
    hash: '#/symmetre/AHU-23-1',
    section: 'ahu231',
    caption: 'AHU-23-1 Controls Sidebar. Note: wrong setpoint for an unoccupied equipment space is a common fault.',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 04 — VAV-4-4-02  (Ballroom)
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '04a_VAV_ballroom_normal',
    hash: '#/symmetre/VAV-4-4-02',
    section: 'vav',
    caption: 'VAV-4-4-02 Ballroom — healthy baseline. Downstream of AHU-4-4. Damper in deadband.',
  },
  {
    name: '04b_VAV_ballroom_cooling_call',
    hash: '#/symmetre/VAV-4-4-02',
    section: 'vav',
    caption: 'VAV-4-4-02 with cooling call active — space temperature raised above cooling setpoint, damper opens.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.VAVController) window.VAVController.setValue('spaceTemp', 78);
      });
      await sleep(1500);
    },
  },
  {
    name: '04c_VAV_ballroom_fault_V01_reheat',
    hash: '#/symmetre/VAV-4-4-02',
    section: 'vav',
    caption: 'V-01 fault — excessive reheat while cold discharge air is supplied. Classic energy waste pattern.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.VAVController) {
          window.VAVController.setValue('reheatValvePosition', 80);
        }
      });
      await sleep(1500);
    },
  },
  {
    name: '04d_VAV_ballroom_fault_V02_CO2',
    hash: '#/symmetre/VAV-4-4-02',
    section: 'vav',
    caption: 'V-02 fault — CO₂ exceeds 1,100 ppm in the Ballroom. Ventilation response required per ASHRAE 62.1.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.VAVController) window.VAVController.setValue('co2Sensor', 1200);
      });
      await sleep(1500);
    },
  },
  {
    name: '04e_VAV_ballroom_fault_V03_unoccupied',
    hash: '#/symmetre/VAV-4-4-02',
    section: 'vav',
    caption: 'V-03 fault — airflow present during unoccupied hours due to manual damper override. Schedule waste.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.VAVController) {
          window.VAVController.setValue('runSchedule', false);
          window.VAVController.setValue('damperPosition', 50);
        }
      });
      await sleep(1500);
    },
  },
  {
    name: '04f_VAV_ballroom_M_badge',
    hash: '#/symmetre/VAV-4-4-02',
    section: 'vav',
    caption: 'VAV-4-4-02 with M badge on reheat valve — manual override means the program sequence is bypassed.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.VAVController) window.VAVController.setValue('reheatValvePosition', 60);
      });
      await sleep(1500);
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 05 — ALARM SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '05a_alarms_clean',
    hash: '#/alarms',
    section: 'alarms',
    caption: 'Alarm Summary — no active alarms. A well-run building keeps this page clear.',
  },
  {
    name: '05b_alarms_with_faults',
    hash: '#/alarms',
    section: 'alarms',
    caption: 'Alarm Summary with active faults triggered across AHU-4-4, AHU-4-6, and VAV. Sort by priority, click source to inspect.',
    preShot: async (page) => {
      // Trigger faults across multiple units then navigate to alarms
      await page.evaluate(() => {
        if (window.AHU44NewController) {
          window.AHU44NewController.setValue('co2Sensor', 1300);
          window.AHU44NewController.setValue('oaDamperPosition', 5);
        }
        if (window.AHU46Controller) window.AHU46Controller.setValue('co2Sensor', 1200);
        if (window.VAVController) window.VAVController.setValue('co2Sensor', 1150);
      });
      await sleep(2000);
    },
  },
  {
    name: '05c_alarms_acknowledged',
    hash: '#/alarms',
    section: 'alarms',
    caption: 'Alarm Summary — faults acknowledged but unresolved. Acknowledged ≠ fixed.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) window.AHU44NewController.setValue('co2Sensor', 1300);
        if (window.AHU44NewFaultEngine && window.AHU44NewFaultEngine.acknowledgeAll) {
          window.AHU44NewFaultEngine.acknowledgeAll('cta_instructor');
        }
      });
      await sleep(1500);
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 06 — EBI POINT DETAIL
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '06a_ebi_general',
    hash: '#/ebi',
    section: 'ebi',
    caption: 'EBI Point Detail — General tab. Read: point name, type, units, technical address, present value, mode.',
  },
  {
    name: '06b_ebi_history',
    hash: '#/ebi',
    section: 'ebi',
    caption: 'EBI History tab — trend chart. Confirm fault duration and recurrence before drawing conclusions.',
    preShot: async (page) => {
      await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('button, [role="tab"]')];
        const h = tabs.find(el => /history|trend/i.test(el.textContent));
        if (h) h.click();
      });
      await sleep(1200);
    },
  },
  {
    name: '06c_ebi_alarms_tab',
    hash: '#/ebi',
    section: 'ebi',
    caption: 'EBI Alarms tab — point-level alarm history. Use alongside Alarm Summary for root cause.',
    preShot: async (page) => {
      await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('button, [role="tab"]')];
        const t = tabs.find(el => /alarm/i.test(el.textContent));
        if (t) t.click();
      });
      await sleep(1200);
    },
  },
  {
    name: '06d_ebi_recent_events',
    hash: '#/ebi',
    section: 'ebi',
    caption: 'EBI Recent Events tab — log of operator changes. Critical for tracing who set a manual override and when.',
    preShot: async (page) => {
      await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('button, [role="tab"]')];
        const t = tabs.find(el => /event|recent/i.test(el.textContent));
        if (t) t.click();
      });
      await sleep(1200);
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 07 — SCHEDULE MANAGER
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '07a_schedule_weekly_normal',
    hash: '#/schedule',
    section: 'schedule',
    caption: 'Schedule Manager — normal weekday schedule (6 AM – 8 PM, off overnight and weekends).',
  },
  {
    name: '07b_schedule_weekly_fault',
    hash: '#/schedule',
    section: 'schedule',
    caption: 'Schedule Manager — 24/7 schedule fault. Unit running all day, every day, including Sunday 1 AM.',
    preShot: async (page) => {
      // Click the AHU-4-4 schedule if a selector exists, then look for a 24/7 or fault state toggle
      await page.evaluate(() => {
        const selects = document.querySelectorAll('select');
        selects.forEach(s => {
          // Try to pick a schedule that shows fault state
          for (let i = 0; i < s.options.length; i++) {
            if (/AHU-4-4|fault|24.7/i.test(s.options[i].text)) {
              s.value = s.options[i].value;
              s.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        });
      });
      await sleep(1000);
    },
  },
  {
    name: '07c_schedule_exception',
    hash: '#/schedule',
    section: 'schedule',
    caption: 'Exception Schedule — holiday and one-time override entries. Check after events for forgotten overrides.',
    preShot: async (page) => {
      await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('button, [role="tab"]')];
        const t = tabs.find(el => /exception|holiday/i.test(el.textContent));
        if (t) t.click();
      });
      await sleep(1000);
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 08 — REPORTS  (Point Attribute Report)
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '08a_reports_clean',
    hash: '#/reports',
    section: 'reports',
    caption: 'Point Attribute Report — no overrides. All points in Auto mode: a clean building baseline.',
  },
  {
    name: '08b_reports_with_overrides',
    hash: '#/reports',
    section: 'reports',
    caption: 'Point Attribute Report — Manual mode points highlighted. Run this before finalising any diagnosis.',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) {
          window.AHU44NewController.setValue('oaDamperPosition', 0);
          window.AHU44NewController.setValue('fanSpeedSetpoint', 100);
        }
        if (window.AHU46Controller) window.AHU46Controller.setValue('oaDamperPosition', 10);
      });
      await sleep(1500);
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 09 — CAPSTONE WORKSHEET
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '09a_capstone_blank',
    hash: '#/capstone',
    section: 'capstone',
    caption: 'Capstone Worksheet — blank. Students complete this with evidence from at least three simulator screens.',
  },
  {
    name: '09b_capstone_in_progress',
    hash: '#/capstone',
    section: 'capstone',
    caption: 'Capstone Worksheet — partially filled. Each section must reference a specific screen and evidence type.',
    preShot: async (page) => {
      // Try to type in a text field to show it partially filled
      const inputs = await page.$$('input[type="text"], textarea');
      if (inputs[0]) await inputs[0].type('AHU-4-4: N-04 OA damper below 20% minimum while fan running');
      if (inputs[1]) await inputs[1].type('Ventilation shortfall — ASHRAE 62.1 minimum OA not met');
      await sleep(500);
    },
  },

  // ════════════════════════════════════════════════════════════════════════════
  // 10 — INSTRUCTOR DASHBOARD
  // ════════════════════════════════════════════════════════════════════════════
  {
    name: '10_instructor_dashboard',
    hash: '#/instructor',
    section: 'instructor',
    caption: 'Instructor Dashboard — scenario controls, capstone unlock, and class progress overview.',
  },

];

// ─── Run all captures ─────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const chrome = getChromePath();
  console.log(`\nBMS Simulator — Full Screenshot Capture`);
  console.log(`URL:    ${BASE_URL}`);
  console.log(`Chrome: ${chrome}`);
  console.log(`Output: ${OUT_DIR}`);
  console.log(`Screens: ${SCREENS.length}\n`);

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const manifest = [];
  for (const screen of SCREENS) {
    process.stdout.write(`[${screen.name}]\n`);
    try {
      const result = await shot(browser, screen);
      manifest.push(result);
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
      manifest.push({ file: screen.name + '.png', section: screen.section, caption: screen.caption, error: err.message });
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const ok   = manifest.filter(r => !r.error).length;
  const fail = manifest.filter(r =>  r.error).length;
  console.log(`\nDone — ${ok} captured, ${fail} failed.`);
  if (fail) manifest.filter(r => r.error).forEach(r => console.log(`  ✗ ${r.name}: ${r.error}`));
  console.log(`\nManifest: ${OUT_DIR}/manifest.json`);
  console.log('Upload the screenshots/ folder and run the manual builder next.\n');
})();
