<script lang="ts">
  import "./Table.css";
  import plusIcon from "../assets/square-plus.svg";
  import {
    getTable,
    getItemById,
    getTableMetadata,
    setTableMetadata,
    deleteItem,
  } from "./db";
  import type { Direction, CheckboxState, Field, Item, Table } from "./types";
  import Checkbox from "./Checkbox.svelte";
  import markdownit from "markdown-it";
  import { getContext, tick } from "svelte";
  import { actionManager } from "./actions";
  import {
    AddFieldMetadataAction,
    DeleteItemAction,
    EditItemAction,
    MarkAsDoneAction,
    UpdateFieldMetadataAction,
    RenameTableAction,
  } from "./actionTypes";
  import { createTableEditor } from "./tableEditing";

  let { table, reloadToken }: { table: Table; reloadToken: number } = $props();
  const tableId = table.id!;
  const md = markdownit();
  let tableData: (Item | null)[] = $state([]);
  let fields: Field[] = $state(table.fields);
  let fieldsKey = $state(0);
  let isEditing = $state(false);
  let checkboxIndex = table.fields.findIndex((f) => f.id == "c");
  let tableContainer: HTMLElement;
  let resizingColumnIndex: number | null = $state(null);
  let startX: number;
  let startWidth: number;
  let isHistory = table.name.toLowerCase() == "history";
  const MIN_COLUMN_WIDTH = 20;
  const ADDITIONAL_ROWS = isHistory ? 0 : 10;
  let isEditingCell = $state(false);

  async function loadTableData(token: number) {
    const tableMeta = await getTableMetadata(tableId);
    if (JSON.stringify(fields) !== JSON.stringify(tableMeta.fields)) {
      fields = tableMeta.fields;
      fieldsKey++;
    }
    const data = await getTable(tableId);
    checkboxIndex = fields.findIndex((f) => f.id == "c");

    // Phase 1: Delete items marked for deletion (c == 2)
    // Using direct DB call to avoid triggering updateCallback cascade
    const itemsToDelete = data.filter((item) => item.c === 2);
    for (const item of itemsToDelete) {
      console.log("deleting item", item);
      const doneAction = new MarkAsDoneAction(tableId, item.id);
      await actionManager.executeAction(doneAction);
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

    if (tableData.length !== newLength) {
      tableData.length = newLength;
    }

    for (let i = 0; i < newLength; i++) {
      const freshItem = freshDataMap.get(i);
      const currentItem = tableData[i];

      if (!freshItem && !currentItem) {
        continue;
      } else if (freshItem && !currentItem) {
        tableData[i] = { ...freshItem };
      } else if (!freshItem && currentItem) {
        tableData[i] = null;
      } else if (freshItem && currentItem) {
        for (const key in currentItem) {
          if (!(key in freshItem)) delete currentItem[key];
        }
        for (const key in freshItem) {
          if (currentItem[key] !== freshItem[key]) {
            currentItem[key] = freshItem[key];
          }
        }
      }
    }

    // Unconditionally recreate the array proxy to force full reconciliation
    tableData = [...tableData];

    // Dispatch event to unblock macroscopic UI operations waiting for DOM accuracy
    document.dispatchEvent(
      new CustomEvent("tableDataLoaded", { detail: tableId }),
    );
  }

  // Reload table data when reloadToken changes (triggered by undo/redo)
  $effect(() => {
    loadTableData(reloadToken);
  });

  function startResize(event: PointerEvent, index: number) {
    if (!isEditing) return;
    event.preventDefault();
    event.stopPropagation();
    resizingColumnIndex = index;
    startX = event.clientX;
    const th = (event.target as HTMLElement).closest(
      "th",
    ) as HTMLTableCellElement;
    startWidth = th.offsetWidth;

    window.addEventListener("pointermove", doResize);
    window.addEventListener("pointerup", stopResize);
  }

  function doResize(event: PointerEvent) {
    if (resizingColumnIndex === null) return;
    event.preventDefault();
    const diffX = event.clientX - startX;
    let newWidth = startWidth + diffX;
    if (newWidth < MIN_COLUMN_WIDTH) {
      newWidth = MIN_COLUMN_WIDTH;
    }

    const ths = tableContainer.querySelectorAll("thead th");
    if (ths[resizingColumnIndex]) {
      const th = ths[resizingColumnIndex] as HTMLTableCellElement;
      th.style.width = `${newWidth}px`;
    }
  }

  async function stopResize() {
    if (resizingColumnIndex === null) return;

    const ths = tableContainer.querySelectorAll("thead th");
    if (ths[resizingColumnIndex]) {
      const th = ths[resizingColumnIndex] as HTMLTableCellElement;
      const newWidth = th.offsetWidth;

      const fieldToUpdate = fields[resizingColumnIndex];
      if (fieldToUpdate && fieldToUpdate.size !== newWidth) {
        const newFieldData = { ...fieldToUpdate, size: newWidth };
        fields[resizingColumnIndex] = newFieldData;
        let updateFieldAction = new UpdateFieldMetadataAction(
          tableId,
          newFieldData,
          resizingColumnIndex,
        );
        await actionManager.executeAction(updateFieldAction);
        // Don't flush updates here - let debounce handle it to avoid interfering with resize
      }
    }

    window.removeEventListener("pointermove", doResize);
    window.removeEventListener("pointerup", stopResize);
    resizingColumnIndex = null;
  }

  function handleTableClick(e: PointerEvent) {
    const target = e.target as HTMLElement;
    const caption = target.closest("caption");

    const headerCell = target.closest(
      "thead th",
    ) as HTMLTableCellElement | null;
    const bodyCell = target.closest("tbody td") as HTMLTableCellElement | null;
    const bodyCellParent = bodyCell?.parentElement;

    if (caption && !caption.firstElementChild?.classList.contains("edit")) {
      const tableNameElement = caption.firstElementChild as HTMLElement;
      if (target == tableNameElement) {
        tableNameElement.classList.add("edit");
        tableNameElement.contentEditable = "true";

        const blurHandler = async () => {
          tableNameElement.removeEventListener("blur", blurHandler);
          tableNameElement.classList.remove("edit");
          tableNameElement.removeAttribute("contenteditable");

          const newName = tableNameElement.innerText.trim();
          if (newName !== table.name) {
            const renameAction = new RenameTableAction(tableId, newName);
            await actionManager.executeAction(renameAction);
            await actionManager.flushUpdates();
          }
        };

        tableNameElement.addEventListener("blur", blurHandler);
      } else {
        setTimeout(() => {
          isEditing = !isEditing;
        }, 1);
      }
      return;
    }

    if (isEditing && headerCell) {
      editCell(headerCell, true);
      return;
    }

    if (bodyCell && bodyCellParent?.hasAttribute("data-row")) {
      if (bodyCell.cellIndex === checkboxIndex) {
        e?.preventDefault();
        focusCell(bodyCell);
        return;
      }
      editCell(bodyCell, false);
      return;
    }
  }

  const { focusCell, editCell } = createTableEditor({
    tableId: tableId,
    getTableContainer: () => tableContainer,
    getFields: () => fields,
    setFields: (f: Field[]) => {
      fields = f;
    },
    getCheckboxIndex: () => checkboxIndex,
    setIsEditingCell: (val: boolean) => {
      isEditingCell = val;
    },
    incrementFieldsKey: () => {
      fieldsKey++;
    },
  });

  async function addColumn() {
    const newFieldName = prompt("Enter new column name:");
    if (newFieldName) {
      const newField: Field = { name: newFieldName, size: 100 };
      let addFieldAction = new AddFieldMetadataAction(tableId, newField);
      await actionManager.executeAction(addFieldAction);
      await actionManager.flushUpdates();
      fields.push(newField);
    }
  }

  async function updateCheckboxState(checkbox: HTMLDivElement, state: number) {
    const row = checkbox.closest("tr");
    const rowNum = Number(row?.getAttribute("data-row"));
    if (row && !isNaN(rowNum)) {
      const newItem: Item = { id: rowNum, c: state };
      const editAction = new EditItemAction(tableId, newItem);
      await actionManager.executeAction(editAction);
      await actionManager.flushUpdates();
    }
  }

  const zeroToOne = (el: HTMLDivElement) => updateCheckboxState(el, 1);
  const oneToTwo = (el: HTMLDivElement) => updateCheckboxState(el, 2);
  const twoToOne = (el: HTMLDivElement) => updateCheckboxState(el, 1);
  const oneToZero = (el: HTMLDivElement) => updateCheckboxState(el, 0);
  const twoToZero = (el: HTMLDivElement) => updateCheckboxState(el, 0);
</script>

<div
  class="table-container"
  bind:this={tableContainer}
  style="--secondary-color: {table.secondaryColor};"
>
  {#if isEditing}
    <div class="add-column-container">
      <button class="add-column" onclick={addColumn}
        ><img src={plusIcon} alt="add column" /></button
      >
    </div>
  {/if}
  <table class="table" onpointerdown={handleTableClick}>
    <caption style={`background-color: ${table.color}`}>
      <span>{table.name}</span>
    </caption>
    <thead>
      <tr style={`visibility: ${isEditing ? "visible" : "collapse"}`}>
        {#key fieldsKey}
          {#each fields as field, i}
            <th style="width: {field.id === 'c' ? '1lh' : field.size + 'px'}">
              {field.name}{#if field.id !== "c"}
                <span
                  class="resize-handle"
                  onpointerdown={(e) => startResize(e, i)}
                >
                </span>
              {/if}
            </th>
          {/each}
        {/key}
      </tr>
    </thead>
    <tbody>
      {#each tableData as row, i (i)}
        <tr data-row={i} data-k={row ? (row.k ?? row.k) : null}>
          {#each fields as field, i}
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
              <td>
                {#if row?.[i]?.endsWith("\nm")}
                  {@html md.render(row[i]?.slice(0, -2) ?? "")}
                {:else}
                  {@html row?.[i] ?? "\u200B"}
                {/if}
              </td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
