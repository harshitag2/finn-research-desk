CREATE TABLE IF NOT EXISTS finn_monitor_config (owner TEXT PRIMARY KEY NOT NULL, config_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS finn_monitor_events (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, ticker TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL, first_seen_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'new');
CREATE INDEX IF NOT EXISTS finn_events_owner_date ON finn_monitor_events(owner, first_seen_at);
CREATE TABLE IF NOT EXISTS finn_monitor_runs (id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL, status TEXT NOT NULL, items_count INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE INDEX IF NOT EXISTS finn_runs_owner_date ON finn_monitor_runs(owner, started_at);
CREATE TABLE IF NOT EXISTS finn_monitor_locks (owner TEXT PRIMARY KEY NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS finn_monitor_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
