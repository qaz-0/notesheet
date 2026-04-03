// Sync types for client-side sync infrastructure

export interface SyncAction {
  action: string;
  args: unknown[];
  timestamp: number;
  deviceId: string;
  vectorClock: Record<string, number>;
  serverSeq?: number;
}

export interface SyncState {
  deviceId: string;
  accountId: string | null;
  token: string | null;
  lastServerSeq: number;
  vectorClock: Record<string, number>;
}

export interface SyncQueue {
  pending: SyncAction[];
  lastAttempt: number;
  failCount: number;
}

export interface SyncStatus {
  state: "idle" | "syncing" | "offline" | "error";
  pendingCount: number;
  lastSync: number | null;
  error: string | null;
}

export interface SyncResponse {
  accepted: number[];
  newActions: SyncAction[];
  latestServerSeq: number;
}

export interface DeviceRegistrationResponse {
  token: string;
  accountId: string;
}

export interface LinkResponse {
  code: string;
  expiresAt: number;
}

export interface PairResponse {
  accountId: string;
  message: string;
}

export interface FullSyncResponse {
  actions: SyncAction[];
  serverSeq: number;
}
