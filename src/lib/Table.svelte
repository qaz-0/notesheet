<script lang="ts">
    import './Table.css';
    import plusIcon from '../assets/square-plus.svg';
    import { getTable, editItem, getItemById, getAllTableMetadata, addFieldMetadata, removeFieldMetadata, deleteItem, deleteTable, getTableMetadata, setTableMetadata, shiftItems } from './db';
    import { Direction, type CheckboxState, type Field, type Item, type Table } from './types';
    import Checkbox from './Checkbox.svelte';
    import markdownit from 'markdown-it'
    import { getContext } from 'svelte';

    let { table }: { table: Table } = $props();
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
    let tableCount = getContext<() => any>('tableCount');

    async function loadTableData() {
        const newTableData = [];
        const data = await getTable(tableId);
        let maxIndex = data[data.length - 1]?.id as number ?? 0;
        // let maxIndex = data[data.length - 1].id as number;
        checkboxIndex = fields.findIndex((f) => f.id == "c");

        let dataIdx = 0;
        let rowNum = 0;
        for (let i = 0; i < maxIndex + ADDITIONAL_ROWS; i++) {
            let item = data[dataIdx];
            if (item && item.id == i) {
                if (item.c == 2) {
                    await deleteItem(tableId, rowNum);
                } else {
                    newTableData.push(item);
                    rowNum++
                }
                dataIdx++;
            } else {
                newTableData.push(null);
                rowNum++
            }
        }

        tableData = newTableData;

    }

    loadTableData();
    if (table.name.toLowerCase() != "history") tableCount().value++;

    function startResize(event: PointerEvent, index: number) {
        if (!isEditing) return;
        event.preventDefault();
        event.stopPropagation();
        resizingColumnIndex = index;
        startX = event.clientX;
        const th = (event.target as HTMLElement).closest('th') as HTMLTableCellElement;
        startWidth = th.offsetWidth;

        window.addEventListener('pointermove', doResize);
        window.addEventListener('pointerup', stopResize);
    }

    function doResize(event: PointerEvent) {
        if (resizingColumnIndex === null) return;
        event.preventDefault();
        const diffX = event.clientX - startX;
        let newWidth = startWidth + diffX;
        if (newWidth < MIN_COLUMN_WIDTH) {
            newWidth = MIN_COLUMN_WIDTH;
        }

        const ths = tableContainer.querySelectorAll('thead th');
        if (ths[resizingColumnIndex]) {
            const th = ths[resizingColumnIndex] as HTMLTableCellElement;
            th.style.width = `${newWidth}px`;
        }
    }

    async function stopResize() {
        if (resizingColumnIndex === null) return;

        const ths = tableContainer.querySelectorAll('thead th');
        if (ths[resizingColumnIndex]) {
            const th = ths[resizingColumnIndex] as HTMLTableCellElement;
            const newWidth = th.offsetWidth;

            const fieldToUpdate = fields[resizingColumnIndex];
            if (fieldToUpdate && fieldToUpdate.size !== newWidth) {
                const newFieldData = { ...fieldToUpdate, size: newWidth };
                fields[resizingColumnIndex] = newFieldData;
                await addFieldMetadata(tableId, newFieldData, resizingColumnIndex);
            }
        }

        window.removeEventListener('pointermove', doResize);
        window.removeEventListener('pointerup', stopResize);
        resizingColumnIndex = null;
    }

    function handleTableClick(e: PointerEvent) {
        const target = e.target as HTMLElement;
        const caption = target.closest("caption");

        const headerCell = target.closest("thead th") as (HTMLTableCellElement | null);
        const bodyCell = target.closest("tbody td") as (HTMLTableCellElement | null);
        const bodyCellParent = bodyCell?.parentElement;

        if (caption) {
            const tableNameElement = caption.firstElementChild as HTMLElement;
            if (target == tableNameElement) {
                tableNameElement.classList.add('edit');
                tableNameElement.contentEditable = "true";

                const blurHandler = async () => {
                    tableNameElement.removeEventListener("blur", blurHandler);
                    tableNameElement.classList.remove('edit');
                    tableNameElement.removeAttribute('contenteditable');

                    const newName = tableNameElement.innerText.trim();
                    if (newName) {
                        const table = await getTableMetadata(tableId);
                        table.name = newName;
                        await setTableMetadata(table);
                    }
                };

                tableNameElement.addEventListener("blur", blurHandler);
            } else {
                setTimeout(() => {
                    isEditing = !isEditing;
                },1)
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

    function getCell(currentCell: HTMLTableCellElement, direction: Direction): HTMLTableCellElement | null {
        let nextCell: HTMLTableCellElement | null = null;
        switch (direction) {
            case Direction.Up:
                const prevRow = currentCell.parentElement?.previousElementSibling as HTMLTableRowElement;
                if (prevRow?.hasAttribute("data-row")) {
                    nextCell = prevRow.children[currentCell.cellIndex] as HTMLTableCellElement;
                }
                break;
            case Direction.Down:
                const nextRow = currentCell.parentElement?.nextElementSibling as HTMLTableRowElement;
                if (nextRow?.hasAttribute("data-row")) {
                    nextCell = nextRow.children[currentCell.cellIndex] as HTMLTableCellElement;
                }
                break;
            case Direction.Left:
                const prevSibling = currentCell.previousElementSibling;
                if (prevSibling && (prevSibling.tagName === 'TD' || prevSibling.tagName === 'TH')) {
                    nextCell = prevSibling as HTMLTableCellElement;
                }
                break;
            case Direction.Right:
                const nextSibling = currentCell.nextElementSibling;
                if (nextSibling && (nextSibling.tagName === 'TD' || nextSibling.tagName === 'TH')) {
                    nextCell = nextSibling as HTMLTableCellElement;
                }
                break;
        }
        return nextCell;
    }

    function navigate(currentCell: HTMLTableCellElement, event: KeyboardEvent, direction?: Direction): { nextCell: HTMLTableCellElement | null, isCheckbox: boolean, goToStart?: boolean } {
        // const row = currentCell.parentElement as HTMLTableRowElement;
        const cellIndex = currentCell.cellIndex;
        const selection = window.getSelection();

        let isAtStart = false, isAtEnd = false;
        let bypass = event.altKey || event.key === "Tab" || cellIndex === checkboxIndex;

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

        if (!direction) {
            switch (event.key) {
                case "ArrowUp":
                    direction = Direction.Up;
                    break;
                case "ArrowDown":
                    direction = Direction.Down;
                    break;
                case "ArrowLeft":
                    direction = Direction.Left;
                    break;
                case "ArrowRight":
                    direction = Direction.Right;
                    break;
                case "Tab":
                    direction = event.shiftKey ? Direction.Left : Direction.Right;
                    break;
                default:
                    return { nextCell: null, isCheckbox: false }
            }
        }

        let nextCell: HTMLTableCellElement | null = null;
        let goToStart: boolean | undefined = undefined;
        let isCheckbox = false;

        if (direction == Direction.UpOrDown) {
            let tempNextCell = getCell(currentCell, Direction.Down);
            if (tempNextCell == null) tempNextCell = getCell(currentCell, Direction.Up);
            goToStart = isAtStart || !isAtEnd
            nextCell = tempNextCell
        }

        if (isAtEnd || bypass) {
            if (direction == Direction.Down) {
                nextCell = getCell(currentCell, Direction.Down);
                goToStart = false;
            } else if (direction == Direction.Right) {
                nextCell = getCell(currentCell, Direction.Right)
                goToStart = false
            }
        }

        if (isAtStart || bypass) {
            if (direction == Direction.Up) {
                nextCell = getCell(currentCell, Direction.Up);
                goToStart = true
            } else if (direction == Direction.Left) {
                nextCell = getCell(currentCell, Direction.Left)
                goToStart = true
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

    async function editCell(cell: HTMLTableCellElement, isHeader: boolean, atStart?: boolean) {
        if (cell.isContentEditable) return;

        const row = cell.parentElement as HTMLTableRowElement;
        const rowNum = Number(row.getAttribute("data-row"));
        const originalText = cell.innerText.trimEnd();
        if (!isHeader) {
            const item = await getItemById(tableId, rowNum)
            const plainText = item ? item[cell.cellIndex] ?? '' : '';
            if (cell.innerText !== plainText) cell.textContent = plainText;
        }

        cell.classList.add('edit');
        cell.contentEditable = "true";

        setTimeout(() => {
            cell.focus();

            if (atStart !== undefined) {
                // move cursor to start or end
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
            let direction: Direction | undefined;
            let navResult;
            switch (event.key) {
                case "Delete":

                    event.preventDefault();

                    // delete row
                    if (!isHeader) {
                        if (confirm(`Are you sure you want to delete row ${rowNum}?`)) {
                            direction = Direction.UpOrDown

                            await finishEdit(true);
                            await shiftItems(tableId, rowNum, true)
                            await loadTableData();
                            navResult = navigate(cell, event, direction);
                            if (navResult?.nextCell)
                                editCell(cell, false, navResult.goToStart);

                        }
                        break;
                    }

                    await finishEdit(true, originalText);
                    console.log(cell.cellIndex)
                    const fieldToRemove = fields[cell.cellIndex];
                    if (fieldToRemove && confirm(`Are you sure you want to delete the column "${fieldToRemove.name}"?`)) {
                        await removeFieldMetadata(tableId, fieldToRemove, cell.cellIndex);
                        fields = fields.filter(field => field !== fieldToRemove);

                        checkboxIndex = fields.findIndex((f) => f.id == "c");

                        console.log(fields.length)
                        if (fields.length === 0) {
                            console.log("remove", tableContainer);
                            tableContainer.remove();
                            await deleteTable(tableId);
                            console.log("remove", tableContainer);
                        } else {
                            fieldsKey++;
                            loadTableData();
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
                default:
                    navResult = navigate(cell, event, direction);
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

            // } else if (event.key === "Escape") {

            // } else if (event.key === "Delete") {

            // } else if (isHeader && event.key === "Enter") {
            // }
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

            const newText = isHeader ? cell.innerText.trim() : cell.innerText;
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
                    const newField = { name: newText, size: oldField.size};

                    if (oldField.name !== newField.name) {
                        if (confirm(`Are you sure you want to rename the column "${originalText}" to "${newText}"?`)) {
                            fields[cellIndex] = newField;
                            await addFieldMetadata(tableId, newField, cellIndex);
                            // loadTableData();
                        } else {
                            cell.innerHTML = restoreText ?? originalText;
                        }
                    }
                } else {
                    const newItem: Item = { id: rowNum };
                    if (cellIndex < fields.length) {
                        newItem[cellIndex] = newText;
                        // if done, dont edit
                        // if not done and empty disable
                        // if not done and become not empty, enable
                        if (checkboxIndex !== -1) {
                            const checkbox = row.children[checkboxIndex].firstChild as HTMLDivElement;
                            const disabled = checkbox.getAttribute("data-disabled");
                            const state = Number(row.getAttribute("data-state"));
                            if (state !== 2) {
                                const resultItem = await editItem(tableId, newItem);
                                if (!disabled && !resultItem) {
                                    checkbox.setAttribute("data-disabled", "true");
                                }

                                if (disabled === "true" && resultItem) checkbox.removeAttribute("data-disabled");
                                if (newText.endsWith("\nm")) {
                                    cell.innerHTML = md.render(newText.slice(0, -2))
                                }
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
        const newFieldName = prompt("Enter new column name:");
        if (newFieldName) {
            const newField: Field = { name: newFieldName, size: 100 };
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
            const newItem: Item = { id: rowNum, 'c': 2 };
            editItem(tableId, newItem);
            row.setAttribute("data-state", "2");
        }
    };

    function twoToOne(checkbox: HTMLDivElement) {
        const { row, rowNum } = checkboxGetRowData(checkbox);
        if (row) {
            // restore item
            const newItem: Item = { id: rowNum, 'c': 1 };
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
            // const newItem: Item = { id: rowNum, 'c': 0 };
            // Array.prototype.forEach.call(row.children, child => {
            //     if (child.cellIndex === checkboxIndex) return;
            //     newItem[fields[child.cellIndex]] = child.innerText;
            // });
            // editItem(tableId, newItem);
            const newItem: Item = { id: rowNum, 'c': 0 };
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
        <caption style={`background-color: ${table.color}`}>
            <span>{table.name}</span>
        </caption>
        <thead>
            <tr style={`visibility: ${isEditing ? 'visible' : 'collapse'}`}>
                {#key fieldsKey}
                    {#each fields as field, i}
                        <th style="width: {field.id === 'c' ? '1lh' : field.size + 'px'}">
                            {field.name}{#if field.id !== 'c'}
                                <span
                                    class="resize-handle"
                                    onpointerdown={(e) => startResize(e, i)}>
                                </span>
                            {/if}
                        </th>
                    {/each}
                {/key}
            </tr>
        </thead>
        <tbody>
        {#each tableData as row, i}
            <tr data-row={i} data-k={row ? row.k ?? row.k : null}>
                {#each fields as field, i}
                    {#if field.id === "c"}
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
                    {:else if !field.id}
                        {#if row}
                            <td>
                                {#if row[i]?.endsWith("\nm")}
                                    {@html md.render(row[i]?.slice(0, -2) ?? '')}
                                {:else}
                                    {@html row[i] ?? ''}
                                {/if}
                            </td>
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