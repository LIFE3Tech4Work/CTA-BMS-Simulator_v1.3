/**
 * BMS Simulator — Revision Screenshots (Today's Changes Only)
 *
 * Captures every visible change from the two commits made today:
 *   1. Cohort 1 feedback fixes (damper bug, labels, legends, disconnect notes)
 *   2. SOO implementation (spill damper, humidity, auto-enthalpy, freeze, labels)
 *
 * Run on your Mac:
 *   node capture_revisions.js
 *
 * Output: ./screenshots/revisions/  — ready to paste into manual v2.2
 *
 * DESIGN NOTES FOR OPTIMAL DOCUMENT SCREENSHOTS:
 *
 *   Full screen (1440×900) — used for "what the whole screen looks like now"
 *   Sidebar crop (0,0,260,900) — used for sidebar label/legend close-ups
 *   Sidebar section crop — used to show a specific sidebar section (e.g. outputs)
 *   Feature crop — tightly cropped around a specific new element
 *
 * Each shot is named and annotated below with the manual section it updates.
 */

const puppeteer = require('./node_modules/puppeteer-core');
const path      = require('path');
const fs        = require('fs');

const BASE_URL = 'https://web-production-04f1b.up.railway.app';
const OUT_DIR  = path.join(__dirname, 'screenshots', 'revisions');
const CHROME   = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORT = { width: 1440, height: 900 };

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

