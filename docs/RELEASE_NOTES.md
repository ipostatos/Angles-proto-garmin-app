# Release Notes

Narrative summary of releases. For the itemized list, see
[`../CHANGELOG.md`](../CHANGELOG.md).

## v2.0 — the catalog is closed, the workshop is split into stations

The angle catalog is no longer open to anyone with the link. Operators open it
with a workshop code, admins with their own password, and a brand-new install
starts with a short first-run screen instead of a seeded user list.

Several sawyers can now work in parallel: every saw or person is a station
with its own job, every watch is paired to one station with a 6-digit code,
and cut marks stay on each watch. Two admins editing at once no longer lose
work either: their saves are merged.

Drawings moved out of the catalog JSON into private storage, so the catalog
loads faster and pictures are only visible to people with access.

Setup and upgrade steps: [`OPERATIONS.md`](OPERATIONS.md). Watches:
[`WATCH_SETUP.md`](WATCH_SETUP.md), [`MULTI_OPERATOR.md`](MULTI_OPERATOR.md).

## Garmin app v1.1 — hands-free rhythm at the saw

Cut, press START, and the watch does the rest: the angle turns green, the
watch buzzes once and the next open angle is already on the screen. Skips
still buzz twice and show red; the end of the job is one long buzz and
ALL DONE. The app has an ABOUT screen with its version and a new saw blade
icon. Workshop background: [`CUTTING.md`](CUTTING.md).

## Unreleased — Garmin watch

Angles now runs on a Garmin watch. Select holds on the website, press **⌚**
next to the print icon, open Angles on the watch and cut: **BIG MODE** shows
one angle at a time in large digits (saw on top, hold name below); START marks
it cut and moves on. Cut angles turn green, skipped ones red, and progress
survives Back, exit and reboot. The watch works offline on its saved copy and
refreshes through the phone. See [`../garmin/README.md`](../garmin/README.md).

## v1.5 — Shared backend & multi-user

v1.5 is the milestone where Angles became a genuinely multi-user tool. Before
this release the catalog lived in the browser's `localStorage`; now it lives in
**Neon Postgres** behind same-origin **Vercel Functions**, and admin actions are
authorized by a server-verified session rather than client-side checks.

**Highlights:**

- **One shared catalog.** Operators read it publicly (`GET /api/state`); admins
  edit a single source of truth that everyone sees. Saves are revision-locked
  for optimistic concurrency — a stale save is rejected with `409` rather than
  silently clobbering another admin's work.
- **Real auth.** Named admin users authenticate against the server; sessions are
  httpOnly HMAC-signed cookies; passwords are scrypt-hashed server-side; login
  is rate-limited via a distributed Neon-backed throttle.
- **Audit trail.** Every catalog save is logged; the `HISTORY` view shows who
  changed what and when, and logged-in users are notified when someone else has
  edited the database.
- **UI polish.** The interface was translated to English and the admin and
  mobile layouts were refined (full-width history, collapsible mobile rows,
  narrower cards, restored focus rings).
- **Operations & CI.** A backup/restore runbook ([`OPERATIONS.md`](OPERATIONS.md)),
  a CI pipeline (lint/test/build/audit + secret scan), and Dependabot.

**Stabilization:** a single-pass review before planning v1.6/v2.0 confirmed all
gates green and surfaced only non-blocking polish/UX findings — see
`the Phase 1.5 stabilization review`.

**Upgrade / operational notes:**

- The app is **online-only**: without a reachable backend it shows a
  no-connection retry screen. The most common failure is operational — a missing
  `DATABASE_URL` / `SESSION_SECRET` or an un-run `db:setup`. Preview deploys
  intentionally lack `SESSION_SECRET` (Production-only).
- Work-mode progress and theme remain **device-local** by design and are not
  part of the shared catalog or any backup.

See [`ROADMAP.md`](ROADMAP.md) for what comes next.
