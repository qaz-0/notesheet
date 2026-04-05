<script lang="ts">
  import svelteLogo from "./assets/svelte.svg";
  import Table from "./lib/Table.svelte";
  import TimeSensitiveTable from "./lib/TimeSensitiveTable.svelte";
  import plusIcon from "./assets/square-plus.svg";
  import type { Table as TableMeta } from "./lib/types";
  import { getAllTableMetadata, exportDataToJson } from "./lib/db";
  import TableCreationDialog from "./lib/TableCreationDialog.svelte";
  import SyncStatus from "./lib/SyncStatus.svelte";
  import DevicePairing from "./lib/DevicePairing.svelte";
  import MainMenu from "./lib/MainMenu.svelte";
  import Icon from "./lib/Icon.svelte";
  import { setContext, onMount, onDestroy, tick } from "svelte";
  import { actionManager } from "./lib/actions";
  import {
    CreateTableAction,
    ImportDataFromJsonAction,
  } from "./lib/actionTypes";
  import ShapeGrid from "./lib/ShapeGrid.svelte";
  import { initializeSyncManager, type SyncManager } from "./lib/sync";
  import MarkdownPreviewPopup from "./lib/MarkdownPreviewPopup.svelte";

  let tables: TableMeta[] = $state([]);
  let historyTable: TableMeta | null = $state(null);
  let timeSensitiveTable: TableMeta | null = $state(null);
  let showCreateDialog = $state(false);
  let showPairingDialog = $state(false);
  let fileInput: HTMLInputElement;
  let reloadToken = $state(0);

  // Undo/Redo state
  let canUndo = $state(false);
  let canRedo = $state(false);

  function updateUndoRedoState() {
    canUndo = actionManager.canUndo();
    canRedo = actionManager.canRedo();
  }

  // Sync manager - configure API URL here
  // For local dev: 'http://localhost:8787'
  // For production: 'https://notesheet-api.nitbit.workers.dev'
  const SYNC_API_URL = "https://notesheet-api.nitbit.workers.dev";
  let syncManager: SyncManager | null = $state(null);
  let syncEnabled = $state(true);

  function toggleSync() {
    syncEnabled = !syncEnabled;
    localStorage.setItem("syncEnabled", String(syncEnabled));
    if (syncManager) {
      if (syncEnabled) {
        syncManager.start(5000);
      } else {
        syncManager.stop();
      }
    }
  }

  // Initialize sync and PWA prompt on mount
  let deferredPrompt = $state<any>(null);

  onMount(() => {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
    });

    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
    });

    syncEnabled = localStorage.getItem("syncEnabled") !== "false";
    syncManager = initializeSyncManager(SYNC_API_URL);
    actionManager.setSyncManager(syncManager);

    if (syncEnabled) {
      syncManager.start(5000); // Sync every 30 seconds
    }
  });

  onDestroy(() => {
    if (syncManager) {
      syncManager.stop();
    }
  });

  function openAddTableDialog() {
    showCreateDialog = !showCreateDialog;
  }

  function handleFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = async (e) => {
        const jsonString = e.target?.result as string;
        try {
          const importAction = new ImportDataFromJsonAction(jsonString);
          await actionManager.executeAction(importAction);
          window.location.reload();
        } catch (error) {
          console.error("Import failed:", error);
          alert("Import failed.");
        }
      };
      reader.readAsText(file);
    }
  }

  function handleImportClick() {
    fileInput.click();
  }

  async function handleCreateRequested(details: Omit<TableMeta, "fields">) {
    const { name, color, secondaryColor } = details;

    const isHistoryTable = name.toLowerCase() === "history";

    let table: TableMeta | null = null;
    if (isHistoryTable) {
      let tablesMeta = await getAllTableMetadata();
      if (
        tablesMeta.find((t) => t.name.toLowerCase() === "history") == undefined
      ) {
        table = {
          name,
          color,
          secondaryColor,
          fields: [
            { name: "date", size: 100 },
            { name: "item", size: 100 },
            { name: "note", size: 100 },
          ],
        };
      } else {
        alert("History table already exists");
        return;
      }
    } else {
      table = {
        name,
        color,
        secondaryColor,
        fields: [
          { id: "c", name: "c", size: 100 },
          { name: "date", size: 160 },
          { name: "item", size: 300 },
          { name: "note", size: 300 },
        ],
      };
    }

    const isTimeSensitiveTable = name.toLowerCase() === "time sensitive";

    try {
      if (table !== null) {
        if (isTimeSensitiveTable) {
          // Time sensitive tables have a location field and user-added fields
          let tablesMeta = await getAllTableMetadata();
          if (
            tablesMeta.find((t) => t.name.toLowerCase() === "time sensitive")
          ) {
            alert("Time Sensitive table already exists");
            return;
          }
          table = {
            name,
            color,
            secondaryColor,
            fields: [
              { id: "c", name: "c", size: 100 },
              { name: "date", size: 330 },
              { name: "item", size: 300 },
              { name: "note", size: 300 },
              { id: "l", name: "l", size: 150 },
            ],
          };
        }

        const createTableAction = new CreateTableAction(table);
        let newTable = await actionManager.executeAction(createTableAction);
        if (isHistoryTable) {
          historyTable = newTable;
        } else if (isTimeSensitiveTable) {
          timeSensitiveTable = newTable;
        } else {
          tables.push(newTable);
        }
      }
    } catch (error) {
      console.error("Failed to create table:", error);
      alert(`Failed to create table: ${error}`);
    }
  }

  function handleDialogClosed() {
    showCreateDialog = false;
  }

  async function loadTables() {
    console.log("load tables");
    const tablesMeta = await getAllTableMetadata();

    // Find and separate special tables
    const filtered = tablesMeta.filter((table) => {
      if (table.name.toLowerCase() === "history") {
        historyTable = table;
        return false;
      }
      if (table.name.toLowerCase() === "time sensitive") {
        timeSensitiveTable = table;
        return false;
      }
      return true;
    });

    tables = filtered;
    reloadToken++;
    updateUndoRedoState();
  }

  async function handleUndo() {
    await actionManager.undo();
    // Flush updates immediately to sync UI with database
    await actionManager.flushUpdates();
  }

  async function handleRedo() {
    await actionManager.redo();
    // Flush updates immediately to sync UI with database
    await actionManager.flushUpdates();
  }

  async function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (showCreateDialog) handleDialogClosed();
      if (showPairingDialog) showPairingDialog = false;
    } else if (
      event.key === "z" &&
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey
    ) {
      if (
        !(document.activeElement instanceof HTMLElement) ||
        document.activeElement.hasAttribute("contenteditable")
      )
        return;
      // Ctrl+Shift+Z = Redo (check before Ctrl+Z)
      event.preventDefault();
      document.activeElement.blur();
      // Allow the setTimeout blur handler to flush any actively edited cell
      await new Promise((r) => setTimeout(r, 10));
      await handleRedo();
    } else if (event.key === "z" && (event.metaKey || event.ctrlKey)) {
      // Ctrl+Z = Undo
      if (
        !(document.activeElement instanceof HTMLElement) ||
        document.activeElement.hasAttribute("contenteditable")
      )
        return;

      event.preventDefault();
      document.activeElement.blur();
      await new Promise((r) => setTimeout(r, 10));
      await handleUndo();
    } else if (event.key === "y" && (event.metaKey || event.ctrlKey)) {
      if (
        !(document.activeElement instanceof HTMLElement) ||
        document.activeElement.hasAttribute("contenteditable")
      )
        return;
      // Ctrl+Y = Redo (Windows convention)
      event.preventDefault();
      document.activeElement.blur();
      await new Promise((r) => setTimeout(r, 10));
      await handleRedo();
    }
  }

  window.onkeydown = onKeydown;

  function handleNavigateToItem(tableId: IDBValidKey, rowId: number) {
    // Find the table container for the source table and scroll the row into view
    const allContainers = Array.from(
      document.querySelectorAll(".table-container"),
    );
    for (const container of allContainers) {
      const tableEl = container.querySelector("table.table");
      if (!tableEl) continue;
      const row = tableEl.querySelector(
        `tbody tr[data-row="${rowId}"]`,
      ) as HTMLTableRowElement;
      if (!row) continue;
      // Verify this is the right table by checking if any row exists
      // We check the caption to match by table id
      const caption = tableEl.querySelector("caption span");
      if (!caption) continue;

      // Scroll into view
      row.scrollIntoView({ behavior: "smooth", block: "center" });

      // Flash highlight
      row.style.transition = "outline 0.15s ease";
      row.style.outline = "3px solid #f59e0b";
      setTimeout(() => {
        row.style.outline = "";
        setTimeout(() => (row.style.transition = ""), 300);
      }, 1500);

      // Try to focus the first editable cell
      const firstTd = row.querySelector("td") as HTMLTableCellElement;
      if (firstTd) firstTd.click();
      return;
    }
  }

  actionManager.setUpdateCallback(loadTables);

  loadTables();
