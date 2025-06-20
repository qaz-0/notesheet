<script lang="ts">
    import { onMount } from 'svelte';
    // @ts-ignore
    import { registerSW } from 'virtual:pwa-register';

    let showReload = false;
    let swUpdate: (reloadPage?: boolean) => Promise<void>;

    onMount(() => {
        swUpdate = registerSW({
            onNeedRefresh() {
                showReload = true;
            },
        });
    });

    function reload() {
        swUpdate(true);
    }
</script>

{#if showReload}
    <div class="pwa-toast">
        <span>
            New version available.
        </span>
        <button on:click={reload}>Reload</button>
    </div>
{/if}

<style>
    .pwa-toast {
        position: fixed;
        right: 1em;
        bottom: 1em;
        background: #222;
        color: white;
        padding: 12px;
        border-radius: 4px;
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .pwa-toast button {
        background-color: #4CAF50;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
    }
</style>