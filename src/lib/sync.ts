// SyncManager - handles synchronization with the Cloudflare backend

import type {
  SyncAction,
  SyncState,
  SyncStatus,
  SyncResponse,
  DeviceRegistrationResponse,
  LinkResponse,
  PairResponse,
  FullSyncResponse,
} from "./syncTypes";
import {
  getSyncState,
  setSyncState,
  initializeSyncState,
  updateSyncState,
  getSyncQueue,
  setSyncQueue,
  addToSyncQueue,
  clearSyncedActions,
  markSyncAttempt,
  incrementVectorClock,
} from "./syncStorage";

// Default API URL - should be configured per environment
const DEFAULT_API_URL = "http://localhost:8787";

export class SyncManager {
  private state: SyncState;
  private apiUrl: string;
  private isOnline: boolean;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();
  private actionApplier: ((action: SyncAction) => Promise<void>) | null = null;
  private isEnabled: boolean = false;

  constructor(apiUrl: string = DEFAULT_API_URL) {
    this.apiUrl = apiUrl;
    this.state = initializeSyncState();
    this.isOnline = navigator.onLine;
    this.setupNetworkListeners();
  }

  // Getters
  get deviceId(): string {
    return this.state.deviceId;
  }

  get accountId(): string | null {
    return this.state.accountId;
  }

  get isAuthenticated(): boolean {
    return this.state.token !== null;
  }

  get vectorClock(): Record<string, number> {
    return { ...this.state.vectorClock };
  }

  // Set the function that applies remote actions to the local database
  setActionApplier(applier: (action: SyncAction) => Promise<void>): void {
    this.actionApplier = applier;
  }

  // Subscribe to status changes
  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatusChange(status: SyncStatus): void {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private getStatus(): SyncStatus {
    const queue = getSyncQueue();
    return {
      state: (!this.isEnabled || !this.isOnline) ? "offline" : "idle",
      pendingCount: queue.pending.length,
      lastSync: queue.lastAttempt || null,
      error: null,
    };
  }

  // Network status handling
  private setupNetworkListeners(): void {
    window.addEventListener("online", () => this.onOnline());
    window.addEventListener("offline", () => this.onOffline());
    document.addEventListener("visibilitychange", () => {
      if (this.isEnabled && document.visibilityState === "visible" && this.isOnline) {
        this.sync();
      }
    });
  }

  private onOnline(): void {
    this.isOnline = true;
    this.notifyStatusChange(this.getStatus());
    if (this.isEnabled) {
      this.sync();
    }
  }

  private onOffline(): void {
    this.isOnline = false;
    this.notifyStatusChange({
      ...this.getStatus(),
      state: "offline",
    });
  }

  // Start periodic sync
  start(intervalMs: number = 30000): void {
    this.isEnabled = true;
    this.notifyStatusChange(this.getStatus());

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      if (this.isOnline && this.isAuthenticated) {
        this.sync();
      }
    }, intervalMs);

