// Local storage helpers for sync state persistence

import type { SyncState, SyncQueue, SyncAction } from "./syncTypes";

const SYNC_STATE_KEY = "notesheet_sync_state";
const SYNC_QUEUE_KEY = "notesheet_sync_queue";

// Generate a UUID for device identification
export function generateDeviceId(): string {
  return crypto.randomUUID();
}

// Sync State operations
export function getSyncState(): SyncState | null {
  try {
    const data = localStorage.getItem(SYNC_STATE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function setSyncState(state: SyncState): void {
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
}

export function initializeSyncState(): SyncState {
  let state = getSyncState();

  if (!state) {
    state = {
      deviceId: generateDeviceId(),
      accountId: null,
      token: null,
      lastServerSeq: 0,
      vectorClock: {},
    };
    setSyncState(state);
  }

  return state;
}

export function updateSyncState(updates: Partial<SyncState>): SyncState {
  const current = getSyncState() || initializeSyncState();
  const updated = { ...current, ...updates };
  setSyncState(updated);
  return updated;
}

export function clearSyncState(): void {
  localStorage.removeItem(SYNC_STATE_KEY);
}

// Sync Queue operations
export function getSyncQueue(): SyncQueue {
  try {
    const data = localStorage.getItem(SYNC_QUEUE_KEY);
    return data
      ? JSON.parse(data)
      : { pending: [], lastAttempt: 0, failCount: 0 };
  } catch {
    return { pending: [], lastAttempt: 0, failCount: 0 };
  }
}

export function setSyncQueue(queue: SyncQueue): void {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

export function addToSyncQueue(action: SyncAction): void {
  const queue = getSyncQueue();
  queue.pending.push(action);
  setSyncQueue(queue);
}

export function clearSyncedActions(count: number): void {
  const queue = getSyncQueue();
  queue.pending = queue.pending.slice(count);
  queue.failCount = 0;
  queue.lastAttempt = Date.now();
  setSyncQueue(queue);
}

export function markSyncAttempt(success: boolean): void {
  const queue = getSyncQueue();
  queue.lastAttempt = Date.now();
  if (success) {
    queue.failCount = 0;
  } else {
    queue.failCount++;
  }
  setSyncQueue(queue);
}

export function clearSyncQueue(): void {
  localStorage.removeItem(SYNC_QUEUE_KEY);
}

// Vector clock operations
export function incrementVectorClock(state: SyncState): Record<string, number> {
  const clock = { ...state.vectorClock };
  clock[state.deviceId] = (clock[state.deviceId] || 0) + 1;
  return clock;
}
