<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { SyncManager } from "./sync";
  import type { SyncStatus } from "./syncTypes";

  let { syncManager }: { syncManager: SyncManager } = $props();

  let status = $state<SyncStatus>({
    state: "idle",
    pendingCount: 0,
    lastSync: null,
    error: null,
  });

  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = syncManager.onStatusChange((newStatus) => {
      status = newStatus;
    });
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  function getStatusIcon(): string {
    switch (status.state) {
      case "syncing":
        return "↻";
      case "offline":
        return "⚡";
      case "error":
        return "⚠";
      default:
        return "✓";
    }
  }

  function getStatusText(): string {
    switch (status.state) {
      case "syncing":
        return "Syncing...";
      case "offline":
        return `Offline (${status.pendingCount} pending)`;
      case "error":
        return "Sync error";
      default:
        return status.pendingCount > 0
          ? `${status.pendingCount} pending`
          : "Synced";
    }
  }

  async function handleClick() {
    if (status.state !== "syncing" && status.state !== "offline") {
      await syncManager.sync();
    }
  }
</script>

<button
  class="sync-status"
  data-state={status.state}
  onclick={handleClick}
  title={status.error || getStatusText()}
  disabled={status.state === "syncing" || status.state === "offline"}
>
  <span class="icon" class:spinning={status.state === "syncing"}>
    {getStatusIcon()}
  </span>
  <span class="text">{getStatusText()}</span>
</button>

<style>
  .sync-status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #333;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .sync-status:hover:not(:disabled) {
    background: #444;
  }

  .sync-status:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .sync-status[data-state="idle"] {
    border-color: #4a4;
  }

  .sync-status[data-state="syncing"] {
    border-color: #48f;
  }

  .sync-status[data-state="offline"] {
    border-color: #888;
  }

  .sync-status[data-state="error"] {
    border-color: #f44;
  }

  .icon {
    font-size: 14px;
  }

  .icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .text {
    white-space: nowrap;
  }
</style>
