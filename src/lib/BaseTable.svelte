<script lang="ts">
  import "./Table.css";
  import plusIcon from "../assets/square-plus.svg";
  import { createTableChrome } from "./tableChrome";
  import type { Table, Field } from "./types";
  import ContextMenu from "./ContextMenu.svelte";
  import Icon from "./Icon.svelte";
  import { actionManager } from "./actions";
  import {
    DeleteTableAction,
    RemoveFieldMetadataAction,
    MoveFieldAction,
    MoveTableAction,
    ShiftItemsAction,
    AddFieldMetadataAction,
  } from "./actionTypes";
  import { getAllTableMetadata } from "./db";

  let {
    table,
    fields = $bindable(),
    fieldsKey,
    isEditing = $bindable(false),
    tableContainer = $bindable(),
    onHeaderClick,
    onBodyClick,
    children,
  }: {
    table: Table;
    fields: Field[];
    fieldsKey: number;
    isEditing?: boolean;
    tableContainer?: HTMLElement;
    onHeaderClick?: (cell: HTMLTableCellElement) => void;
    onBodyClick?: (cell: HTMLTableCellElement) => void;
    children: any;
  } = $props();

  let contextMenu = $state<{ x: number; y: number; items: any[] } | null>(null);

  const { startResize, addColumn, handleCaptionClick } = createTableChrome({
    tableId: table.id!,
    tableName: table.name,
    getTableContainer: () => tableContainer,
    getFields: () => fields,
    setFields: (f) => {
      fields = f;
    },
    getIsEditing: () => isEditing,
    setIsEditing: (v) => {
      isEditing = v;
    },
  });

  let showColorPicker = $state(false);
  let pickerPos = $state({ x: 0, y: 0 });

  function handleTableClick(e: PointerEvent) {
    const target = e.target as HTMLElement;
    const caption = target.closest("caption");
    const headerCell = target.closest(
      "thead th",
    ) as HTMLTableCellElement | null;
    const bodyCell = target.closest("tbody td") as HTMLTableCellElement | null;

    if (caption && e.button === 0) {
      handleCaptionClick(target, caption);
      return;
    }

    if (headerCell && onHeaderClick) {
      onHeaderClick(headerCell);
      return;
    }

    if (bodyCell && onBodyClick) {
      if (target.closest("a")) return;
      onBodyClick(bodyCell);
      return;
    }
  }

  function handleAddColumn() {
    addColumn();
  }

  async function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const caption = target.closest("caption");
    const headerCell = target.closest(
      "thead th",
    ) as HTMLTableCellElement | null;
    const bodyCell = target.closest("tbody td") as HTMLTableCellElement | null;

    let items: any[] = [];

    if (caption) {
      const allTables = await getAllTableMetadata();
      const currentIndex = allTables.findIndex((t) => t.id === table.id);

      items = [
        {
          label: "Move Table Left",
          icon: "move-left",
          disabled: currentIndex <= 0,
          onClick: () => {
            const prev = allTables[currentIndex - 1];
            actionManager.executeAction(
              new MoveTableAction(table.id!, prev.id!),
            );
          },
        },
        {
          label: "Move Table Right",
          icon: "move-right",
          disabled: currentIndex >= allTables.length - 1,
          onClick: () => {
            const next = allTables[currentIndex + 1];
            actionManager.executeAction(
              new MoveTableAction(table.id!, next.id!),
            );
          },
        },
        {
          label: "Edit Color",
          icon: "palette",
          onClick: () => {
            pickerPos = { x: contextMenu!.x, y: contextMenu!.y };
            showColorPicker = true;
          },
        },
        {
          label: "Delete Table",
          icon: "trash",
          danger: true,
          onClick: () => {
            if (confirm(`Delete table "${table.name}"?`)) {
              actionManager.executeAction(new DeleteTableAction(table.id!));
            }
          },
        },
      ];
    } else if (headerCell) {
      const colIndex = headerCell.cellIndex;
      const field = fields[colIndex];

      if (!field.id) {
        // Only for user-defined columns
        items = [
          {
            label: "Move Column Left",
            icon: "move-left",
            disabled: colIndex <= 0 || !!fields[colIndex - 1].id,
            onClick: () =>
              actionManager.executeAction(
                new MoveFieldAction(table.id!, colIndex, colIndex - 1),
              ),
          },
          {
            label: "Move Column Right",
            icon: "move-right",
            disabled: colIndex >= fields.length - 1,
            onClick: () =>
              actionManager.executeAction(
                new MoveFieldAction(table.id!, colIndex, colIndex + 1),
              ),
          },
          {
            label: "Insert Column Left",
            icon: "columns",
            onClick: () =>
              actionManager.executeAction(
                new AddFieldMetadataAction(
                  table.id!,
                  { name: "new column", size: 100 },
                  colIndex,
                ),
              ),
          },
          {
            label: "Insert Column Right",
            icon: "columns",
            onClick: () =>
              actionManager.executeAction(
                new AddFieldMetadataAction(
                  table.id!,
                  { name: "new column", size: 100 },
                  colIndex + 1,
                ),
              ),
          },
          {
            label: "Delete Column",
            icon: "trash",
            danger: true,
            onClick: () => {
              if (confirm(`Delete column "${field.name}"?`)) {
                actionManager.executeAction(
                  new RemoveFieldMetadataAction(table.id!, field, colIndex),
                );
              }
            },
          },
        ];
      }
    } else if (bodyCell) {
      const row = bodyCell.parentElement as HTMLTableRowElement;
      const rowNum = Number(row.getAttribute("data-row"));

      items = [
        {
          label: "Insert Row Above",
          icon: "rows",
          onClick: () =>
            actionManager.executeAction(
              new ShiftItemsAction(table.id!, rowNum, false),
            ),
        },
        {
          label: "Insert Row Below",
          icon: "rows",
          onClick: () =>
            actionManager.executeAction(
              new ShiftItemsAction(table.id!, rowNum + 1, false),
            ),
        },
        {
          label: "Delete Row",
          icon: "trash",
          danger: true,
          onClick: () => {
            actionManager.executeAction(
              new ShiftItemsAction(table.id!, rowNum, true),
            );
          },
        },
      ];
    }

    if (items.length > 0) {
      contextMenu = { x: e.clientX, y: e.clientY, items };
    }
  }
