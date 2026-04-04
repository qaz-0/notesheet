<script lang="ts">
  import { getTable, getTableMetadata } from "./db";
  import type { Item, Table, Field } from "./types";
  import Checkbox from "./Checkbox.svelte";
  import markdownit from "markdown-it";
  import { actionManager } from "./actions";
  import { EditItemAction, MarkAsDoneAction } from "./actionTypes";
  import { createTableEditor } from "./tableEditing";
  import BaseTable from "./BaseTable.svelte";
  import { isDateField, getDateTooltip, getDisplayValue } from "./tableUtils";
  import { getOriginalInput } from "./dateParser";

  let { table, reloadToken }: { table: Table; reloadToken: number } = $props();
  const tableId = table.id!;
  const md = markdownit();
  let tableData: (Item | null)[] = $state([]);
  let fields: Field[] = $state(table.fields);
  let fieldsKey = $state(0);
  let isEditing = $state(false);
  let checkboxIndex = table.fields.findIndex((f) => f.id == "c");
  let isHistory = table.name.toLowerCase() == "history";
  const ADDITIONAL_ROWS = isHistory ? 0 : 10;
  let isEditingCell = $state(false);
  let tableContainer = $state<HTMLElement>();

  // ─── Table editor (cell editing, navigation) ──────────────────────

  const { focusCell, editCell } = createTableEditor({
    tableId,
    getTableContainer: () => tableContainer,
    getFields: () => fields,
    setFields: (f) => {
      fields = f;
    },
    getCheckboxIndex: () => checkboxIndex,
    setIsEditingCell: (v) => {
      isEditingCell = v;
    },
    incrementFieldsKey: () => {
      fieldsKey++;
    },
  });

  // ─── Data loading ─────────────────────────────────────────────────

  async function loadTableData(token: number) {
    const tableMeta = await getTableMetadata(tableId);
    if (JSON.stringify(fields) !== JSON.stringify(tableMeta.fields)) {
      fields = tableMeta.fields;
      fieldsKey++;
    }
    const data = await getTable(tableId);
    checkboxIndex = fields.findIndex((f) => f.id == "c");

    // Phase 1: Delete items marked for deletion (c == 2)
    const itemsToDelete = data.filter((item) => item.c === 2);
    for (const item of itemsToDelete) {
      await actionManager.executeAction(new MarkAsDoneAction(tableId, item.id));
    }

    // Phase 2: Reload fresh data if any deletions occurred
    const freshData = itemsToDelete.length > 0 ? await getTable(tableId) : data;

    // Phase 3: Build display data
    let maxIndex = 0;
    if (freshData.length > 0) {
      maxIndex = (freshData[freshData.length - 1]?.id as number) ?? 0;
    }
    const newLength = maxIndex + ADDITIONAL_ROWS;

    const freshDataMap = new Map();
    for (const item of freshData) {
      if (item) freshDataMap.set(item.id, item);
    }

    if (tableData.length !== newLength) tableData.length = newLength;

    for (let i = 0; i < newLength; i++) {
      const freshItem = freshDataMap.get(i);
      const currentItem = tableData[i];

      if (!freshItem && !currentItem) continue;
      else if (freshItem && !currentItem) tableData[i] = { ...freshItem };
      else if (!freshItem && currentItem) tableData[i] = null;
      else if (freshItem && currentItem) {
        for (const key in currentItem) {
          if (!(key in freshItem)) delete currentItem[key];
        }
        for (const key in freshItem) {
          if (currentItem[key] !== freshItem[key])
            currentItem[key] = freshItem[key];
        }
      }
    }

    tableData = [...tableData];
    document.dispatchEvent(
      new CustomEvent("tableDataLoaded", { detail: tableId }),
    );
  }

  $effect(() => {
    loadTableData(reloadToken);
  });

  // ─── Click handlers ───────────────────────────────────────────────

  function handleHeaderClick(headerCell: HTMLTableCellElement) {
    if (isEditing) editCell(headerCell, true);
  }

  function handleBodyClick(bodyCell: HTMLTableCellElement) {
    if (bodyCell.parentElement?.hasAttribute("data-row")) {
      if (bodyCell.cellIndex === checkboxIndex) {
        focusCell(bodyCell);
      } else {
        editCell(bodyCell, false);
      }
    }
  }

  // ─── Checkbox ─────────────────────────────────────────────────────

  async function updateCheckboxState(checkbox: HTMLDivElement, state: number) {
    const row = checkbox.closest("tr");
    const rowNum = Number(row?.getAttribute("data-row"));
    if (row && !isNaN(rowNum)) {
      const newItem: Item = { id: rowNum, c: state };
      await actionManager.executeAction(new EditItemAction(tableId, newItem));
      await actionManager.flushUpdates();
    }
  }

  const zeroToOne = (el: HTMLDivElement) => updateCheckboxState(el, 1);
  const oneToTwo = (el: HTMLDivElement) => updateCheckboxState(el, 2);
  const twoToOne = (el: HTMLDivElement) => updateCheckboxState(el, 1);
  const oneToZero = (el: HTMLDivElement) => updateCheckboxState(el, 0);
  const twoToZero = (el: HTMLDivElement) => updateCheckboxState(el, 0);
</script>

<BaseTable
  {table}
  bind:fields
  {fieldsKey}
  bind:isEditing
  bind:tableContainer
  onHeaderClick={handleHeaderClick}
  onBodyClick={handleBodyClick}
>
  {#each tableData as row, i (i)}
    <tr data-row={i} data-k={row ? (row.k ?? row.k) : null}>
      {#each fields as field, j}
        {#if field.id === "c"}
          <td>
            <Checkbox
              initialState={row ? (row.c ?? 0) : 0}
              disabled={row ? false : true}
              color={table.color}
              {zeroToOne}
              {oneToTwo}
              {twoToOne}
              {oneToZero}
              {twoToZero}
            />
          </td>
        {:else if !field.id}
          <td
            data-tooltip={isDateField(field) ? getDateTooltip(row?.[j]) : null}
          >
            {#if row?.[j]?.endsWith("\nm")}
              {@html md.render(row[j]?.slice(0, -2) ?? "")}
            {:else}
              {@html getDisplayValue(row?.[j], field, (v) =>
                getOriginalInput(v),
              )}
            {/if}
          </td>
        {/if}
      {/each}
    </tr>
  {/each}
</BaseTable>
