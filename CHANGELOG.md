# Changelog

All notable changes to this project are documented here. This project loosely
follows [Semantic Versioning](https://semver.org/).

## v2.0 — access, stations, storage

### Added
- **Workshop access.** `GET /api/state` (and images, stations, watch catalog)
  needs an admin session or a workshop-code device. Operators enter the code
  once; the `angles_access` cookie lasts 30 days and is signed with a key
  derived from `SESSION_SECRET`, so it can never pass as an admin session.
  Setting a new code signs every operator device out.
- **First run.** With no admin in the database the app shows *Welcome to
  Angles*: create the admin and the workshop code (needs `SETUP_TOKEN` on
  Vercel). An admin with an empty catalog gets a short guide: holds, angles,
  drawings, SAVE.
- **ADMIN → SETTINGS:** workshop code, own password, images, stations and
  watches. Password and code changes are logged in HISTORY.
- **Stations.** One job per saw or operator; ⌚ asks which station. The old
  single watch selection becomes station *Saw 1*.
- **Watch pairing.** Watches identify themselves with a token they generate;
  the server stores only its SHA-256. A 6-digit code (15 min) pairs a watch to
  a station; admins can move or unpair watches. Pairing requests and wrong
  codes are throttled.
- **Garmin app 1.2:** PAIR WATCH screen with the code and automatic polling,
  station name under FROM PHONE, empty bundled catalog (`build-catalog.mjs`
  now reads an admin EXPORT).
- **Private image storage.** New covers and drawings go to a private Vercel
  Blob store and are served by `/api/images` after the same access check.
  SETTINGS → IMAGES moves existing ones; EXPORT puts them back inline.
- **Stale-save merge.** A save that hits `409` is merged three-way with the
  latest catalog; the admin is asked only when the same record changed on both
  sides.
- Docs: `docs/WATCH_SETUP.md`, `docs/MULTI_OPERATOR.md`, deploy / first run /
  upgrade in `docs/OPERATIONS.md`.

### Changed
- `POST /api/watch` without a session is gone (closes D15); the watch API is
  `GET /api/watch` with a paired token.
- Expired `login_attempts` rows are swept on successful sign-in (F5).
- Client IP for throttling prefers `x-vercel-forwarded-for`.
- `api/**/*.test.js` excluded from deployed functions (`.vercelignore`).

## Garmin app v1.1

### Added
- Auto-advance after a cut (BIG MODE and LIST): the angle stays green for
  0.7 s, then one short vibration and a jump to the next open angle. A second
  START skips the wait; moving by hand or leaving cancels it. With nothing open
  below, the jump goes back to the first missed angle.
- ALL DONE with one long vibration when the last angle is cut.
- ABOUT item on the holds screen: saw blade icon, version 1.1 and a short
  description. App version set in the manifest (`1.1.0`).
- Docs: `docs/CUTTING.md` (MAIN / STEFAN set-ups, cutting angles above 45°),
  web and watch screenshots, rewritten README and `garmin/README.md`.

### Changed
- Launcher icon: a saw blade with teeth instead of the angle sign
  (`garmin/tools/build-icon.py`).
- Repository renamed to `Angles-proto-garmin-app`.

## Unreleased

### Added
- Garmin watch app (`garmin/`, Connect IQ, Instinct 3 AMOLED 45mm): pick holds,
  BIG MODE (one large angle per screen), colored list (green = cut,
  red = missed), progress saved on the watch, separate RESET PROGRESS and
  RESET HOLDS (both ask for confirmation), double vibration when an angle
  is marked while an earlier one of the same saw is still open.
  Holds and LIST screens are custom-drawn (no Instinct 3 subscreen circle);
  new angle launcher icon.
- **Send to watch** button next to print on the main page.
- `GET/POST /api/watch`: compact catalog (~3.5 KB, no images) and the last
  selection sent to the watch; new `watch_selection` table.

### Changed
- Dependency updates to clear `npm audit` (vite, undici, browserslist,
  brace-expansion).

## v1.5

The shared-backend, multi-user milestone: the catalog moved from browser
`localStorage` to a shared Neon Postgres database behind same-origin Vercel
Functions, with server-verified admin sessions and an audit log.

### Added
- Shared catalog backend: public read via `GET /api/state`, authenticated
  admin write via `PUT /api/state`, stored in Neon Postgres as a single JSON
  document.
- Named admin users (`Tomek`, `Alessandro`, `Artsi`) seeded by
  `npm run db:setup` from explicit env passwords.
- httpOnly HMAC-signed session cookie for admin auth; server-side scrypt
  password hashes.
- Change history: `GET /api/history` plus an admin `HISTORY` view showing who
  changed what and when.
- Change notification toast when another user has updated the database.
- Distributed, Neon-backed login rate limiting (per IP + username, 15-minute
  window, fail-open).
- Backup & restore runbook (`docs/OPERATIONS.md`).
- CI workflow (`lint`, `test`, `build`, `npm audit`, gitleaks secret scan) and
  Dependabot config.

### Changed
- Translated the UI to English and reworked the admin layout.
- Catalog persistence moved off `localStorage` onto the shared database;
  optimistic concurrency enforced via an `app_state.revision` token.
- Mobile/responsive polish: full-width change-history view, narrower
  MAIN/STEFAN cards, collapsible mobile history rows, refined focus styling.
- Import accepts only raster image data URLs (SVG rejected); size caps applied
  before and after sanitization.

### Fixed
- v2 export/import: unwrap the `{ data }` envelope before version detection so
  v2 backups import correctly (guarded by a regression test).
- Bundler shebang crash: extracted seed-password logic out of the build path.
- Recovery toast copy that read as an unfinished sentence.
- Restored the keyboard `:focus-visible` ring and removed `document.write`
  usage in print (a11y / hardening).

### Known issues
- On a stale-revision (`409`) save the user must manually reload before
  retrying; the draft is kept but the revision is not auto-refreshed.
- The login throttle fails open if its store is unavailable, and is per-IP, so
  IP rotation still gets fresh attempts.
- Expired `login_attempts` rows are not pruned on a schedule (negligible at
  workshop scale).
- Cover/drawing images are base64 inside the catalog JSON, so payload size is
  dominated by image data at runtime.

See [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md) for a narrative summary and
[`docs/ROADMAP.md`](docs/ROADMAP.md) for what is planned next.
