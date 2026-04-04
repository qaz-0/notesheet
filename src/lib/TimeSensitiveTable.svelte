<script lang="ts">
  import {
    getTable,
    getTableMetadata,
    getAllTableMetadata,
    getItemById,
  } from "./db";
  import type { Field, Item, Table, CheckboxState } from "./types";
  import {
    formatDateDetailedDisplay,
    isValidDateString,
    getUnixTimestamp,
    getUrgencyFactor,
    getOriginalInput,
    parseDate,
  } from "./dateParser";
  import { actionManager } from "./actions";
  import { EditItemAction } from "./actionTypes";
  import { createTableEditor } from "./tableEditing";
  import Checkbox from "./Checkbox.svelte";
  import BaseTable from "./BaseTable.svelte";
  import { getDisplayValue } from "./tableUtils";

  let {
    table,
    reloadToken,
    onNavigate,
  }: {
    table: Table;
    reloadToken: number;
    onNavigate: (tableId: IDBValidKey, rowId: number) => void;
  } = $props();

  const tableId = table.id!;
  let fields: Field[] = $state(table.fields);
  let fieldsKey = $state(0);
  let isEditing = $state(false);
  let isEditingCell = $state(false);
  let tableContainer = $state<HTMLElement>();

  let checkboxIndex = $derived(fields.findIndex((f) => f.id === "c"));

  // ─── Table editor (handling both headers and source-writing body cells) ───

  const { focusCell, editCell } = createTableEditor({
    tableId,
    getTableContainer: () => tableContainer as HTMLElement,
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
    formatDate: formatDateDetailedDisplay,
    isCellEditable: (cell) => {
      const field = fields[cell.cellIndex];
      return !field?.id;
    },
    getCellValue: async (cell) => {
      const rowIdx = Number(cell.parentElement?.getAttribute("data-row"));
      const row = rows[rowIdx];
      const field = fields[cell.cellIndex];
      if (!row || !field) return null;

      const sourceMeta = await getTableMetadata(row.sourceTableId);
      const srcFieldIdx = sourceMeta.fields.findIndex(
        (sf) => sf.name.toLowerCase() === field.name.toLowerCase() && !sf.id,
      );
      if (srcFieldIdx === -1) return null;

      const sourceItem = await getItemById(row.sourceTableId, row.sourceRowId);
      let val = sourceItem ? (sourceItem[srcFieldIdx] ?? "") : "";
      if (field.name.toLowerCase() === "date" && isValidDateString(val)) {
        val = getOriginalInput(val);
      }
      return val;
    },
    onSave: async (cell, newText) => {
      const rowIdx = Number(cell.parentElement?.getAttribute("data-row"));
      const row = rows[rowIdx];
      const field = fields[cell.cellIndex];
      if (!row || !field) return false;

      const sourceMeta = await getTableMetadata(row.sourceTableId);
      const srcFieldIdx = sourceMeta.fields.findIndex(
        (sf) => sf.name.toLowerCase() === field.name.toLowerCase() && !sf.id,
      );
      if (srcFieldIdx === -1) return false;

      const newItem: Item = { id: row.sourceRowId };
      if (field.name.toLowerCase() === "date" && newText.trim() !== "") {
        const stored = parseDate(newText) ?? newText;
        newItem[srcFieldIdx] = stored;
      } else {
        newItem[srcFieldIdx] = newText;
      }
      await actionManager.executeAction(
        new EditItemAction(row.sourceTableId, newItem),
      );
      await actionManager.flushUpdates();
      return true;
    },
  });

  // ─── Time-sensitive row model ─────────────────────────────────────
  // (rows state and data loading logic remains Same...)

  interface TimeSensitiveRow {
    sourceTableId: IDBValidKey;
    sourceRowId: number;
    sourceTableName: string;
    unix: number;
    cellValues: Record<number, string>;
    checkboxState: CheckboxState;
    urgency: number;
    isPast: boolean;
  }

  let rows: TimeSensitiveRow[] = $state([]);
  let lastRowsJson = "";

  // Refresh urgency labels every 60 seconds
  $effect(() => {
    void reloadToken;
    const interval = setInterval(() => {
      rows = rows.map((r) => ({
        ...r,
        urgency: getUrgencyFactor(r.unix),
        isPast: r.unix <= Math.floor(Date.now() / 1000),
      }));
    }, 60_000);
    return () => clearInterval(interval);
  });

  // ─── Data loading ─────────────────────────────────────────────────

  async function loadTimeSensitiveData(token: number) {
    const tableMeta = await getTableMetadata(tableId);
    if (JSON.stringify(fields) !== JSON.stringify(tableMeta.fields)) {
      fields = tableMeta.fields;
      fieldsKey++;
    }

    const allMeta = await getAllTableMetadata();
    const collected: TimeSensitiveRow[] = [];

    for (const meta of allMeta) {
      if (!meta.id || meta.id === tableId) continue;
      if (
        meta.name.toLowerCase() === "history" ||
        meta.name.toLowerCase() === "time sensitive"
      )
        continue;

      const srcDateIdx = meta.fields.findIndex(
        (f) => f.name.toLowerCase() === "date" && !f.id,
      );
      if (srcDateIdx === -1) continue;

      const srcCheckIdx = meta.fields.findIndex((f) => f.id === "c");
      const items = await getTable(meta.id);

      for (const item of items) {
        const dateVal = item[srcDateIdx];
        if (!isValidDateString(dateVal)) continue;

        const unix = getUnixTimestamp(dateVal);
        const cellValues: Record<number, string> = {};

        for (let fi = 0; fi < fields.length; fi++) {
          const field = fields[fi];
          if (field.id) continue;
          if (field.name.toLowerCase() === "date") {
            cellValues[fi] = dateVal;
          } else {
            const srcIdx = meta.fields.findIndex(
              (sf) =>
                sf.name.toLowerCase() === field.name.toLowerCase() && !sf.id,
            );
            if (srcIdx !== -1 && item[srcIdx]) cellValues[fi] = item[srcIdx];
          }
        }

        collected.push({
          sourceTableId: meta.id,
          sourceRowId: item.id as number,
          sourceTableName: meta.name,
          unix,
          cellValues,
          checkboxState: srcCheckIdx !== -1 ? (item.c ?? 0) : 0,
          urgency: getUrgencyFactor(unix),
          isPast: unix <= Math.floor(Date.now() / 1000),
        });
      }
    }

    collected.sort((a, b) => a.unix - b.unix);

    const newJson = JSON.stringify(
      collected.map((r) => ({
        t: r.sourceTableId,
        r: r.sourceRowId,
        u: r.unix,
        v: r.cellValues,
        c: r.checkboxState,
      })),
    );

    if (newJson !== lastRowsJson) {
      lastRowsJson = newJson;
      rows = collected;
    }
  }

  $effect(() => {
    loadTimeSensitiveData(reloadToken);
  });

  // ─── Row styling ──────────────────────────────────────────────────

  function getRowStyle(row: TimeSensitiveRow): string {
    if (row.isPast)
      return `background-color: color-mix(in srgb, var(--background-color) 80%, black); color: var(--color-state-2);`;
    if (row.urgency > 0)
      return `background-color: rgba(220,40,40,${Math.min(row.urgency, 1) * 0.5});`;
    return "";
  }

  // ─── Checkbox (writes to source) ──────────────────────────────────

  async function updateCheckboxState(row: TimeSensitiveRow, state: number) {
    await actionManager.executeAction(
      new EditItemAction(row.sourceTableId, { id: row.sourceRowId, c: state }),
    );
    await actionManager.flushUpdates();
  }

  function handleLocationClick(row: TimeSensitiveRow) {
    onNavigate(row.sourceTableId, row.sourceRowId);
  }

  // ─── Click handlers ───────────────────────────────────────────────

  function handleHeaderClick(headerCell: HTMLTableCellElement) {
    if (isEditing) editCell(headerCell, true);
  }

  function handleBodyClick(bodyCell: HTMLTableCellElement) {
    if (bodyCell.parentElement?.hasAttribute("data-row")) {
      const rowIndex = Number(bodyCell.parentElement.getAttribute("data-row"));
      const field = fields[bodyCell.cellIndex];

      if (field?.id === "c") {
        focusCell(bodyCell);
        return;
      }
      if (field?.id === "l" && rows[rowIndex]) {
        handleLocationClick(rows[rowIndex]);
        return;
      }
      editCell(bodyCell, false);
    }
  }
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
  {#each rows as row, ri (ri)}
    <tr data-row={ri} style={getRowStyle(row)}>
      {#each fields as field, fi}
        {#if field.id === "c"}
          <td>
            <Checkbox
              initialState={row.checkboxState ?? 0}
              disabled={false}
              color={table.color}
              zeroToOne={(el) => updateCheckboxState(row, 1)}
              oneToTwo={(el) => updateCheckboxState(row, 2)}
              twoToOne={(el) => updateCheckboxState(row, 1)}
              oneToZero={(el) => updateCheckboxState(row, 0)}
              twoToZero={(el) => updateCheckboxState(row, 0)}
            />
          </td>
        {:else if field.id === "l"}
          <td class="ts-location-cell" title="Go to source">
            <button
              class="ts-location-btn"
              onclick={() => handleLocationClick(row)}
            >
              {row.sourceTableName}:{row.sourceRowId}
            </button>
          </td>
        {:else}
          <td>
            {@html getDisplayValue(
              row.cellValues[fi],
              field,
              formatDateDetailedDisplay,
            )}
          </td>
        {/if}
      {/each}
    </tr>
  {/each}
</BaseTable>

<style>
  .ts-location-cell {
    text-align: center;
    padding: 0 !important;
  }

  .ts-location-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    font-size: inherit;
    font-family: inherit;
    text-decoration: underline;
    text-decoration-style: dotted;
    padding: 0 4px;
    width: 100%;
    text-align: left;
    opacity: 0.7;
  }

  .ts-location-btn:hover {
    opacity: 1;
  }
</style>
