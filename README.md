# Angles-proto + Garmin app

> Saw-angle reference tool for the AVA Volumes workshop: a shared web catalog of cut angles for climbing holds and volumes, a phone work mode, printable sheets, and a **Garmin watch app** that shows the next angle on the operator's wrist.

[![Version](https://img.shields.io/badge/web-v1.5-brightgreen?style=flat-square)](CHANGELOG.md)
[![Garmin app](https://img.shields.io/badge/Garmin%20app-v1.1-007CC3?style=flat-square&logo=garmin&logoColor=white)](garmin/README.md)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-avacut.vercel.app-black?style=flat-square&logo=vercel)](https://avacut.vercel.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Monkey C](https://img.shields.io/badge/Connect%20IQ-Monkey%20C-111?style=flat-square)](garmin/)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000?style=flat-square&logo=vercel)](https://vercel.com)
[![License](https://img.shields.io/badge/license-proprietary-lightgrey?style=flat-square)](#license)

**Current versions: web v1.5, Garmin app v1.1** — see the [changelog](CHANGELOG.md) and [release notes](docs/RELEASE_NOTES.md).

<p align="center">
  <img src="garmin/docs/screenshots/flow-big-mode.png" width="820" alt="Garmin app BIG MODE: open angle, cut (green), automatic jump, missed angle (red)">
</p>

---

## Why it exists

AVA Volumes builds climbing holds and volumes from plywood panels. The panel
edges are cut at bevel angles, a single hold needs many of them, and a job is
usually several holds at once. Angles replaces printed lists and memory with:

1. **One shared catalog** of every hold and its angles, edited by named admins
   with a change history.
2. **One merged, sorted cut list** for the holds of the current job, split by
   saw set-up (**MAIN** and **STEFAN**).
3. **Tick-off progress** at the saw: on a phone (work mode) or on a Garmin
   watch, where one button press marks the cut and jumps to the next angle.

The app is used daily on the workshop floor.

## What It Does

Operators select one or more holds, see their angles for **MAIN** (normal
clamping beam, panel flat, up to 45°) and **STEFAN** (clamping beam that holds
the blank vertically, for edges steeper than 45°), open the cutting drawing for
a row, use a phone-friendly work mode, print A4 reference sheets, or send the
selection to the watch.

Admins sign in as a named user and edit one shared catalog stored in Neon Postgres through same-origin Vercel Functions. Every successful catalog save is revision-locked and logged to a change history.

How the two set-ups work and how angles above 45° are cut on a saw whose blade
tilts only to 45°: [`docs/CUTTING.md`](docs/CUTTING.md).

---

## Features

| | |
|---|---|
| **Shared catalog** | Public read from `GET /api/state`; authenticated admin save via `PUT /api/state` |
| **Dual-table view** | MAIN and STEFAN angle tables, sortable asc/desc |
| **Multi-select products** | Select any number of products; tables update instantly |
| **Drawing viewer** | Click a row to show a drawing; zoom and dedicated print are available |
| **Print mode** | ALL / MAIN / STEFAN layouts for A4 reference sheets |
| **Admin panel** | Add, rename, delete holds and angles; upload drawings and cover images |
| **Named users** | `Tomek`, `Alessandro`, and `Artsi` are seeded by `npm run db:setup` |
| **Change history** | Admin `HISTORY` view shows who changed what and when |
| **Change notification** | Logged-in users are notified when another user changed the database |
| **Work mode** | Device-local progress for checked angles and work theme |
| **Import / Export** | Export JSON backups; import stages a draft that is persisted on SAVE |
| **Garmin watch app** | Angles of selected holds on the wrist: BIG MODE, colored list, auto-jump with vibration after each cut, saved progress — see [`garmin/README.md`](garmin/README.md) |
| **Send to watch** | ⌚ button next to print sends the selected holds to the watch via `/api/watch` |

---

## Tech Stack

- **React 19** and **Vite 8** for the SPA
- **Vercel Functions** in `/api` for auth, catalog state, and history
- **Neon Postgres** for users, shared catalog JSON, and audit log
- **httpOnly HMAC session cookie** for admin sessions
- **localStorage** only for device-local UI state such as work progress, work theme, and last-seen change id
- **react-hot-toast** for notifications
- **Connect IQ / Monkey C** for the Garmin watch app (`garmin/`)

---

## Project Structure

```text
Angles-proto-garmin-app/
├── api/                 # Vercel Functions (auth, state, history) + _lib shared logic
│   ├── _lib/            # auth, session, db, stateService, rateLimit, schema.sql
│   ├── login.js  logout.js  session.js
│   ├── state.js         # GET/PUT shared catalog
│   ├── history.js       # GET audit log
│   └── watch.js         # GET compact catalog + selection for the watch, POST "Send to watch"
├── src/                 # React SPA
│   ├── components/      # shared UI + AdminPage.jsx (the admin surface lives here today)
│   ├── features/        # operator/ split out; admin/ is a thin re-export stub for now
│   ├── domain/          # pure logic: angles, holds, diff, validation, migration
│   ├── storage/         # client data access: auth, history, import/export, work progress
│   ├── utils/           # helpers (image handling)
│   ├── App.jsx  main.jsx
│   └── contexts/ hooks/ constants/ styles/ assets/
├── garmin/              # Connect IQ watch app (Monkey C) — see garmin/README.md
├── scripts/             # db-setup.mjs, seed-users.mjs
├── docs/                # CUTTING, ARCHITECTURE, DEVELOPMENT, ROADMAP, RELEASE_NOTES, OPERATIONS, screenshots/
├── public/              # static assets
├── vercel.json          # security headers + routing
└── vite.config.js
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how these fit together.

---

## Quick Start

For UI-only development:

```bash
npm install
npm run dev
```

Vite serves the SPA at the URL it prints, usually `http://localhost:5173`. The plain Vite server does **not** run `/api`, so shared catalog and login calls need Vercel dev.

For full local development with backend functions:

```bash
npm install
vercel env pull .env.local
node --env-file=.env.local scripts/db-setup.mjs
vercel dev
```

Required server-only environment variables:

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=long-random-secret
SEED_PASSWORD_TOMEK=...
SEED_PASSWORD_ALESSANDRO=...
SEED_PASSWORD_ARTSI=...
```

Alternatively, set `SEED_USER_PASSWORDS` to a JSON object such as
`{"Tomek":"...","Alessandro":"...","Artsi":"..."}`. The legacy
`password = username` seed mode is available only with
`ALLOW_WEAK_SEED_PASSWORDS=true` and should be used for local/internal setup
only.

Build and tests:

```bash
npm run lint
npm test
npm run build
npm run audit
```

---

## Admin Panel

Open `/#/admin` or click **ADMIN** in the app.

- Login uses username + password against `/api/login`.
- Seeded users are `Tomek`, `Alessandro`, and `Artsi`; the setup script requires explicit seed passwords from env by default.
- The session is stored only as a server-set httpOnly cookie.
- Admin SAVE sends the full catalog plus server revision to `PUT /api/state`.
- If the catalog changed since the admin loaded it, the server returns `409 stale_revision`; the UI keeps the draft unsaved and asks the user to reload before retrying.
- The `HISTORY` tab reads `GET /api/history` and displays the newest audit rows.

---

## Data & Storage

- Shared catalog data lives in Neon Postgres `app_state.data` as a single JSON document.
- `app_state.revision` is the optimistic concurrency token for saves.
- `change_log` records hold/angle adds, deletes, renames, saw changes, and value changes.
- Image-only changes are persisted but not logged as audit events.
- Work-mode progress and theme are intentionally device-local in `localStorage`.
- `watch_selection` holds the last hold selection sent with **Send to watch** (single row, public write — see Security).
- Export downloads the visible catalog/draft as JSON.
- Import validates and stages a draft; it reaches the shared database only after SAVE.
- Only raster image data URLs are accepted on import/upload; SVG is rejected.

---

## Screenshots

**Web** (live at [avacut.vercel.app](https://avacut.vercel.app)):

| Desktop: two holds selected, MAIN and STEFAN tables | Phone work mode |
|---|---|
| <img src="docs/screenshots/web-desktop.png" width="560"> | <img src="docs/screenshots/web-phone-work.png" width="220"> |

**Garmin watch** (Instinct 3 AMOLED 45mm simulator):

| Holds | BIG MODE | Cut | LIST | About |
|---|---|---|---|---|
| <img src="garmin/docs/screenshots/holds.png" width="150"> | <img src="garmin/docs/screenshots/big-open.png" width="150"> | <img src="garmin/docs/screenshots/big-cut.png" width="150"> | <img src="garmin/docs/screenshots/list.png" width="150"> | <img src="garmin/docs/screenshots/about.png" width="150"> |

---

## Garmin watch app

At the saw both hands are busy, so the next angle lives on the wrist:

1. Select holds on the website and press **⌚ Send to watch** (or tick them on the watch).
2. Open **BIG MODE**: one angle per screen, set-up on top, hold name below.
3. Set the saw, cut, press **START**: the screen turns green, the watch buzzes
   once and jumps to the next open angle by itself.
4. A skipped angle turns red and the press that skipped it buzzes twice.
5. Progress is saved on the watch; without the phone it works on its last copy.

Details, buttons, build and sideload: [`garmin/README.md`](garmin/README.md).

---

## Security

Security headers are configured in [`vercel.json`](vercel.json): CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.

Known limitations:

- Seeded passwords must be supplied through env; `password = username` is opt-in only via `ALLOW_WEAK_SEED_PASSWORDS=true`.
- `/api/login` is rate-limited by a shared Neon-backed throttle (per IP + username, 15-min window); it fails open if the throttle store is unavailable.
- Public catalog read is intentional; admin writes and history require a valid session.
- `POST /api/watch` (Send to watch) is public like the catalog read: it only stores hold names that exist in the catalog (max 200), but anyone with the URL can overwrite the watch selection. Acceptable while one person uses the watch; tracked as D15 in `SECURITY_DEBT.md`.
- Secrets stay server-side only (`DATABASE_URL`, `SESSION_SECRET`).

Current docs: [`THREAT_MODEL.md`](THREAT_MODEL.md), [`SECURITY_DEBT.md`](SECURITY_DEBT.md), [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md).

Historical pre-backend audit: [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md).

Vulnerability reporting: see [`SECURITY.md`](SECURITY.md) — do not open public issues for security problems.

---

## Roadmap

Full detail in [`docs/ROADMAP.md`](docs/ROADMAP.md).

- **v1.5 — current stable.** Shared Neon backend, server-verified admin
  sessions, audit log, change notifications, responsive UI polish. All gates
  green.
- **v1.6 — stabilization / UX polish / bug fixes.** Smoother `409` recovery
  (auto-refresh revision), documented setup gotchas, scheduled `login_attempts`
  pruning.
- **v2.0 — architectural expansion.** Cover/drawing images to blob storage,
  self-service password rotation / external identity, real stale-save merge,
  repo branch protection.

---

## Known Limitations

General product and operational limitations. Security-specific risks and
trade-offs are covered in [Security](#security) above.

- **Online-only.** Without a reachable backend the app shows a no-connection
  retry screen; the shared catalog is never the source of truth in the browser.
- **Manual `409` recovery.** A stale-revision save keeps the draft but requires
  a manual reload before retrying (planned for v1.6).
- **Image payload size.** Cover/drawing images are base64 inside the catalog
  JSON, so runtime payload is dominated by image data (planned for v2.0).
- **Internal-network deployment.** Angles targets a trusted internal workshop
  network rather than open public exposure; see [`SECURITY_DEBT.md`](SECURITY_DEBT.md).

---

## Maintainer Notes

- **Quality gates** are `npm run lint`, `npm test`, `npm run build`,
  `npm run audit` — all enforced in CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
  and required before merging. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Secrets are server-only** (`DATABASE_URL`, `SESSION_SECRET`, seed passwords)
  and must never use a `VITE_` prefix. Database dumps must stay out of the repo
  ([`docs/OPERATIONS.md`](docs/OPERATIONS.md)).
- **Most common real failure is operational**, not code — a missing env var or
  un-run `db:setup` surfaces as the no-connection screen. Preview deploys lack
  `SESSION_SECRET` (Production-only).
- **Mobile CSS is fragile** (`!important` media-query overrides); verify on a
  narrow viewport after layout changes.
- Workshop context (MAIN / STEFAN, cuts above 45°): [`docs/CUTTING.md`](docs/CUTTING.md).
- Backup/restore: [`docs/OPERATIONS.md`](docs/OPERATIONS.md). Architecture:
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Dev setup:
  [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

---

## License

Proprietary — all rights reserved. This is an internal workshop tool and is not
licensed for external use, redistribution, or modification without permission
from the maintainer. See [`LICENSE`](LICENSE).