</script>

<div
  class="table-container"
  bind:this={tableContainer}
  style="--secondary-color: {table.secondaryColor};"
>
  {#if isEditing}
    <div class="add-column-container">
      <button class="add-column" onclick={handleAddColumn}>
        <Icon name="plus" size={24} color="var(--color)" />
      </button>
    </div>
  {/if}
  <table
    class="table"
    onpointerdown={handleTableClick}
    oncontextmenu={handleContextMenu}
  >
    <caption style={`background-color: ${table.color}`}>
      <span>{table.name}</span>
    </caption>
    <thead>
      <tr style={`visibility: ${isEditing ? "visible" : "collapse"}`}>
        {#key fieldsKey}
          {#each fields as field, i}
            <th
              style="width: {field.id === 'c'
                ? 'calc(1lh + 10px)'
                : (field.size ?? 100) + 'px'}"
            >
              {field.name}{#if !field.id}
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
      {@render children()}
    </tbody>
  </table>
</div>

{#if showColorPicker}
  <div
    class="color-picker-popup"
    style="left: {pickerPos.x}px; top: {pickerPos.y}px;"
    onpointerdown={(e) => e.stopPropagation()}
  >
    <div class="color-row">
      <label for="primary-color">Primary</label>
      <input
        id="primary-color"
        type="color"
        value={table.color}
        oninput={(e) => {
          table.color = e.currentTarget.value;
        }}
        onchange={async (e) => {
          table.color = e.currentTarget.value;
          const { UpdateTableColorAction } = await import("./actionTypes");
          actionManager.executeAction(
            new UpdateTableColorAction(
              table.id!,
              table.color,
              table.secondaryColor ?? table.color,
            ),
          );
        }}
      />
    </div>
    <div class="color-row">
      <label for="secondary-color">Secondary</label>
      <input
        id="secondary-color"
        type="color"
        value={table.secondaryColor}
        oninput={(e) => {
          table.secondaryColor = e.currentTarget.value;
        }}
        onchange={async (e) => {
          table.secondaryColor = e.currentTarget.value;
          const { UpdateTableColorAction } = await import("./actionTypes");
          actionManager.executeAction(
            new UpdateTableColorAction(
              table.id!,
              table.color,
              table.secondaryColor ?? table.color,
            ),
          );
        }}
      />
    </div>
  </div>
{/if}

<svelte:window
  onpointerdown={() => {
    if (showColorPicker) showColorPicker = false;
  }}
  onkeydown={(e) => {
    if (showColorPicker && e.key === "Escape") showColorPicker = false;
  }}
/>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={contextMenu.items}
    onClose={() => (contextMenu = null)}
  />
{/if}

<style>
  .color-picker-popup {
    position: fixed;
    z-index: 10001;
    background-color: color-mix(
      in srgb,
      var(--background-color),
      transparent 10%
    );
    backdrop-filter: blur(15px);
    border: 2px solid black;
    box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.2);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: pop-in 0.1s ease-out;
  }
  .color-row {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
  }
  .color-row label {
    font-size: 14px;
    font-weight: 500;
    color: var(--color);
  }
  .color-picker-popup input[type="color"] {
    width: 30px;
    height: 30px;
    padding: 0;
    border: 2px solid black;
    border-radius: 0;
    cursor: pointer;
  }
  .color-picker-popup input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .color-picker-popup input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 0;
  }
</style>
