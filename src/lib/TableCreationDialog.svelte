<!-- temporary -->

<script lang="ts">
    import type { Table } from "./types";

    let { onCreateRequested, onClose } = $props<{
        onCreateRequested: (details: Omit<Table, "fields">) => void;
        onClose: () => void;
    }>();

    const primaryColors = [
        "#70ad47",
        "#ed7d31",
        "#bd2be5",
        "#ff3d3d",
        "#ffc000",
        "#4a90e2",
        "#50c878",
        "#f39c12",
        "#9b59b6",
        "#ff6b6b",
        "#dab83c",
        "#659ad9",
    ];

    const secondaryColors = [
        "#263b19",
        "#4c2408",
        "#4e0d5b",
        "#892a2a",
        "#4c4100",
        "#1e3a5f",
        "#1a4d2e",
        "#3d2b1f",
        "#5d2e6b",
        "#b83a3a",
        "#6b6228",
        "#2b4d6b",
    ];

    let name = $state("new table");
    let color = $state(primaryColors[0]);
    let secondaryColor = $state(secondaryColors[0]);
    let isVisible = $state(false);

    $effect(() => {
        setTimeout(() => {
            isVisible = true;
        }, 10);
    });

    function handleSubmit() {
        if (name.trim()) {
            onCreateRequested({ name: name.trim(), color, secondaryColor });
            onClose();
        } else {
            alert("Table name cannot be empty.");
        }
    }

    function handleCancel() {
        onClose();
    }

    // Close on Escape key
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            handleCancel();
        }
    }

    function setColor(selectedColor: string, isPrimary: boolean) {
        if (isPrimary) {
            color = selectedColor;
            // Find the index and set corresponding secondary color
            const index = primaryColors.indexOf(selectedColor);
            if (index !== -1 && index < secondaryColors.length) {
                secondaryColor = secondaryColors[index];
            }
        } else {
            secondaryColor = selectedColor;
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />
<div class="modal" class:visible={isVisible}>
    <form onsubmit={handleSubmit}>
        <div>
            <div class="table-name-section">
                <label for="tableName">> </label>
                <input
                    type="text"
                    autocomplete="off"
                    id="tableName"
                    bind:value={name}
                    required
                />
            </div>
        </div>
        <div>
            <div class="color-section">
                <div class="color-input-container">
                    <input type="color" id="primaryColor" bind:value={color} />
                    <label for="primaryColor" class="color-label primary-label"
                        >primary color</label
                    >
                </div>
                <div class="color-grid">
                    {#each primaryColors as defaultColor}
                        <button
                            type="button"
                            class="color-square"
                            style="background-color: {defaultColor}"
                            aria-label="Set primary color to {defaultColor}"
                            onclick={() => setColor(defaultColor, true)}
                        ></button>
                    {/each}
                </div>
            </div>
        </div>
        <div>
            <div class="color-section">
                <div class="color-input-container">
                    <input
                        type="color"
                        id="secondaryColor"
                        bind:value={secondaryColor}
                    />
                    <label
                        for="secondaryColor"
                        class="color-label secondary-label"
                        >secondary color</label
                    >
                </div>
                <div class="color-grid">
                    {#each secondaryColors as defaultColor}
                        <button
                            type="button"
                            class="color-square"
                            style="background-color: {defaultColor}"
                            aria-label="Set secondary color to {defaultColor}"
                            onclick={() => setColor(defaultColor, false)}
                        ></button>
                    {/each}
                </div>
            </div>
        </div>
        <footer>
            <button type="button" class="menu-btn" onclick={handleCancel}
                >Cancel</button
            >
            <button type="submit" class="menu-btn create-btn"
                >Create Table</button
            >
        </footer>
    </form>
</div>

<style>
    .modal {
        position: absolute;
        top: 50%;
        left: calc(100% + 2em);
        background-color: color-mix(
            in srgb,
            var(--background-color),
            rgba(10, 10, 10, 0.5) 90% /* rgba(200, 200, 200, 0.05) 90% */
        );
        backdrop-filter: blur(10px);
        border: 3px solid black;
        border-radius: 0px;
        padding: 24px;
        box-shadow: 12px 12px 0px rgba(0, 0, 0, 0.3);
        color: var(--color);
        text-shadow:
            0 0 2px rgba(0, 0, 0, 0.25),
            0 0 6px rgba(0, 0, 0, 0.15),
            0 0 12px rgba(0, 0, 0, 0.05);
        min-width: 320px;
        max-width: 500px;

        transform: translateY(-50%) translateX(-20px) scale(0.95);
        transition:
            transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275),
            opacity 0.3s ease;
        opacity: 0;
        z-index: 1000;
    }

    .modal.visible {
        transform: translateY(-50%) translateX(0) scale(1);
        opacity: 1;
    }

    form div {
        margin-bottom: 20px;
    }

    label {
        display: block;
        margin-bottom: 8px;
    }

    input[type="text"] {
        width: 100%;
        font-size: 24px;
        font-weight: 800;
        border: none;
        background-color: transparent;
        outline: none;
        color: var(--color);
    }

    input[type="color"] {
        width: 100%;
        outline: none;
        padding: 0;
        border: 2px solid black;
        box-sizing: border-box;
        border-radius: 0px;
        height: 40px;
        margin-bottom: 10px;
        cursor: pointer;
    }

    input[type="color"]::-webkit-color-swatch-wrapper {
        padding: 0;
    }

    input[type="color"]::-webkit-color-swatch {
        border: none;
        border-radius: 0px;
    }

    .color-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .color-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 8px;
    }

    .color-square {
        width: 100%;
        aspect-ratio: 1;
        border: 2px solid black;
        border-radius: 0px;
        cursor: pointer;
        transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
    }

    .color-square:hover {
        transform: translate(-1px, -1px);
        box-shadow: 2px 2px 0px black;
    }

    footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 24px;
    }

    .menu-btn {
        background-color: color-mix(
            in srgb,
            var(--background-color),
            transparent 20%
        );
        backdrop-filter: blur(8px);
        border: 2px solid black;
        border-radius: 0px;
        padding: 10px 16px;
        color: var(--color);
        font-weight: 800;
        cursor: pointer;
        box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.2);
        transition: all 0.1s ease;
    }

    .menu-btn:hover {
        transform: translate(-1px, -1px);
        box-shadow: 5px 5px 0px rgba(0, 0, 0, 0.2);
    }

    .menu-btn:active {
        transform: translate(2px, 2px);
        box-shadow: 0px 0px 0px rgba(0, 0, 0, 0.2);
    }

    .create-btn {
        background-color: rgba(81, 255, 0, 0.1);
    }

    .color-input-container {
        position: relative;
    }

    .color-label {
        position: absolute;
        top: 6px;
        left: 10px;
        pointer-events: none;
        z-index: 1;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .table-name-section {
        display: flex;
        align-items: center;
        border-bottom: 2px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 10px;
    }

    .table-name-section label {
        margin-right: 12px;
        font-weight: 1000;
        margin-bottom: 0;
        font-size: 24px;
    }

    .primary-label {
        color: black;
    }
    .secondary-label {
        color: var(--color-state-1);
    }
</style>
