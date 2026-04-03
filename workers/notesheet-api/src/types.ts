// Shared types for the notesheet API

export interface Env {
  DB: D1Database;
  // TOKENS: KVNamespace; // Uncomment when KV is set up
}

export interface AuthContext {
  accountId: string;
  deviceId: string;
}

export interface SyncAction {
  action: string;
  args: unknown[];
  timestamp: number;
  deviceId: string;
  vectorClock: Record<string, number>;
  serverSeq?: number;
}

export interface DeviceRegistrationRequest {
  deviceId: string;
  name?: string;
}

export interface DeviceRegistrationResponse {
  token: string;
  accountId: string;
}

export interface SyncRequest {
  actions: SyncAction[];
  lastServerSeq: number;
}

export interface SyncResponse {
  accepted: number[];
  newActions: SyncAction[];
  latestServerSeq: number;
}

export interface PairRequest {
  code: string;
}

export interface LinkResponse {
  code: string;
  expiresAt: number;
}

// Database row types
export interface AccountRow {
  id: string;
  created_at: number;
  email: string | null;
}

export interface DeviceRow {
  id: string;
  account_id: string;
  token_hash: string;
  name: string | null;
  last_seen: number;
  created_at: number;
}

export interface ActionRow {
  server_seq: number;
  account_id: string;
  device_id: string;
  action_type: string;
  action_args: string;
  client_timestamp: number;
  vector_clock: string;
  created_at: number;
}

export interface PairingCodeRow {
  code: string;
  account_id: string;
  expires_at: number;
}
