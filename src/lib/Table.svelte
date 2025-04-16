<script lang="ts">
    import './Table.css';
    import plusIcon from '../assets/square-plus.svg';
    import { getTable, editItem, getItemById, getAllTableMetadata, addFieldMetadata, removeFieldMetadata, deleteItem, deleteTable } from './db';
    import type { CheckboxState, Item, Table } from './types';
    import Checkbox from './Checkbox.svelte';

    let { table }: { table: Table } = $props();
    const tableId = table.id!;
    let tableData: (Item | null)[] = $state([]);
    let fields: string[] = $state(table.fields);
    let isEditing = $state(false);
    let checkboxIndex = table.fields.indexOf("c");
    let tableContainer: HTMLElement;

    async function loadTableData() {
        const newTableData = [];
        const data = await getTable(tableId);
        checkboxIndex = fields.indexOf("c");

        for (let i = 0; i < 100; i++) {
            if (data.length > 0 && data[data.length - 1].id == i)
                newTableData.push(data.pop()!);
            else
                newTableData.push(null);
        }

        tableData = newTableData;
    }

    loadTableData();

    function handleTableClick(e: PointerEvent) {
        const target = e.target as HTMLElement;
        const caption = target.closest("caption");
        const headerCell = target.closest("thead th") as (HTMLTableCellElement | null);
        const bodyCell = target.closest("tbody td") as (HTMLTableCellElement | null);
        const bodyCellParent = bodyCell?.parentElement;

        if (caption) {
            isEditing = !isEditing;
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

    function navigate(currentCell: HTMLTableCellElement, event: KeyboardEvent, originalText?: string): { nextCell: HTMLTableCellElement | null, isCheckbox: boolean, goToStart?: boolean } {
        const row = currentCell.parentElement as HTMLTableRowElement;
        const cellIndex = currentCell.cellIndex;
        const selection = window.getSelection();

        let isAtStart = false, isAtEnd = false;
        let bypass = event.altKey || event.key === "Tab" || !originalText;

        if (!bypass && selection && selection.rangeCount && selection.isCollapsed) {
            const selRange = selection.getRangeAt(0);
            const testRange = selRange.cloneRange();

            testRange.selectNodeContents(currentCell);
            testRange.setEnd(selRange.startContainer, selRange.startOffset);
            isAtStart = testRange.toString() === "";

            testRange.selectNodeContents(currentCell);
            testRange.setStart(selRange.endContainer, selRange.endOffset);
            const endStr = testRange.toString();
            isAtEnd = (endStr === "" || endStr === "\n");
        }

        let nextCell: HTMLTableCellElement | null = null;
        let goToStart: boolean | undefined = undefined;
        let isCheckbox = false;

        if (isAtEnd || bypass) {
            if (event.key === "ArrowDown") {
                const nextRow = row.nextElementSibling as HTMLTableRowElement;
                if (nextRow?.hasAttribute("data-row")) {
                    nextCell = nextRow.children[cellIndex] as HTMLTableCellElement;
                    goToStart = false;
                }
            } else if (event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)) {
                nextCell = currentCell.nextElementSibling as HTMLTableCellElement;
                goToStart = false;
            }
        }

        if (isAtStart || bypass) {
            if (event.key === "ArrowUp") {
                const prevRow = row.previousElementSibling as HTMLTableRowElement;
                if (prevRow?.hasAttribute("data-row")) {
                    nextCell = prevRow.children[cellIndex] as HTMLTableCellElement;
                    goToStart = true;
                }
            } else if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) {
                const prevSibling = currentCell.previousElementSibling;
                if (prevSibling && (prevSibling.tagName === 'TD' || prevSibling.tagName === 'TH')) {
                    nextCell = prevSibling as HTMLTableCellElement;
                    goToStart = true;
                }
            }
        }

        if (nextCell && nextCell.cellIndex === checkboxIndex && nextCell.tagName === 'TD') {
            isCheckbox = true;
        }

        if (event.key === "Tab" || nextCell) {
            event.preventDefault();
        }

        return { nextCell, isCheckbox, goToStart };
    }

    function focusCell(cell: HTMLTableCellElement) {
        const focusableChild = cell.querySelector('[tabindex="0"]') as HTMLElement | null;
        focusableChild?.focus();
        const keydownHandler = (event: KeyboardEvent) => {
            const navResult = navigate(cell, event);

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

    function editCell(cell: HTMLTableCellElement, isHeader: boolean, atStart?: boolean) {
        if (cell.isContentEditable) return;

        const row = cell.parentElement as HTMLTableRowElement;
        const originalText = cell.innerText;
        cell.classList.add('edit');
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
        }, 0);

        const keydownHandler = async (event: KeyboardEvent) => {
            const navResult = navigate(cell, event, originalText);

            if (navResult.nextCell) {
                await finishEdit(false);
                if (navResult.isCheckbox) {
                    focusCell(navResult.nextCell)
                } else {
                    editCell(navResult.nextCell, false, navResult.goToStart);
                }
            } else if (event.key === "Escape") {
                event.preventDefault();
                await finishEdit(true, originalText);
            } else if (isHeader && event.key === "Delete") {
                event.preventDefault();
                await finishEdit(true, originalText);

                const fieldToRemove = fields[cell.cellIndex];
                if (fieldToRemove && confirm(`Are you sure you want to delete the column "${fieldToRemove}"?`)) {
                    await removeFieldMetadata(tableId, fieldToRemove);
                    fields = fields.filter(field => field !== fieldToRemove);
                    if (fields.length === 0) {
                        await deleteTable(tableId);
                        tableContainer.remove();
                    }
                }
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

            if (!cell.isContentEditable) return;

            const newText = cell.innerText;
            cell.classList.remove('edit');
            cell.removeAttribute('contenteditable');

            if (newText !== originalText) {
                if (cancel) {
                    cell.innerText = restoreText ?? originalText;
                    return;
                }
                const cellIndex = cell.cellIndex;
                if (isHeader) {
                    const oldField = fields[cellIndex];
                    const newField = newText.trim();

                    if (oldField !== newField) {
                        if (confirm(`Are you sure you want to rename the column "${oldField}" to "${newField}"?`)) {
                            fields[cellIndex] = newField;
                            await addFieldMetadata(tableId, newField, oldField);
                            loadTableData();
                        } else {
                            cell.innerText = oldField;
                        }
                    }
                } else {
                    const rowNum = Number(row.getAttribute("data-row"));
                    const newItem: Item = { id: rowNum };
                    if (cellIndex < fields.length) {
                        newItem[fields[cellIndex]] = newText;
                        // if done, dont edit
                        // if not done and empty disable
                        // if not done and become not empty, enable
                        if (checkboxIndex !== -1) {
                            const checkbox = row.children[checkboxIndex].firstChild as HTMLDivElement;
                            const disabled = checkbox.getAttribute("data-disabled");
                            const state = Number(row.getAttribute("data-state"));
                            if (state !== 2) {
                                const resultItem = await editItem(tableId, newItem);
                                if (!disabled && !resultItem) checkbox.setAttribute("data-disabled", "true");
                                if (disabled === "true" && resultItem) checkbox.removeAttribute("data-disabled");
                            }
                        } else {
                            await editItem(tableId, newItem);
                        }
                    } else {
                        console.error(`Invalid cell index ${cellIndex} for fieldsState with length ${fields.length}`);
                    }
                }
            }
        }

        cell.addEventListener("keydown", keydownHandler);
        cell.addEventListener("blur", blurHandler);
    }

    async function addColumn() {
        const newField = prompt("Enter new column name:");
        if (newField) {
            await addFieldMetadata(tableId, newField);
            fields.push(newField);
            loadTableData();
        }
    }

    function checkboxGetRowData(checkbox: HTMLDivElement) {
        const row = checkbox.closest('tr');
        return { row, rowNum: Number(row?.getAttribute("data-row")) }
    }

    function zeroToOne(checkbox: HTMLDivElement) {
        const { row, rowNum } = checkboxGetRowData(checkbox);
        if (row) {
            const newItem: Item = { id: rowNum, 'c': 1 };
            editItem(tableId, newItem);
            row.setAttribute("data-state", "1");
        }
    };

    function oneToTwo(checkbox: HTMLDivElement) {
        const { row, rowNum } = checkboxGetRowData(checkbox);
        if (row) {
            deleteItem(tableId, rowNum);
            row.setAttribute("data-state", "2");
        }
    };

    function twoToOne(checkbox: HTMLDivElement) {
        const { row, rowNum } = checkboxGetRowData(checkbox);
        if (row) {
            // restore item
            const newItem: Item = { id: rowNum, 'c': 1 };
            Array.prototype.forEach.call(row.children, child => {
                if (child.cellIndex === checkboxIndex) return;
                newItem[fields[child.cellIndex]] = child.innerText;
            });
            editItem(tableId, newItem);
            row.setAttribute("data-state", "1");
        }
    };

    function oneToZero(checkbox: HTMLDivElement) {
        const { row, rowNum } = checkboxGetRowData(checkbox);
        if (row) {
            const newItem: Item = { id: rowNum, 'c': 0 };
            editItem(tableId, newItem);
            row.setAttribute("data-state", "0");
        }
    };

    function twoToZero(checkbox: HTMLDivElement) {
        const { row, rowNum } = checkboxGetRowData(checkbox);
        if (row) {
            // restore item
            const newItem: Item = { id: rowNum, 'c': 0 };
            Array.prototype.forEach.call(row.children, child => {
                if (child.cellIndex === checkboxIndex) return;
                newItem[fields[child.cellIndex]] = child.innerText;
            });
            editItem(tableId, newItem);
            row.setAttribute("data-state", "0");
        }
    };
</script>

<div class="table-container" bind:this={tableContainer}
    style="--secondary-color: {table.secondaryColor};"
>
    {#if isEditing}
    <div class="add-column-container">
        <button class="add-column" onclick={addColumn}><img src={plusIcon} alt="add column"></button>
    </div>
    {/if}
    <table class="table" onpointerdown={handleTableClick}>
        <caption style={`background-color: ${table.color}`}>{table.name}</caption>
        <thead>
            {#if isEditing}
                <tr>
                    {#each fields as key}
                        <th>{key}</th>
                    {/each}
                </tr>
            {/if}
        </thead>
        <tbody>
        {#each tableData as row, index}
            <tr data-row={index}>
                {#each fields as key}
                    {#if key === "c"}
                        <td>
                            <Checkbox
                                initialState={row ? row.c ?? 0 : 0}
                                disabled={row ? false : true}
                                color={table.color}
                                zeroToOne={zeroToOne}
                                oneToTwo={oneToTwo}
                                twoToOne={twoToOne}
                                oneToZero={oneToZero}
                                twoToZero={twoToZero}
                            />
                        </td>
                    {:else}
                        {#if row}
                            <td>{@html row[key] ?? ''}</td>
                        {:else}
                            <td></td>
                        {/if}
                    {/if}
                {/each}
            </tr>
        {/each}
        </tbody>
    </table>
</div>