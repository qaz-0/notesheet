<!-- temporary -->

<script lang="ts">
    import type { Table } from './types';

    // Use $props() rune to declare props
    let { onCreateRequested, onClose } = $props<{
        onCreateRequested: (details: Omit<Table, 'fields'>) => void;
        onClose: () => void;
    }>();

    let name = $state('');
    let color = $state('#ff0000'); // Default red
    let secondaryColor = $state('#ff0000'); // Default red
    let dialogElement: HTMLDialogElement | undefined = $state();

    $effect(() => {
        dialogElement?.showModal();
    });

    // Called ONLY when the dialog's native 'close' event fires.
    function handleDialogClose() {
        // Check if the dialog was closed via the "Create" button's submission
        if (dialogElement?.returnValue === 'create') {
            if (name.trim()) {
                // Call the parent's callback function with the data
                onCreateRequested({ name: name.trim(), color, secondaryColor });
            } else {
                // Handle case where required field is empty on submit
                alert('Table name cannot be empty.');
                // Consider preventing close or re-opening if validation fails,
                // but for now, we just alert and proceed to close.
            }
        }
        // Always notify the parent that the dialog has closed.
        onClose();
    }

    // Function to explicitly close the dialog (e.g., via Cancel button or backdrop click)
    function triggerClose() {
        dialogElement?.close(); // This triggers the 'close' event, calling handleDialogClose
    }

    // Close dialog on backdrop click (using on:click directive)
    function handleClick(event: MouseEvent) {
        // Ensure the click is directly on the dialog backdrop, not on its children
        if (event.currentTarget === event.target && event.currentTarget === dialogElement) {
            triggerClose();
        }
    }

    // Close dialog on Escape key
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
             // Native behavior closes on Escape, triggering 'close' event.
             // Explicit call might be redundant but ensures our logic runs if needed.
             triggerClose();
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Use on:click for backdrop click -->
<!-- Use on:close to handle the dialog closing and decide action -->
<dialog bind:this={dialogElement} onclick={handleClick} onclose={handleDialogClose}>
    <h2>Create New Table</h2>
    <!-- Use standard form submission with method="dialog" -->
    <!-- Remove on:submit handler -->
    <form method="dialog">
        <div>
            <label for="tableName">Table Name:</label>
            <input type="text" id="tableName" bind:value={name} required />
        </div>
        <div>
            <label for="primaryColor">Primary Color:</label>
            <input type="color" id="primaryColor" bind:value={color} />
        </div>
        <div>
            <label for="secondaryColor">Secondary Color:</label>
            <input type="color" id="secondaryColor" bind:value={secondaryColor} />
        </div>
        <footer>
            <!-- Use on:click for the cancel button -->
            <button type="button" onclick={triggerClose}>Cancel</button>
            <!-- Create button submits the form, closing the dialog with returnValue='create' -->
            <button type="submit" value="create">Create</button>
        </footer>
    </form>
</dialog>

<style>
    dialog {
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        min-width: 300px;
    }

    dialog::backdrop {
        background-color: rgba(0, 0, 0, 0.5);
    }

    h2 {
        margin-top: 0;
        margin-bottom: 20px;
        text-align: center;
    }

    form div {
        margin-bottom: 15px;
    }

    label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
    }

    input[type="text"],
    input[type="color"] {
        width: 100%;
        padding: 8px;
        box-sizing: border-box;
        border: 1px solid #ccc;
        border-radius: 4px;
    }

     input[type="color"] {
        height: 40px; /* Adjust height for color input */
        padding: 2px; /* Minimal padding for color input */
    }

    footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
    }

    button {
        padding: 8px 15px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    button[type="submit"] {
        background-color: #007bff;
        color: white;
    }

    button[type="button"] {
        background-color: #ccc;
    }
</style>
