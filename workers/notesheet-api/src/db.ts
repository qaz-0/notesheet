// Database helper functions

import type {
  Env,
  AccountRow,
  DeviceRow,
  ActionRow,
  PairingCodeRow,
} from "./types";

// Simple hash function for tokens (in production, use a proper hash)
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate random ID
export function generateId(): string {
  return crypto.randomUUID();
}

// Generate random token
export function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate 6-character alphanumeric pairing code
export function generatePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluded confusing chars: 0,O,1,I
  let code = "";
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (let i = 0; i < 6; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

// Account operations
export async function createAccount(db: D1Database): Promise<AccountRow> {
  const id = generateId();
  const now = Date.now();

  await db
    .prepare("INSERT INTO accounts (id, created_at) VALUES (?, ?)")
    .bind(id, now)
    .run();

  return { id, created_at: now, email: null };
}

export async function getAccountById(
  db: D1Database,
  id: string,
): Promise<AccountRow | null> {
  const result = await db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .bind(id)
    .first<AccountRow>();

  return result ?? null;
}

// Device operations
export async function createDevice(
  db: D1Database,
  deviceId: string,
  accountId: string,
  tokenHash: string,
  name?: string,
): Promise<DeviceRow> {
  const now = Date.now();

  await db
    .prepare(
      "INSERT INTO devices (id, account_id, token_hash, name, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(deviceId, accountId, tokenHash, name ?? null, now, now)
    .run();

  return {
    id: deviceId,
    account_id: accountId,
    token_hash: tokenHash,
    name: name ?? null,
    last_seen: now,
    created_at: now,
  };
}

export async function getDeviceByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<DeviceRow | null> {
  const result = await db
    .prepare("SELECT * FROM devices WHERE token_hash = ?")
    .bind(tokenHash)
    .first<DeviceRow>();

  return result ?? null;
}

export async function updateDeviceLastSeen(
  db: D1Database,
  deviceId: string,
): Promise<void> {
  await db
    .prepare("UPDATE devices SET last_seen = ? WHERE id = ?")
    .bind(Date.now(), deviceId)
    .run();
}

export async function updateDeviceAccount(
  db: D1Database,
  deviceId: string,
  newAccountId: string,
): Promise<void> {
  await db
    .prepare("UPDATE devices SET account_id = ? WHERE id = ?")
    .bind(newAccountId, deviceId)
    .run();
}

// Action operations
export async function insertAction(
  db: D1Database,
  accountId: string,
  deviceId: string,
  actionType: string,
  actionArgs: unknown[],
  clientTimestamp: number,
  vectorClock: Record<string, number>,
): Promise<number> {
  const now = Date.now();

  const result = await db
    .prepare(
      `INSERT INTO actions (account_id, device_id, action_type, action_args, client_timestamp, vector_clock, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      accountId,
      deviceId,
      actionType,
      JSON.stringify(actionArgs),
      clientTimestamp,
      JSON.stringify(vectorClock),
      now,
    )
    .run();

  return result.meta.last_row_id as number;
}

export async function getActionsSince(
  db: D1Database,
  accountId: string,
  sinceServerSeq: number,
  excludeDeviceId?: string,
): Promise<ActionRow[]> {
  let query = "SELECT * FROM actions WHERE account_id = ? AND server_seq > ?";
  const bindings: (string | number)[] = [accountId, sinceServerSeq];

  if (excludeDeviceId) {
    query += " AND device_id != ?";
    bindings.push(excludeDeviceId);
  }

  query += " ORDER BY server_seq ASC";

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all<ActionRow>();
  return result.results;
}

export async function getAllActions(
  db: D1Database,
  accountId: string,
): Promise<ActionRow[]> {
  const result = await db
    .prepare(
      "SELECT * FROM actions WHERE account_id = ? ORDER BY server_seq ASC",
    )
    .bind(accountId)
    .all<ActionRow>();

  return result.results;
}

export async function getLatestServerSeq(
  db: D1Database,
  accountId: string,
): Promise<number> {
  const result = await db
    .prepare("SELECT MAX(server_seq) as seq FROM actions WHERE account_id = ?")
    .bind(accountId)
    .first<{ seq: number | null }>();

  return result?.seq ?? 0;
}

// Pairing code operations
export async function createPairingCode(
  db: D1Database,
  accountId: string,
): Promise<string> {
  const code = generatePairingCode();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  await db
    .prepare(
      "INSERT INTO pairing_codes (code, account_id, expires_at) VALUES (?, ?, ?)",
    )
    .bind(code, accountId, expiresAt)
    .run();

  return code;
}

export async function getPairingCode(
  db: D1Database,
  code: string,
): Promise<PairingCodeRow | null> {
  const result = await db
    .prepare("SELECT * FROM pairing_codes WHERE code = ? AND expires_at > ?")
    .bind(code, Date.now())
    .first<PairingCodeRow>();

  return result ?? null;
}

export async function deletePairingCode(
  db: D1Database,
  code: string,
): Promise<void> {
  await db.prepare("DELETE FROM pairing_codes WHERE code = ?").bind(code).run();
}

export async function cleanupExpiredPairingCodes(
  db: D1Database,
): Promise<void> {
  await db
    .prepare("DELETE FROM pairing_codes WHERE expires_at < ?")
    .bind(Date.now())
    .run();
}

// Merge accounts (when pairing devices)
export async function mergeAccounts(
  db: D1Database,
  sourceAccountId: string,
  targetAccountId: string,
): Promise<void> {
  // Move all devices from source to target
  await db
    .prepare("UPDATE devices SET account_id = ? WHERE account_id = ?")
    .bind(targetAccountId, sourceAccountId)
    .run();

  // Move all actions from source to target
  await db
    .prepare("UPDATE actions SET account_id = ? WHERE account_id = ?")
    .bind(targetAccountId, sourceAccountId)
    .run();

  // Delete the source account
  await db
    .prepare("DELETE FROM accounts WHERE id = ?")
    .bind(sourceAccountId)
    .run();
}
