-- Angles shared-backend schema (Phase 1). Idempotent: safe to run repeatedly.

CREATE TABLE IF NOT EXISTS users (
  username   TEXT PRIMARY KEY,
  pass_hash  TEXT NOT NULL,
  salt       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_state (
  id         INT PRIMARY KEY DEFAULT 1,
  data       JSONB NOT NULL,
  revision   BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_state_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS change_log (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  field      TEXT,
  old_value  TEXT,
  new_value  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS change_log_created_at_idx ON change_log (created_at DESC);

-- Distributed login throttle: one row per (ip:username) key, shared across
-- serverless instances. `reset_at` is the end of the current sliding window;
-- a request past it starts a fresh window.
CREATE TABLE IF NOT EXISTS login_attempts (
  key       TEXT PRIMARY KEY,
  fail_count INT NOT NULL DEFAULT 0,
  reset_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS login_attempts_reset_at_idx ON login_attempts (reset_at);

-- Last hold selection sent to the Garmin watch ("Send to watch" button).
-- Also created lazily by /api/watch on first use.
CREATE TABLE IF NOT EXISTS watch_selection (
  id      INT PRIMARY KEY DEFAULT 1,
  holds   JSONB NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT watch_selection_single_row CHECK (id = 1)
);

-- Key/value settings. `workshop_code` = { hash, salt, version } for operator
-- access; bumping `version` signs every operator device out.
-- Also created lazily by api/_lib/settingsStore.js.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stations (one per saw / operator), each with its own "Send to watch" job,
-- and the Garmin watches paired to them (only a SHA-256 of the watch token is
-- stored). Also created lazily by api/_lib/stationStore.js, which moves the
-- old single watch_selection row into a first station "Saw 1".
CREATE TABLE IF NOT EXISTS stations (
  id      SERIAL PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  holds   JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS watch_devices (
  token_hash   TEXT PRIMARY KEY,
  station_id   INT REFERENCES stations(id) ON DELETE SET NULL,
  label        TEXT,
  pair_code    TEXT,
  pair_expires TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS watch_devices_pair_code_idx ON watch_devices (pair_code);
