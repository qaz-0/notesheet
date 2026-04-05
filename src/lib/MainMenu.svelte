<script lang="ts">
  import Icon from "./Icon.svelte";
  import { exportDataToJson } from "./db";
  import { onMount } from "svelte";

  let {
    syncEnabled,
    toggleSync,
    syncManager,
    onImport,
    onPairing,
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    deferredPrompt,
  } = $props<{
    syncEnabled: boolean;
    toggleSync: () => void;
    syncManager: any;
    onImport: () => void;
    onPairing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    handleUndo: () => void;
    handleRedo: () => void;
    deferredPrompt: any;
  }>();

  let isOpen = $state(false);
  const DEFAULT_BG_COLOR = "#20263c";
  let bgColor = $state(
    localStorage.getItem("app-bg-color") || DEFAULT_BG_COLOR,
  );

  onMount(() => {
    document.documentElement.style.setProperty("--background-color", bgColor);
  });

  function updateBg(color: string) {
    bgColor = color;
    console.log(color);
    document.documentElement.style.setProperty("--background-color", color);
    localStorage.setItem("app-bg-color", color);
  }

  function handleMenuClick(e: MouseEvent) {
    e.stopPropagation();
    isOpen = !isOpen;
    // isOpen = true;
  }

  function closeMenu() {
    isOpen = false;
  }
</script>

<!-- <svelte:window onclick={closeMenu} /> -->

<div class="main-menu-container">
  <div class="undo-redo-controls">
    <button
      class="menu-btn icon-btn"
      onclick={handleUndo}
      disabled={!canUndo}
      title="Undo"
    >
      <Icon name="undo" size={20} />
    </button>
    <button
      class="menu-btn icon-btn"
      onclick={handleRedo}
      disabled={!canRedo}
      title="Redo"
    >
      <Icon name="redo" size={20} />
    </button>
  </div>

  <div class="menu-wrapper">
    <button
      class="menu-btn primary-menu-btn"
      class:open={isOpen}
      onclick={handleMenuClick}
    >
      <Icon name={isOpen ? "x" : "more-vertical"} size={20} />
      <span>Menu</span>
    </button>

    {#if isOpen}
      <div class="menu-dropdown" aria-hidden={!isOpen}>
        <div class="menu-section">
          <div class="section-header">
            <label for="bg-color-picker">Background Color</label>
            <button
              class="reset-btn"
              onclick={() => updateBg(DEFAULT_BG_COLOR)}
              title="Reset to default"
            >
              Reset
            </button>
          </div>
          <div class="bg-swatch-container">
            <input
              id="bg-color-picker"
              type="color"
              value={bgColor}
              oninput={(e: any) => updateBg(e.target.value)}
            />
            <div
              class="swatch-overlay"
              style="background-color: {bgColor};"
            ></div>
          </div>
        </div>

        <div class="menu-divider"></div>

        <button
          class="menu-item"
          onclick={() => {
            onImport();
            closeMenu();
          }}
        >
          <Icon name="upload" size={18} />
          <span>Import Data</span>
        </button>
        <button
          class="menu-item"
          onclick={() => {
            exportDataToJson();
            closeMenu();
          }}
        >
          <Icon name="download" size={18} />
          <span>Export Data</span>
        </button>

        <div class="menu-divider"></div>

        <button
          class="menu-item"
          onclick={() => {
            toggleSync();
            closeMenu();
          }}
        >
          <Icon name="sync" size={18} />
          <span>{syncEnabled ? "Disable Sync" : "Enable Sync"}</span>
        </button>

        {#if syncEnabled}
          <button
            class="menu-item"
            onclick={() => {
              onPairing();
              closeMenu();
            }}
          >
            <Icon name="link" size={18} />
            <span>Pair Device</span>
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .main-menu-container {
    font-family: inherit;
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .undo-redo-controls {
    display: flex;
    gap: 8px;
    background-color: color-mix(
      in srgb,
      var(--background-color),
      rgba(10, 10, 10, 0.5) 90%
    );
    backdrop-filter: blur(8px);
    border: 2px solid black;
    border-radius: 0px;
    padding: 4px;
    box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.2);
  }

  .menu-wrapper {
    position: relative;
  }

  .menu-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: color-mix(
      in srgb,
      var(--background-color),
      rgba(10, 10, 10, 0.5) 90%
    );
    backdrop-filter: blur(8px);
    border: 2px solid black;
    border-radius: 0px;
    padding: 8px 12px;
    color: var(--color);
    font-weight: 800;
    cursor: pointer;
    box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.2);
    transition: all 0.1s ease;
  }

  .menu-btn:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    background-color: rgba(255, 255, 255, 0.1);
    box-shadow: 5px 5px 0px rgba(0, 0, 0, 0.2);
  }

  .menu-btn:active:not(:disabled),
  .menu-btn.open {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0px rgba(0, 0, 0, 0.2);
  }

  .icon-btn {
    padding: 4px;
    border-radius: 0px;
    border: none;
    box-shadow: none;
    background: transparent;
  }

  .icon-btn:hover:not(:disabled) {
    transform: scale(1.15);
    box-shadow: none;
  }

  .icon-btn:disabled {
    opacity: 0.2;
    cursor: not-allowed;
  }

  .menu-dropdown {
    font-family: inherit;
    position: absolute;
    bottom: calc(100% + 16px);
    right: 0;
    min-width: 240px;
    background-color: color-mix(
      in srgb,
      var(--background-color),
      rgba(10, 10, 10, 0.5) 90% /* rgba(200, 200, 200, 0.05) 90% */
    );
    backdrop-filter: blur(14px);
    border: 3px solid black;
    border-radius: 0px;
    padding: 12px;
    box-shadow: 10px 10px 0px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    gap: 4px;
    animation: slide-up 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(15px) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .menu-section {
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .menu-section label {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.5;
    margin-bottom: 0;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .reset-btn {
    background: none;
    border: none;
    color: var(--color);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.1s ease;
    padding: 2px 4px;
    border-radius: 4px;
  }

  .reset-btn:hover {
    opacity: 1;
    background-color: rgba(255, 255, 255, 0.1);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border: none;
    background: none;
    color: var(--color);
    text-align: left;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    border-radius: 0px;
    transition: all 0.15s ease;
  }

  .menu-item:hover {
    background-color: rgba(255, 255, 255, 0.1);
    transform: translateX(4px);
    color: white;
  }

  .menu-divider {
    height: 2px;
    background-color: rgba(0, 0, 0, 0.15);
    margin: 8px 0;
  }

  .bg-swatch-container {
    position: relative;
    width: 100%;
    height: 40px;
    border-radius: 0px;
    border: 2px solid black;
    overflow: hidden;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .bg-swatch-container input {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    z-index: 2;
  }

  .swatch-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
  }

  span {
    flex: 1;
  }
</style>