async function nav(page, hash) {
  await login(page);
  await page.goto(`${BASE_URL}/${hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);
}

async function shot(browser, name, hash, opts = {}) {
  const { clip, preShot, settle = 3500 } = opts;
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await nav(page, hash);
  if (settle > 3500) await sleep(settle - 3500);
  if (preShot) { await preShot(page); await sleep(1200); }
  const p = path.join(OUT_DIR, name + '.png');
  await page.screenshot({ path: p, ...(clip ? { clip } : {}) });
  await page.close();
  console.log(`  ✓ ${name}.png`);
}

// ─── Clip helpers ─────────────────────────────────────────────────────────────
// Sidebar occupies x=0 to ~260px; OA Strip is y=88 to ~116px
const SIDEBAR_FULL      = { x: 0,   y: 88,  width: 262, height: 812 };
const SIDEBAR_TOP       = { x: 0,   y: 88,  width: 262, height: 280 };  // legend + schedule + timer
const SIDEBAR_ECONOM    = { x: 0,   y: 360, width: 262, height: 230 };  // economizer section
const SIDEBAR_OUTPUTS   = { x: 0,   y: 560, width: 262, height: 340 };  // calculated outputs section
const OA_STRIP          = { x: 0,   y: 88,  width: 1440, height: 32 };
const ALARM_TOOLBAR     = { x: 1100, y: 0,  width: 340,  height: 55  };  // Acknowledge button area
const LL97_PANEL        = { x: 0,   y: 580, width: 262, height: 260 };  // LL97 / LL84 panel in VAV sidebar
const SCHEDULE_FOOTER   = { x: 0,   y: 700, width: 1440, height: 200 }; // locked note at bottom

// ─── Shots ────────────────────────────────────────────────────────────────────

const SHOTS = [

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP A — AHU-4-4 Sidebar Changes
  //   Manual section: Ch 6.1 Controls Sidebar
  //   Updated: editable/read-only legend, renamed labels, new calculated outputs
  // ══════════════════════════════════════════════════════════════════════════

  {
    name: 'A1_AHU44_sidebar_legend_and_top',
    hash: '#/symmetre/AHU-4-4',
    clip: SIDEBAR_TOP,
    // Shows: new white/gray legend at top, renamed schedule/timer labels
    caption: 'AHU-4-4 sidebar top — new editable/read-only color legend. White box = operator setpoint, gray = calculated read-only.',
  },
  {
    name: 'A2_AHU44_sidebar_economizer_section',
    hash: '#/symmetre/AHU-4-4',
    clip: SIDEBAR_ECONOM,
    // Shows: renamed "OA Temp (Live)", "Enthalpy OK — Economizer (auto)",
    //        "Economizer Mixed Air Target", "OA Min Position (Damper)",
    //        "Min Fan Speed Lockout", "CO₂ Fresh Air Monitor SP"
    caption: 'AHU-4-4 Economizer section — renamed labels per SOO CLC #2. Enthalpy now auto-calculated from TMY3 weather vs return air enthalpy.',
  },
  {
    name: 'A3_AHU44_sidebar_calculated_outputs',
    hash: '#/symmetre/AHU-4-4',
    clip: SIDEBAR_OUTPUTS,
    // Shows: Return Air Damper, Spill Damper (DA-3, N.O.), Return Fan CFM (90%),
    //        Supply Air %RH (responds to CHW), Exhaust Damper
    caption: 'AHU-4-4 Calculated Outputs — new outputs added from SOO: Spill Damper (DA-3, N.O.), Return Fan CFM (90% of supply), Supply Air %RH.',
  },
  {
    name: 'A4_AHU44_sidebar_full',
    hash: '#/symmetre/AHU-4-4',
    clip: SIDEBAR_FULL,
    caption: 'AHU-4-4 Controls Sidebar — full view after all label and logic updates.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP B — Show Labels Toggle (new feature)
  //   Manual section: Ch 6.1 — new sub-section "Diagram Labels"
  // ══════════════════════════════════════════════════════════════════════════

  {
    name: 'B1_AHU44_show_labels_OFF',
    hash: '#/symmetre/AHU-4-4',
    // Default state — no labels visible. Shows the "🏷 Show Labels" button in top right.
    caption: 'AHU-4-4 normal view. "🏷 Show Labels" button in top-right corner — click to overlay diagram labels.',
  },
  {
    name: 'B2_AHU44_show_labels_ON',
    hash: '#/symmetre/AHU-4-4',
    preShot: async (page) => {
      // Click the Show Labels toggle button
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const lbl = btns.find(b => /Show Labels|Labels ON/i.test(b.textContent));
        if (lbl) lbl.click();
      });
      await sleep(600);
    },
    caption: 'AHU-4-4 with Show Labels ON — cyan overlay labels RETURN AIR, OA, EXHAUST, SUPPLY, FILTER, FREEZE PROTECT, HEATING COIL, COOLING COIL, SUPPLY FAN, RETURN DAMPER, OA DAMPER, MIXED AIR SENSOR.',
  },
  {
    name: 'B3_AHU44_show_labels_crop_top',
    hash: '#/symmetre/AHU-4-4',
    preShot: async (page) => {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const lbl = btns.find(b => /Show Labels|Labels ON/i.test(b.textContent));
        if (lbl) lbl.click();
      });
      await sleep(600);
    },
    clip: { x: 240, y: 88, width: 1200, height: 460 },
    caption: 'Show Labels — upper half close-up: return air, exhaust, fan, and damper labels visible over the AHU graphic.',
  },
  {
    name: 'B4_AHU44_show_labels_crop_bottom',
    hash: '#/symmetre/AHU-4-4',
    preShot: async (page) => {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const lbl = btns.find(b => /Show Labels|Labels ON/i.test(b.textContent));
        if (lbl) lbl.click();
      });
      await sleep(600);
    },
    clip: { x: 240, y: 440, width: 1200, height: 460 },
    caption: 'Show Labels — lower half: OA plenum, filter, freeze, coil, and supply labels.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP C — Humidity Model (SOO CLC #4)
  //   Manual section: Ch 6.1 — updated humidity note (was ⚠ static)
  // ══════════════════════════════════════════════════════════════════════════

  {
    name: 'C1_AHU44_humidity_baseline',
    hash: '#/symmetre/AHU-4-4',
    // Supply RH at default ~55% (baseline, CHW valve at ~71%)
    caption: 'AHU-4-4 baseline — Supply Air %RH now calculated. Default ~55% with CHW valve partially open.',
    clip: SIDEBAR_OUTPUTS,
  },
  {
    name: 'C2_AHU44_humidity_CHW_high',
    hash: '#/symmetre/AHU-4-4',
    preShot: async (page) => {
      // Drive CHW valve high (aggressive cooling/dehumidification)
      await page.evaluate(() => {
        if (window.AHU44NewController) window.AHU44NewController.setValue('coolingCoilSetpoint', 50);
      });
      await sleep(1500);
    },
    clip: SIDEBAR_OUTPUTS,
    caption: 'CHW valve forced high (cooling setpoint 50°F) — Supply Air %RH drops as cooling coil dehumidifies. SOO CLC #4 in action.',
  },
  {
    name: 'C3_AHU44_humidity_OA_humid',
    hash: '#/symmetre/AHU-4-4',
    preShot: async (page) => {
      // Show high OA humidity effect on supply RH
      await page.evaluate(() => {
        if (window.AHU44NewController) {
          window.AHU44NewController.setValue('oaDamperPosition', 80); // lots of humid OA
        }
      });
      await sleep(1500);
    },
    clip: SIDEBAR_OUTPUTS,
    caption: 'OA damper opened to 80% — humid outdoor air mixes into supply, raising Supply Air %RH before coil correction.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP D — Return Air Damper + Spill Damper (SOO DA-2, DA-3)
  //   Manual section: Ch 6.1 — new mixing box section
  // ══════════════════════════════════════════════════════════════════════════

  {
    name: 'D1_AHU44_dampers_minimum_OA',
    hash: '#/symmetre/AHU-4-4',
    // At default 20% OA: Spill = 0%, Return = 80%, Exhaust = 20%
    clip: SIDEBAR_OUTPUTS,
    caption: 'Three-damper mixing box at minimum OA (20%): Return Air Damper 80%, Spill Damper (DA-3) ~0%, Exhaust 20%. Correct mixing-box balance.',
  },
  {
    name: 'D2_AHU44_dampers_economizer_full',
    hash: '#/symmetre/AHU-4-4',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) {
          window.AHU44NewController.setValue('oaDamperPosition', 100);
          window.AHU44NewController.setValue('enthalpyOKForEconomizer', true);
        }
      });
      await sleep(1500);
    },
    clip: SIDEBAR_OUTPUTS,
    caption: 'Full economizer (OA damper 100%): Return Air Damper 0%, Spill Damper opens to exhaust increased fresh air, Exhaust 100%. SOO CLC #8 behavior.',
  },
  {
    name: 'D3_AHU44_spill_damper_system_off',
    hash: '#/symmetre/AHU-4-4',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) window.AHU44NewController.setValue('runSchedule', false);
      });
      await sleep(1500);
    },
    clip: SIDEBAR_OUTPUTS,
    caption: 'System OFF — Spill Damper (DA-3) shows 100% (Normally Open = fails open when system off, per SOO). OA and Return dampers close to 0%.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP E — Enthalpy Economizer Auto-Calculation (SOO CLC #2)
  //   Manual section: Ch 6.1 — updated economizer description
  // ══════════════════════════════════════════════════════════════════════════

  {
    name: 'E1_AHU44_enthalpy_auto_label',
    hash: '#/symmetre/AHU-4-4',
    clip: SIDEBAR_ECONOM,
    caption: '"Enthalpy OK — Economizer (auto)" label — now auto-calculated from TMY3 OA enthalpy vs return air enthalpy. Manual override available via M badge.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP F — Alarm Summary Changes
  //   Manual section: Ch 6.5 Alarm Summary
  // ══════════════════════════════════════════════════════════════════════════

  {
    name: 'F1_alarms_acknowledge_note',
    hash: '#/alarms',
    preShot: async (page) => {
      // Trigger a fault so Acknowledge button is active
      await page.evaluate(() => {
        if (window.AHU44NewController) window.AHU44NewController.setValue('co2Sensor', 1300);
      });
      await sleep(2000);
    },
    clip: ALARM_TOOLBAR,
    caption: '"Acknowledged ≠ fixed" label below the Acknowledge button. Acknowledging marks the alarm as seen — it does not resolve the underlying fault.',
  },
  {
    name: 'F2_alarms_with_faults_full',
    hash: '#/alarms',
    preShot: async (page) => {
      await page.evaluate(() => {
        if (window.AHU44NewController) {
          window.AHU44NewController.setValue('co2Sensor', 1300);
          window.AHU44NewController.setValue('oaDamperPosition', 5);
        }
      });
      await sleep(2000);
    },
    caption: 'Alarm Summary with active faults. The "Acknowledged ≠ fixed" label reminds students that acknowledging clears the visual alert but the fault remains until corrected.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP G — LL97 Panel Disconnect Note
  //   Manual section: Ch 6.9 LL97 Panel / WBL Ch 11
  // ══════════════════════════════════════════════════════════════════════════

  {
    name: 'G1_LL97_disconnect_note',
    hash: '#/symmetre/VAV-4-4-02',
    clip: LL97_PANEL,
    caption: 'LL97 Panel — amber disconnect note: "This building is not your LL84 selected building." Clarifies the WBL relationship between NYC benchmarking data and the simulator.',
  },
  {
    name: 'G2_LL97_panel_full_sidebar',
    hash: '#/symmetre/VAV-4-4-02',
    clip: { x: 0, y: 88, width: 262, height: 812 },
    caption: 'VAV sidebar showing full LL97/LL84 panel with disconnect explanation.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP H — Schedule Manager Updated Notes
  //   Manual section: Ch 6.7 Schedule Manager
  // ══════════════════════════════════════════════════════════════════════════

  {
    name: 'H1_schedule_locked_note',
    hash: '#/schedule',
    preShot: async (page) => {
      // Click to Exception Schedule tab to show its updated note
      await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('button, [role="tab"]')];
        const t = tabs.find(el => /exception|holiday/i.test(el.textContent));
        if (t) t.click();
      });
      await sleep(800);
    },
    clip: SCHEDULE_FOOTER,
    caption: 'Exception Schedule — updated instructional note: "identify runtime waste and document the recommended fix" instead of a plain permission error.',
  },
  {
    name: 'H2_weekly_schedule_locked_note',
    hash: '#/schedule',
    clip: SCHEDULE_FOOTER,
    caption: 'Weekly Schedule — updated instructional note guides students to identify schedule faults and write recommendations rather than hitting a dead-end permission wall.',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP I — AHU-4-6 Service Label + Updated Controls
  //   Manual section: Ch 6.2 AHU-4-6
  // ══════════════════════════════════════════════════════════════════════════

  {
    name: 'I1_AHU46_updated_service_label',
    hash: '#/symmetre/AHU-4-6',
    clip: { x: 1050, y: 88, width: 390, height: 80 },
    caption: 'AHU-4-6 service label updated per SOO Page 4: "Pre-Function & Meeting Room, 2nd Level" (was "Meeting Room" only).',
  },
  {
    name: 'I2_AHU46_sidebar_CO2_label',
    hash: '#/symmetre/AHU-4-6',
    clip: { x: 0, y: 340, width: 262, height: 160 },
    caption: 'AHU-4-6 sidebar — "CO₂ Fresh Air Monitor SP" (was "CO₂ Setpoint"). 900 PPM = fresh air delivery check. DCV override threshold = 1100 PPM (per SOO CLC #7).',
  },
  {
    name: 'I3_AHU46_full_screen',
    hash: '#/symmetre/AHU-4-6',
    caption: 'AHU-4-6 full screen after updates — correct service label, updated sidebar labels, CO₂ monitor setpoint clarified.',
  },

];

// ─── Runner ──────────────────────────────────────────────────────────────────

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\nBMS Simulator — Revision Screenshots`);
  console.log(`URL:    ${BASE_URL}`);
  console.log(`Output: ${OUT_DIR}`);
  console.log(`Shots:  ${SHOTS.length}\n`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const manifest = [];
  for (const s of SHOTS) {
    const group = s.name.split('_')[0];
    process.stdout.write(`[${s.name}]\n`);
    try {
      await shot(browser, s.name, s.hash, { clip: s.clip, preShot: s.preShot, settle: s.settle });
      manifest.push({ file: s.name + '.png', caption: s.caption, group });
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
      manifest.push({ file: s.name + '.png', caption: s.caption, group, error: err.message });
    }
  }

  await browser.close();

  // Write manifest with captions — paste directly into manual
  fs.writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Print a human-readable summary grouped by section
  console.log('\n── Capture Summary ────────────────────────────────────');
  const groups = { A: 'AHU-4-4 Sidebar', B: 'Show Labels Toggle', C: 'Humidity Model',
                   D: 'Mixing Box Dampers', E: 'Auto-Enthalpy', F: 'Alarm Summary',
                   G: 'LL97 Panel', H: 'Schedule Manager', I: 'AHU-4-6' };
  Object.entries(groups).forEach(([k, label]) => {
    const shots = manifest.filter(s => s.group === k);
    const ok    = shots.filter(s => !s.error).length;
    console.log(`  ${k}. ${label}: ${ok}/${shots.length}`);
  });

  const total  = manifest.filter(s => !s.error).length;
  const failed = manifest.filter(s => s.error).length;
  console.log(`\n  Total: ${total} captured, ${failed} failed`);
  console.log(`  Manifest: ${OUT_DIR}/manifest.json\n`);
})();