    // Initial sync if authenticated
    if (this.isOnline && this.isAuthenticated) {
      this.sync();
    }
  }

  // Stop periodic sync
  stop(): void {
    this.isEnabled = false;
    this.notifyStatusChange(this.getStatus());
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Register this device with the server
  async registerDevice(): Promise<boolean> {
    if (this.isAuthenticated) {
      return true;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/auth/device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: this.state.deviceId,
          name: navigator.userAgent.slice(0, 100),
        }),
      });

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.statusText}`);
      }

      const data: DeviceRegistrationResponse = await response.json();

      this.state = updateSyncState({
        token: data.token,
        accountId: data.accountId,
      });

      return true;
    } catch (error) {
      console.error("Device registration error:", error);
      return false;
    }
  }

  // Generate a pairing code to link another device
  async generatePairingCode(): Promise<string | null> {
    if (!this.isAuthenticated) {
      const registered = await this.registerDevice();
      if (!registered) return null;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/auth/link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.state.token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to generate code: ${response.statusText}`);
      }

      const data: LinkResponse = await response.json();
      return data.code;
    } catch (error) {
      console.error("Pairing code generation error:", error);
      return null;
    }
  }

  // Pair this device with another account using a code
  async pairWithCode(code: string): Promise<boolean> {
    if (!this.isAuthenticated) {
      const registered = await this.registerDevice();
      if (!registered) return false;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/auth/pair`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.state.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: code.toUpperCase() }),
      });

      if (!response.ok) {
        throw new Error(`Failed to pair: ${response.statusText}`);
      }

      const data: PairResponse = await response.json();

      this.state = updateSyncState({
        accountId: data.accountId,
      });

      // Trigger full sync after pairing
      await this.fullSync();

      return true;
    } catch (error) {
      console.error("Pairing error:", error);
      return false;
    }
  }

  // Queue an action for sync
  async queueAction(action: SyncAction): Promise<void> {
    // Update vector clock
    const newClock = incrementVectorClock(this.state);
    this.state = updateSyncState({ vectorClock: newClock });

    // Add device ID and updated clock to action
    const enrichedAction: SyncAction = {
      ...action,
      deviceId: this.state.deviceId,
      vectorClock: newClock,
    };

    addToSyncQueue(enrichedAction);
    this.notifyStatusChange(this.getStatus());

    // Try to sync immediately if online
    if (this.isEnabled && this.isOnline && this.isAuthenticated) {
      this.sync();
    }
  }

  // Main sync method - push local actions, receive remote actions
  async sync(): Promise<boolean> {
    if (!this.isEnabled || !this.isOnline) {
      return false;
    }

    if (!this.isAuthenticated) {
      const registered = await this.registerDevice();
      if (!registered) return false;
    }

    this.notifyStatusChange({
      ...this.getStatus(),
      state: "syncing",
    });

    const queue = getSyncQueue();

    try {
      const response = await fetch(`${this.apiUrl}/api/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.state.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actions: queue.pending,
          lastServerSeq: this.state.lastServerSeq,
        }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }

      const data: SyncResponse = await response.json();

      // Clear successfully synced actions
      if (data.accepted.length > 0) {
        clearSyncedActions(data.accepted.length);
      }

      // Apply remote actions
      if (data.newActions.length > 0 && this.actionApplier) {
        for (const action of data.newActions) {
          try {
            await this.actionApplier(action);
          } catch (error) {
            console.error("Failed to apply remote action:", error);
          }
        }
      }

      // Update last known server sequence
      this.state = updateSyncState({
        lastServerSeq: data.latestServerSeq,
      });

      markSyncAttempt(true);
      this.notifyStatusChange(this.getStatus());

      return true;
    } catch (error) {
      console.error("Sync error:", error);
      markSyncAttempt(false);

      this.notifyStatusChange({
        ...this.getStatus(),
        state: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return false;
    }
  }

  // Full sync - for new devices or recovery
  async fullSync(): Promise<boolean> {
    if (!this.isEnabled || !this.isOnline) return false;

    if (!this.isAuthenticated) {
      const registered = await this.registerDevice();
      if (!registered) return false;
    }

    this.notifyStatusChange({
      ...this.getStatus(),
      state: "syncing",
    });

    try {
      const response = await fetch(`${this.apiUrl}/api/sync/full`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.state.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Full sync failed: ${response.statusText}`);
      }

      const data: FullSyncResponse = await response.json();

      // Apply all actions
      if (this.actionApplier) {
        for (const action of data.actions) {
          try {
            await this.actionApplier(action);
          } catch (error) {
            console.error("Failed to apply action during full sync:", error);
          }
        }
      }

      // Update last known server sequence
      this.state = updateSyncState({
        lastServerSeq: data.serverSeq,
      });

      markSyncAttempt(true);
      this.notifyStatusChange(this.getStatus());

      return true;
    } catch (error) {
      console.error("Full sync error:", error);
      markSyncAttempt(false);

      this.notifyStatusChange({
        ...this.getStatus(),
        state: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return false;
    }
  }
}

// Export singleton instance
let syncManagerInstance: SyncManager | null = null;

export function getSyncManager(apiUrl?: string): SyncManager {
  if (!syncManagerInstance) {
    syncManagerInstance = new SyncManager(apiUrl);
  }
  return syncManagerInstance;
}

export function initializeSyncManager(apiUrl?: string): SyncManager {
  syncManagerInstance = new SyncManager(apiUrl);
  return syncManagerInstance;
}
