-- Notesheet Sync Database Schema
-- Accounts (one per user, shared across linked devices)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  email TEXT UNIQUE
);
-- Devices linked to accounts
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  name TEXT,
  last_seen INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_devices_account ON devices(account_id);
CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(token_hash);
-- Action log (append-only sync log)
CREATE TABLE IF NOT EXISTS actions (
  server_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_args TEXT NOT NULL,
  client_timestamp INTEGER NOT NULL,
  vector_clock TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_actions_account_seq ON actions(account_id, server_seq);
-- Pairing codes (ephemeral, for linking devices)
CREATE TABLE IF NOT EXISTS pairing_codes (
  code TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_codes(expires_at);