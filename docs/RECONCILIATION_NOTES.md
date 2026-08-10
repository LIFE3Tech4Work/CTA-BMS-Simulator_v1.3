# CTA-BMS-Merged_Test_v1.1 — what this is and how it differs from earlier drops

## Important finding from reconciling your two uploads
Your uploaded `CTA-BMS-Simulator.zip` (the "real" local checkout) turned out to
be **at git commit `9536ca9`, dated June 18, 2026** — about 3 weeks behind
current GitHub `main` (`726a470`, July 6, 2026), which is what all my prior
patches in this conversation were built against.

Verified via `git merge-base --is-ancestor`: `9536ca9` **is** a direct
ancestor of `726a470` — meaning GitHub `main` is a strict superset of your
upload, not a divergent branch. Nothing unique in your upload is missing from
GitHub `main`. Concretely, your upload predates the addition of
`AHU46Controller.js`, `AHU46ImageOverlay.jsx`, `AHU46ControlsSidebar.jsx`,
`AHU46FaultEngine.js`, and the VAV controller — in your checkout, AHU-4-6
renders through the generic, PointRegistry-driven `AHUGraphic.jsx` (9 shared
points, no per-unit control sequence), not a dedicated screenshot overlay.
If the live Railway app deploys from GitHub `main` (the standard Railway
setup), it is running the newer code with the dedicated AHU-4-6 files —
consistent with what you described seeing.

Also confirmed: the `BMS Exports/`, `BMS Images/`, `BMS Slides/`, and
`BMS TMY/` folders in your upload are `.gitignore`d — local reference/source
material (raw BMS data exports, screenshots, the TMY EPW file used to build
`tmy3_central_park.js`) that was never pushed to GitHub and isn't part of the
running app. Nothing operational was lost by building on GitHub `main`.

**Bottom line:** this build is GitHub `main` (`726a470`) — the same current,
full codebase (auth, routing, instructor dashboard, all four AHU screens,
VAV, fault engines, LL97/HDH-CDH accumulators, tests) — with the AHU-4-6
vector-art swap applied on top. It supersedes both earlier deliverables in
this conversation: the first (repo2-shell + repo1-controller) was the wrong
architecture entirely; the second was built on the right architecture but a
slightly different clone state that's now been re-verified against your
actual upload.

## What was added/changed (AHU-4-6 only, same as before)
- `src/assets/vector/ahu46_board.svg` — static vector artwork, extracted
  verbatim from `CTA-BMS-Simulator_v1.2`'s `src/ui/symmetre/AHU-4-6.dc.html`
  (confirmed pure static SVG, no template logic).
- `src/ui/symmetre/AHU46VectorOverlay.jsx` — same structure as
  `AHU46ImageOverlay.jsx` (same `HOTSPOTS`, same `AHU46Controller.subscribe()`
  wiring, same `AHU46FaultEngine` alarm banners) — only the background
  changed from a PNG `<img>` to a fetched/inlined SVG.
- `src/index.html` — one added `<script>` tag.
- `src/App.jsx` — two added lines routing `AHU-4-6` to the new overlay, with
  the original PNG overlay kept as a fallback.

## Verified before packaging
- `npm install` succeeds (the only failure was `puppeteer`'s Chrome download,
  blocked by this sandbox's network — irrelevant to running the app; skip it
  with `PUPPETEER_SKIP_DOWNLOAD=true npm install` if you hit the same thing).
- `npm start` boots the real Express server on port 3000; confirmed by
  `curl` that `index.html`, the new overlay `.jsx`, the new `.svg`, and
  `AHU46Controller.js` all serve with `200`.
- Full test suite: **405 passed, 36 failed** — all 36 failures are in
  `VAVController.test.mjs` and `AHU44NewFaultEngine.test.mjs`, both
  **pre-existing failures confirmed on the unmodified codebase** (re-ran the
  same tests against a clean clone with none of my changes — identical
  failure count). Nothing I touched broke anything.
- `AHU46Controller.test.mjs` specifically: **35/35 passed.**
- NOT verified: actual visual rendering in a browser, and hotspot
  positioning is still uncalibrated against the new artwork (same caveat as
  before — see the file header in `AHU46VectorOverlay.jsx`).

## How to test
```bash
cd CTA-BMS-Merged_Test_v1.1
PUPPETEER_SKIP_DOWNLOAD=true npm install
npm start
```
Open `http://localhost:3000`, sign in (`cta_student` / `bms2026` or
`cta_instructor` / `bms2026` — check `PLATFORM_REQUIREMENTS.md` if these
changed), navigate to AHU-4-6. You should see the vector artwork with live
data badges overlaid (positions not yet recalibrated to the new art).

## Still outstanding (not in this build)
- BMS_Figure_Rules_v1_1.docx taxonomy (AI/AV/BV point types, white/gray/pink
  box styling, Manual Override lock behavior, Calculated Outputs panel,
  point-detail modal tab differences, Events log Relinquish Control rules) —
  discussed but not yet implemented. Substantial scope beyond the graphics
  swap; suggest scoping this separately once the vector art itself is
  confirmed working.
- Hotspot recalibration against the new artwork's actual layout.
- AHU-4-4, AHU-23-1, VAV vector swaps (same pattern, not yet done).
