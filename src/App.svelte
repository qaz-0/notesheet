<script lang="ts">
  import svelteLogo from './assets/svelte.svg'
  import viteLogo from '/vite.svg'
  import Table from './lib/Table.svelte'
  import { createTable, getTableNames, deleteTable } from './lib/db';

  let tables: string[] = [];

  // Fetch table names on component initialization

  // deleteTable("todo");
  // console.log('a')
  // createTable("todo").then(()=>{
  //   console.log("created")
  // })
  getTableNames().then((names) => {
    tables = names;
    console.log("tables", tables)
  });
</script>

<main>
  {#each tables as table}
    <Table name={table}></Table>
  {/each}
</main>