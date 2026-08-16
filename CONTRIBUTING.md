# Contributing / Dev Workflow

*Added 2026-08-15 in response to checklist item "Proper Git branching workflow" —
the team has been working out of separate folders (`v1.2`, `v1.3`) rather than
branches, which caused confusion and at least one instance of pushing the wrong
codebase. This documents the workflow to use going forward in this repo.*

## This is the active repo

**`CTA-BMS-Simulator_v1.3` is the one live codebase.** Don't create another
`v1.4`-style folder/copy for new work — branch instead (see below). If you're
picking up a task and find yourself tempted to work from an older `v1.x`
folder because it's what you have open, stop and pull this repo instead;
that's exactly how the wrong-codebase push happened before.

## Branching

This repo already has GitHub PRs in its history (`visual-update`,
`visual-update-final`, `test/ahu44-screenshot-verification`) — the practice
exists, it just hasn't been consistent. Going forward:

1. **Branch off `main`** for any non-trivial change: `git checkout -b
   fix/short-description` or `feature/short-description`.
2. **Commit as you go**, with messages that explain *why*, not just *what*
   (see existing `git log` for the house style).
3. **Push the branch and open a PR** rather than committing straight to
   `main` — even solo, a PR gives you a diff to review before it lands, and
   a paper trail for what changed and why.
4. **Merge once verified** (see below), then delete the branch.

Small, obvious fixes (a typo, a one-line copy change) can go straight to
`main` — use judgment, don't turn every change into ceremony.

## Before merging/pushing to `main`

- Run the test suite: `npm test`. This repo has pre-existing, unrelated
  failures (documented in `docs/BMS_Simulator_Issue_Checklist.md`) — check
  that your change doesn't add *new* failures, not that the suite is 100%
  green.
- If the change is visible in the app, actually load it in a browser and
  click through the affected screen(s). This is a teaching simulator; a
  change that's logically correct but visually broken is still broken.
- If you're touching a specific AHU's controller logic, check whether a
  corresponding `*ControlsSidebar.jsx` / `boardPoints.js` chip needs
  updating too — the point definitions, the sidebar, and the board graphic
  are three separate files that all need to agree.

## Keeping the checklist current

`docs/BMS_Simulator_Issue_Checklist.md` is the tracked source of truth for
what's open vs. resolved (see its own header). When you close out a
checklist item, check it off and add a one-line note on what changed and
why, in the same commit/PR as the fix — don't let the doc drift from
reality.