</script>

<main>
  <div style="width: 100%; height: 100%; position: fixed">
    <ShapeGrid
      speed={0.1}
      squareSize={55}
      direction="diagonal"
      borderColor="#101620"
      hoverFillColor="#101620"
      shape="hexagon"
      hoverTrailAmount={0}
    />
  </div>
  <MarkdownPreviewPopup />
  <div class="app-controls">
    <MainMenu
      {syncEnabled}
      {toggleSync}
      {syncManager}
      onImport={handleImportClick}
      onPairing={() => (showPairingDialog = true)}
      {canUndo}
      {canRedo}
      {handleUndo}
      {handleRedo}
      {deferredPrompt}
    />
    <input
      type="file"
      accept=".json"
      style="display: none;"
      bind:this={fileInput}
      onchange={handleFileSelected}
    />
  </div>
  {#if showPairingDialog && syncManager}
    <DevicePairing {syncManager} onClose={() => (showPairingDialog = false)} />
  {/if}
  <div class="tables">
    {#each tables as table (Number(table.id))}
      <!-- {#each tables as table (Number(table.id))} -->
      <Table {table} {reloadToken}></Table>
    {/each}
    {#if historyTable}
      <Table table={historyTable} {reloadToken}></Table>
    {/if}
    {#if timeSensitiveTable}
      <TimeSensitiveTable
        table={timeSensitiveTable}
        {reloadToken}
        onNavigate={handleNavigateToItem}
      ></TimeSensitiveTable>
    {/if}
    <div class="add-table-container">
      <div class="add-table">
        <button
          class="add-table-btn"
          onclick={openAddTableDialog}
          title="Add Table"
        >
          <Icon name="plus" size={32} strokeWidth={3} />
        </button>
        {#if showCreateDialog}
          <TableCreationDialog
            onCreateRequested={handleCreateRequested}
            onClose={handleDialogClosed}
          />
        {/if}
      </div>
    </div>
  </div>
</main>
