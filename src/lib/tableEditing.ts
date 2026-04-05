/// <reference lib="dom" />
import { tick } from "svelte";
import { getItemById } from "./db";
import { actionManager } from "./actions";
import {
  ShiftItemsAction,
  RemoveFieldMetadataAction,
  DeleteTableAction,
  UpdateFieldMetadataAction,
  EditItemAction,
} from "./actionTypes";
import { isAtStartEnd, navigate } from "./tableNavigation";
import type { Direction, Field, Item, BaseTableContext } from "./types";
import { parseDate, isValidDateString, getOriginalInput, formatDateDisplay } from "./dateParser";
import markdownit from "markdown-it";

const md = markdownit();

export interface TableEditorContext extends BaseTableContext {
  getCheckboxIndex: () => number;
  setIsEditingCell: (isEditing: boolean) => void;
  incrementFieldsKey: () => void;
  onSave?: (cell: HTMLTableCellElement, value: string) => Promise<boolean>;
  getCellValue?: (cell: HTMLTableCellElement) => Promise<string | null>;
  formatDate?: (stored: string) => string;
  isCellEditable?: (cell: HTMLTableCellElement) => boolean;
}

export function createTableEditor(ctx: TableEditorContext) {
  function focusCell(cell: HTMLTableCellElement) {
    const focusableChild = cell.querySelector('[tabindex="0"], button') as HTMLElement | null;
    focusableChild?.focus();

    const keydownHandler = (event: KeyboardEvent) => {
      const navResult = navigate(cell, event, ctx.getCheckboxIndex());

      if (navResult.nextCell) {
        finish();
        if (navResult.isCheckbox) {
          focusCell(navResult.nextCell);
        } else {
          editCell(navResult.nextCell, false, navResult.goToStart);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish();
      }

      function finish() {
        focusableChild?.blur();
        cell.removeEventListener("keydown", keydownHandler);
      }
    };
    cell.addEventListener("keydown", keydownHandler);
  }

  async function editCell(cell: HTMLTableCellElement, isHeader: boolean, atStart?: boolean) {
    if (cell.isContentEditable) return;

    if (!isHeader && ctx.isCellEditable && !ctx.isCellEditable(cell)) {
      focusCell(cell);
      return;
    }

    const row = cell.parentElement as HTMLTableRowElement;
    const rowNum = Number(row.getAttribute("data-row"));
    const originalText = cell.innerText.replace(/\u200B/g, "").trimEnd();
    const fields = ctx.getFields();
    const formatDate = ctx.formatDate ?? formatDateDisplay;

    if (!isHeader) {
      let plainText: string | null = null;

      if (ctx.getCellValue) {
        plainText = await ctx.getCellValue(cell);
      } else {
        const item = await getItemById(ctx.tableId, rowNum);
        plainText = item ? (item[cell.cellIndex] ?? "") : "";

        // For date fields, show the original user input when editing
        const fieldAtIndex = fields[cell.cellIndex];
        if (fieldAtIndex && fieldAtIndex.name.toLowerCase() === 'date' && isValidDateString(plainText)) {
          plainText = getOriginalInput(plainText as string);
        }
      }

      const currentContent = cell.innerText.replace(/\u200B/g, "");

      if (plainText !== null && (currentContent !== plainText || cell.innerText.includes("\u200B"))) {
        cell.textContent = plainText;
      }
    }

    ctx.setIsEditingCell(true);
    cell.classList.add("edit");
    cell.contentEditable = "true";

    setTimeout(() => {
      cell.focus();
      if (atStart !== undefined) {
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(cell);
        range.collapse(atStart);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      // Check immediately if we were on markdown to show preview
      inputHandler();
    }, 0);

    const inputHandler = () => {
      const isMd = cell.innerText.endsWith("\nm");
      document.dispatchEvent(new CustomEvent("notesheetMarkdownPreview", {
        detail: {
          show: isMd,
          text: cell.innerText.replace(/\u200B/g, ""),
          rect: cell.getBoundingClientRect()
        }
      }));
    };

    const keydownHandler = async (event: KeyboardEvent) => {
      let direction: Direction | undefined;
      let navResult;

      switch (event.key) {
        case "Delete":
          if (!isHeader) {
            let { isAtEnd } = isAtStartEnd(cell);
            if (!isAtEnd) break;
            event.preventDefault();

            // if (confirm(`Are you sure you want to delete row ${rowNum}?`)) {

            const cellIndex = cell.cellIndex;
            const targetRowId = rowNum;

            await finishEdit(true);
            let shiftItemsAction = new ShiftItemsAction(ctx.tableId, rowNum, true);
            await actionManager.executeAction(shiftItemsAction);
            await actionManager.flushUpdates();

            // Prevent focus-fighting by awaiting Svelte's asynchronous structural updates
            await new Promise<void>((resolve) => {
              const handler = (e: Event) => {
                const customEv = e as CustomEvent;
                if (customEv.detail === ctx.tableId) {
                  document.removeEventListener('tableDataLoaded', handler);
                  resolve();
                }
              };
              document.addEventListener('tableDataLoaded', handler);
              setTimeout(() => {
                document.removeEventListener('tableDataLoaded', handler);
                resolve();
              }, 300); // safety fallback
            });

            const container = ctx.getTableContainer();
            if (container) {
              const newTbody = container.querySelector("tbody");
              if (newTbody) {
                const newRow = newTbody.querySelector(`tr[data-row="${targetRowId}"]`) as HTMLTableRowElement;
                const fallbackRow = newTbody.querySelector(`tr[data-row="${targetRowId - 1}"]`) as HTMLTableRowElement;
                const targetRow = newRow || fallbackRow;

                if (targetRow) {
                  const newCell = targetRow.children[cellIndex] as HTMLTableCellElement;
                  if (newCell) {
                    if (cellIndex === ctx.getCheckboxIndex()) {
                      focusCell(newCell);
                    } else {
                      editCell(newCell, false, true);
                    }
                  }
                }
              }
            }
            break;
          }

          // Header column deletion
          await finishEdit(true, originalText);
          const fieldToRemove = fields[cell.cellIndex];
          if (fieldToRemove
            // && confirm(`Are you sure you want to delete the column "${fieldToRemove.name}"?`)
          ) {
            let removeFieldAction = new RemoveFieldMetadataAction(ctx.tableId, fieldToRemove, cell.cellIndex);
            await actionManager.executeAction(removeFieldAction);
            await actionManager.flushUpdates();

            const newFields = fields.filter((f) => f !== fieldToRemove);
            ctx.setFields(newFields);

            if (newFields.length === 0) {
              const container = ctx.getTableContainer();
              if (container) container.remove();
              let deleteTableAction = new DeleteTableAction(ctx.tableId);
              await actionManager.executeAction(deleteTableAction);
              await actionManager.flushUpdates();
            } else {
              ctx.incrementFieldsKey();
            }
          }
          break;

        case "Escape":
          event.preventDefault();
          await finishEdit(true, originalText);
          break;

        case "Enter":
          if (isHeader) {
            event.preventDefault();
            await finishEdit();
          }
        // fallthrough intended to allow navigate
        default:
          navResult = navigate(cell, event, ctx.getCheckboxIndex(), direction);
          if (navResult?.nextCell) {
            await finishEdit(false);
            if (navResult.isCheckbox) {
              focusCell(navResult.nextCell);
            } else {
              editCell(navResult.nextCell, isHeader, navResult.goToStart);
            }
          }
          break;
      }
    };

    const blurHandler = () => {
      setTimeout(() => {
        if (!cell.contains(document.activeElement) && document.activeElement !== cell) {
          finishEdit();
        }
      }, 0);
    };

    async function finishEdit(cancel = false, restoreText: string | null = null) {
      cell.removeEventListener("keydown", keydownHandler);
      cell.removeEventListener("blur", blurHandler);
      cell.removeEventListener("input", inputHandler);
      document.dispatchEvent(new CustomEvent("notesheetMarkdownPreview", { detail: { show: false } }));

      if (!cell.isContentEditable) return;

      ctx.setIsEditingCell(false);
      let newText = isHeader ? cell.innerText.trim() : cell.innerText;
      newText = newText.replace(/\u200B/g, "");

      cell.classList.remove("edit");
      cell.removeAttribute("contenteditable");

      if (newText !== originalText) {
        if (cancel) {
          cell.innerText = restoreText ?? originalText;
          return;
        }

        const cellIndex = cell.cellIndex;
        const fieldAtIndex = fields[cellIndex];
        let storedValue = newText;

        if (isHeader) {
          const oldField = fields[cellIndex];
          const newField = { name: newText, size: oldField.size };

          if (oldField.name !== newField.name) {
            // if (confirm(`Are you sure you want to rename the column "${originalText}" to "${newText}"?`)) {
            fields[cellIndex] = newField;
            ctx.setFields([...fields]);
            let updateAction = new UpdateFieldMetadataAction(ctx.tableId, newField, cellIndex);
            await actionManager.executeAction(updateAction);
            // } else {
            //   cell.innerHTML = restoreText ?? originalText;
            // }
          }
        } else {
          if (fieldAtIndex && fieldAtIndex.name.toLowerCase() === 'date' && newText.trim() !== '') {
            storedValue = parseDate(newText) ?? newText;
          }

          if (ctx.onSave) {
            const handled = await ctx.onSave(cell, newText);
            if (!handled) {
              // Optional: rollback UI if save failed?
            }
          } else {
            const newItem: Item = { id: rowNum };
            if (cellIndex < fields.length) {
              newItem[cellIndex] = storedValue;

              const checkboxIndex = ctx.getCheckboxIndex();

              if (checkboxIndex !== -1) {
                const td = row.children[checkboxIndex];
                const checkbox = td.querySelector('.checkbox') as HTMLDivElement;
                const disabled = checkbox?.getAttribute("data-disabled");
                const state = Number(row.getAttribute("data-state"));

                if (state !== 2) {
                  const editAction = new EditItemAction(ctx.tableId, newItem);
                  const resultItem = await actionManager.executeAction(editAction);

                  if (checkbox && !disabled && !resultItem) {
                    checkbox.setAttribute("data-disabled", "true");
                  }
                  if (checkbox && disabled === "true" && resultItem) {
                    checkbox.removeAttribute("data-disabled");
                  }
                }
              } else {
                const editAction = new EditItemAction(ctx.tableId, newItem);
                await actionManager.executeAction(editAction);
              }
            }
          }

          // Immediately update cell display for date fields
          if (fieldAtIndex && fieldAtIndex.name.toLowerCase() === 'date' && isValidDateString(storedValue)) {
            cell.textContent = formatDate(storedValue);
          } else if (newText.endsWith("\nm")) {
            cell.innerHTML = md.render(newText.slice(0, -2));
          } else {
            cell.textContent = newText;
          }
        }
      }
    }

    cell.addEventListener("keydown", keydownHandler);
    cell.addEventListener("blur", blurHandler);
    cell.addEventListener("input", inputHandler);
  }

  return { focusCell, editCell };
}
