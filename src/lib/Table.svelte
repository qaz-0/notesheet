<script lang="ts">
    import './Table.css';
    import plusIcon from '../assets/square-plus.svg'
    import { getAllContexts } from 'svelte';
    import { getKeys, getTable, editItem, getItemById } from './db';
    import type { Item } from './types';

    let { name } = $props();
    let tableData: (Item | null)[] = $state([]);
    let keysState: string[] = $state([]);

    async function loadTableData() {
        const { data, keys } = await getTable(name);
        keysState = keys.slice(1);
        console.log(keys)

        for (let i = 0; i < 100; i++) {
            if (data.length > 0 && data[data.length - 1].id == i)
                tableData.push(data.pop()!);
            else
                tableData.push(null);
        }
    }

    loadTableData();
    function handleTableClick(e: PointerEvent) {
        const cell = (e.target as HTMLElement).closest("td");
        if (cell) editCell(cell);
    }

    function editCell(cell: HTMLTableCellElement) {
        if (cell.contains(document.querySelector("textarea"))) return;

        const row = cell?.parentElement;
        if (!row || !row.hasAttribute("data-row")) return;

        const rowNum = Number(row.getAttribute("data-row"));

        // prevent flicker
        const computedStyle = window.getComputedStyle(cell);
        const cellHeight = computedStyle.height;
        cell.style.minHeight = cellHeight;

        let textarea: HTMLTextAreaElement = document.createElement("textarea");
        const originalText = cell.innerText;
        cell.innerText = "";
        textarea.value = originalText;
        cell.appendChild(textarea);

        setTimeout(() => {
            cell.style.minHeight = '';
            textarea.style.height = textarea.scrollHeight + "px";
            textarea.focus();
            textarea.select();
        }, 0);

        textarea.addEventListener("keydown", (event) => {
            const cursorPosition = textarea.selectionStart;
            const textLength = textarea.value.length;

            let nextCell: HTMLTableCellElement | null = null;

            if (cursorPosition === textLength) {
                if (event.key === "ArrowDown") {
                    const nextRow = row.nextElementSibling as HTMLTableRowElement;
                    if (nextRow) {
                        nextCell = nextRow.children[cell.cellIndex] as HTMLTableCellElement;
                    }
                } else if (event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)) {
                    nextCell = cell.nextElementSibling as HTMLTableCellElement;
                }
            }

            if (cursorPosition === 0) {
                if (event.key === "ArrowUp") {
                    const prevRow = row.previousElementSibling as HTMLTableRowElement;
                    if (prevRow) {
                        nextCell = prevRow.children[cell.cellIndex] as HTMLTableCellElement;
                    }
                } else if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) {
                    nextCell = cell.previousElementSibling as HTMLTableCellElement;
                }
            }

            if (nextCell) {
                event.preventDefault(); // prevents scroll
                finishEdit();
                editCell(nextCell)
            }
        });

        async function finishEdit() {
            const newText = textarea.value;
            textarea.removeEventListener("blur", finishEdit); // important
            cell.innerText = newText;
            textarea.remove();

            if (newText !== originalText) {
                const newItem: Item = { id: rowNum };
                newItem[keysState[cell.cellIndex]] = newText;
                await editItem(name, newItem);
            }
        }

        textarea.addEventListener("blur", finishEdit);

        textarea.addEventListener("input", function() {
            this.style.height = "0";
            this.style.height = this.scrollHeight + "px";
        });
    }

    function addColumn() {
        const newKey = prompt("Enter new column name:"); // Re-added prompt for new column name
        if (newKey) {
            keysState.push(newKey);
        }
    }
</script>

<div class="table-container">
    <div class="add-column-container">
        <div class="add-column" onpointerup={addColumn}><img src={plusIcon} alt="add column"></div>
    </div>
    <table class="table" onpointerdown={handleTableClick}>
        <tbody>
        <tr>
            <th>{name}</th>
        </tr>
        <tr class="hidden-row">
            {#each keysState as key }
                <td>{key}</td>
            {/each}
        </tr>
        {#each tableData as row, index}
            <tr data-row={index}>
                {#each keysState as key}
                    {#if row}
                        <td>{row[key]}</td>
                    {:else}
                        <td></td>
                    {/if}
                {/each}
            </tr>
        {/each}
        </tbody>
    </table>
</div>
