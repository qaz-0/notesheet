<script lang="ts">
    import svelteLogo from './assets/svelte.svg'
    import Table from './lib/Table.svelte'
    import plusIcon from './assets/square-plus.svg'
    import type { Table as TableMeta } from './lib/types'
    import { getAllTableMetadata, createTable, deleteTable, resetDB } from './lib/db';
    import TableCreationDialog from './lib/TableCreationDialog.svelte';

    let tables: TableMeta[] = $state([]);
    let showCreateDialog = $state(false);

    function openAddTableDialog() {
        showCreateDialog = true;
    }

    async function handleCreateRequested(details: Omit<TableMeta, 'fields'>) {
        const { name, color, secondaryColor } = details;
        const tableMeta: TableMeta = {
            name,
            color,
            secondaryColor,
            fields: ["c", "date", "item", "note"], // Default fields for now
        };
        try {
            const newTable = await createTable(tableMeta);
            tables.push(newTable);
        } catch (error) {
            console.error("Failed to create table:", error);
            alert(`Failed to create table: ${error}`);
        }
    }

    function handleDialogClosed() {
        showCreateDialog = false;
    }

    getAllTableMetadata().then((tablesMeta) => {
        console.log(tablesMeta)
        tables = tablesMeta
    });
</script>

<main>
    <div class="tables">
        {#each tables as table}
            <Table {table}></Table>
        {/each}
        <div class="add-table-container">
            <button class="add-table" onclick={openAddTableDialog}><img src={plusIcon} alt="add table"></button>
        </div>
    </div>

    {#if showCreateDialog}
        <TableCreationDialog
            onCreateRequested={handleCreateRequested}
            onClose={handleDialogClosed}
        />
    {/if}
</main>