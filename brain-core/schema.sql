-- D1: logs and history for the brain core. Real events only; no synthetic rows.
-- Content of user messages/answers is NOT stored by default — only digests,
-- engine and verification outcome (policy:LOG_CONTENT=1 can enable full rows).

CREATE TABLE IF NOT EXISTS requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,              -- unix ms
  key_id     TEXT    NOT NULL,             -- key record id (never the raw key)
  user_id    INTEGER NOT NULL,             -- owner = 1, same system for everyone
  project    TEXT    NOT NULL,
  kind       TEXT    NOT NULL,             -- chat | compute | state | health
  engine     TEXT    NOT NULL,             -- model-vps | mistral-backup | core | none
  http       INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  queue_ms   INTEGER NOT NULL DEFAULT 0,
  verified   INTEGER NOT NULL DEFAULT 0,
  err_code   TEXT,
  script     TEXT                          -- detected dominant Unicode script
);
CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts);
CREATE INDEX IF NOT EXISTS idx_requests_key ON requests(key_id, ts);

CREATE TABLE IF NOT EXISTS history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ts               INTEGER NOT NULL,
  key_id           TEXT    NOT NULL,
  project          TEXT    NOT NULL,
  request_digest   TEXT    NOT NULL,       -- sha256 of the user text
  response_digest  TEXT    NOT NULL,       -- sha256 of the accepted answer
  engine           TEXT    NOT NULL,
  verified         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_history_key ON history(key_id, ts);
