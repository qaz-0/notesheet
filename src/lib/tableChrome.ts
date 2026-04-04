/// <reference lib="dom" />
/**
 * Shared table-level operations: column resize, add column, caption/name editing.
 * Used by both Table.svelte and TimeSensitiveTable.svelte to avoid duplication.
 */
import { actionManager } from "./actions";
import {
  AddFieldMetadataAction,
  UpdateFieldMetadataAction,
  RenameTableAction,
} from "./actionTypes";
import type { Field, BaseTableContext } from "./types";

export interface TableChromeContext extends BaseTableContext {
  tableName: string;
  getIsEditing: () => boolean;
  setIsEditing: (val: boolean) => void;
}

export function createTableChrome(ctx: TableChromeContext) {
  let resizingColumnIndex: number | null = null;
  let startX = 0;
  let startWidth = 0;
  const MIN_COLUMN_WIDTH = 20;

  // ─── Column resize ─────────────────────────────────────────────────

  function startResize(event: PointerEvent, index: number) {
    if (!ctx.getIsEditing()) return;
    event.preventDefault();
    event.stopPropagation();
    resizingColumnIndex = index;
    startX = event.clientX;
    const th = (event.target as HTMLElement).closest("th") as HTMLTableCellElement;
    startWidth = th.offsetWidth;
    window.addEventListener("pointermove", doResize);
    window.addEventListener("pointerup", stopResize);
  }

  function doResize(event: PointerEvent) {
    if (resizingColumnIndex === null) return;
    event.preventDefault();
    let newWidth = startWidth + (event.clientX - startX);
    if (newWidth < MIN_COLUMN_WIDTH) newWidth = MIN_COLUMN_WIDTH;
    const container = ctx.getTableContainer();
    if (!container) return;
    const ths = container.querySelectorAll("thead th");
    if (ths[resizingColumnIndex]) {
      (ths[resizingColumnIndex] as HTMLTableCellElement).style.width = `${newWidth}px`;
    }
  }

  async function stopResize() {
    if (resizingColumnIndex === null) return;
    const container = ctx.getTableContainer();
    if (container) {
      const ths = container.querySelectorAll("thead th");
      if (ths[resizingColumnIndex]) {
        const newWidth = (ths[resizingColumnIndex] as HTMLTableCellElement).offsetWidth;
        const fields = ctx.getFields();
        const field = fields[resizingColumnIndex];
        if (field && field.size !== newWidth) {
          const newFieldData = { ...field, size: newWidth };
          fields[resizingColumnIndex] = newFieldData;
          await actionManager.executeAction(
            new UpdateFieldMetadataAction(ctx.tableId, newFieldData, resizingColumnIndex)
          );
        }
      }
    }
    window.removeEventListener("pointermove", doResize);
    window.removeEventListener("pointerup", stopResize);
    resizingColumnIndex = null;
  }

  // ─── Add column ────────────────────────────────────────────────────

  async function addColumn() {
    const name = prompt("Enter new column name:");
    if (name) {
      const newField: Field = { name, size: 100 };
      await actionManager.executeAction(new AddFieldMetadataAction(ctx.tableId, newField));
      await actionManager.flushUpdates();
      ctx.getFields().push(newField);
    }
  }

  // ─── Caption click (name edit + edit-mode toggle) ──────────────────

  /**
   * Handle a click on the table caption area.
   * - Click on the name span → enters inline rename mode.
   * - Click elsewhere on caption → toggles edit mode (shows/hides headers).
   * Returns true if the click was handled.
   */
  function handleCaptionClick(target: HTMLElement, caption: HTMLElement): boolean {
    if (caption.firstElementChild?.classList.contains("edit")) return false;

    const nameEl = caption.firstElementChild as HTMLElement;
    if (target === nameEl) {
      nameEl.classList.add("edit");
      nameEl.contentEditable = "true";

      const onBlur = async () => {
        nameEl.removeEventListener("blur", onBlur);
        nameEl.classList.remove("edit");
        nameEl.removeAttribute("contenteditable");
        const newName = nameEl.innerText.trim();
        if (newName !== ctx.tableName) {
          await actionManager.executeAction(new RenameTableAction(ctx.tableId, newName));
          await actionManager.flushUpdates();
        }
      };
      nameEl.addEventListener("blur", onBlur);
    } else {
      setTimeout(() => ctx.setIsEditing(!ctx.getIsEditing()), 1);
    }
    return true;
  }

  return { startResize, addColumn, handleCaptionClick };
}
