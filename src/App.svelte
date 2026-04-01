<script lang="ts">
    import svelteLogo from './assets/svelte.svg'
    import Table from './lib/Table.svelte'
    import plusIcon from './assets/square-plus.svg'
    import type { Table as TableMeta } from './lib/types'
    import { getAllTableMetadata, exportDataToJson } from './lib/db';
    import TableCreationDialog from './lib/TableCreationDialog.svelte';
    import PwaReloadPrompt from './lib/PwaReloadPrompt.svelte';
    import { setContext } from 'svelte';
    import { actionManager } from "./lib/actions";
    import { CreateTableAction, ImportDataFromJsonAction } from './lib/actionTypes';

    let tables: TableMeta[] = $state([]);
    let historyTable: TableMeta | null = $state(null);
    let showCreateDialog = $state(false);
    let fileInput: HTMLInputElement;
    let tableCount = $state({ value: 0 });
    let reloadToken = $state(0);

    setContext('tableCount', () => tableCount);

    function openAddTableDialog() {
        showCreateDialog = true;
    }

    async function handleImportClick() {
        fileInput.click();
    }

    async function handleFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const reader = new FileReader();
            reader.onload = async (e) => {
                const jsonString = e.target?.result as string;
                try {
                    const importAction = new ImportDataFromJsonAction(jsonString);
                    actionManager.executeAction(importAction);
                    window.location.reload();
                } catch (error) {
                    console.error("Import failed:", error);
                    alert("Import failed.");
                }
            };
            reader.readAsText(file);
        }
    }

    async function handleCreateRequested(details: Omit<TableMeta, 'fields'>) {
        const { name, color, secondaryColor } = details;

        const isHistoryTable = name.toLowerCase() === 'history';

        let table: TableMeta | null = null;
        if (isHistoryTable) {
            let tablesMeta = await getAllTableMetadata();
            if (tablesMeta.find((t) => t.name.toLowerCase() === "history") == undefined) {
                table = {
                    name,
                    color,
                    secondaryColor,
                    fields: [
                        { "name": "date", "size": 100 },
                        { "name": "item", "size": 100 },
                        { "name": "note", "size": 100 }
                    ]
                }
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
                    { id: "c", "name": "c", "size": 100 },
                    { "name": "date", "size": 100 },
                    { "name": "item", "size": 100 },
                    { "name": "note", "size": 100 }
                ],
            };
        }

        try {
            if (table !== null) {
                const createTableAction = new CreateTableAction(table);
                let newTable = await actionManager.executeAction(createTableAction);
                if (isHistoryTable) {
                    historyTable = newTable;
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
        const tablesMeta = await getAllTableMetadata();

        // Reset table count
        tableCount.value = 0;

        // Find and separate history table
        const filtered = tablesMeta.filter(table => {
            if (table.name.toLowerCase() === 'history') {
                historyTable = table;
                return false;
            }
            return true;
        });

        tables = filtered;
        reloadToken++;
    }

    async function onKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape' && showCreateDialog) {
            handleDialogClosed();
        } else if (event.key === 'z' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            console.log("undo");
            await actionManager.undo();
            await loadTables();
        } else if (event.key === 'y' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            console.log("redo");
            await actionManager.redo();
            await loadTables();
        }
    }

    window.onkeydown = onKeydown;

    actionManager.setUpdateCallback(loadTables);

    loadTables();

</script>

<main>
    <PwaReloadPrompt/>
    <div class="app-controls">
        <button class="menu" onclick={exportDataToJson}>Export</button>
        <button class="menu" onclick={handleImportClick}>Import</button>
        <input type="file" accept=".json" style="display: none;" bind:this={fileInput} onchange={handleFileSelected} />
    </div>
    <div class="tables">
        {#each tables as table (Number(table.id))}
        <!-- {#each tables as table (Number(table.id))} -->
            <Table {table} {reloadToken}></Table>
        {/each}
        {#if historyTable && tableCount.value == tables.length}
            <Table table={historyTable} {reloadToken}></Table>
        {/if}
        <div class="add-table-container">
            <div class="add-table">
                <button onclick={openAddTableDialog}><img src={plusIcon} alt="add table"></button>
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