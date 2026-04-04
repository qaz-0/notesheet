<script lang="ts">
  import Icon from "./Icon.svelte";
  import { onMount } from "svelte";

  let { items, x, y, onClose } = $props<{
    items: {
      label: string;
      icon?: any;
      onClick: () => void;
      disabled?: boolean;
      danger?: boolean;
    }[];
    x: number;
    y: number;
    onClose: () => void;
  }>();

  let menuElement: HTMLElement;
  let adjustedX = $state(x);
  let adjustedY = $state(y);

  onMount(() => {
    // Adjust position if it goes off screen
    const rect = menuElement.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) adjustedX -= rect.width;
    if (y + rect.height > window.innerHeight) adjustedY -= rect.height;
  });

  function handleWindowClick(e: MouseEvent) {
    if (menuElement && !menuElement.contains(e.target as Node)) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div
  class="context-menu"
  bind:this={menuElement}
  style="top: {adjustedY}px; left: {adjustedX}px;"
>
  {#each items as item}
    <button
      class="menu-item"
      class:danger={item.danger}
      onclick={(e) => {
        e.stopPropagation();
        item.onClick();
        onClose();
      }}
      disabled={item.disabled}
    >
      {#if item.icon}
        <Icon name={item.icon} size={16} />
      {/if}
      <span>{item.label}</span>
    </button>
  {/each}
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 10000;
    min-width: 200px;
    background-color: color-mix(
      in srgb,
      var(--background-color),
      transparent 10%
    );
    backdrop-filter: blur(15px);
    border: 2px solid black;
    box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    animation: pop-in 0.1s ease-out;
  }

  @keyframes pop-in {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(5px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .menu-item {
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: none;
    background: none;
    color: var(--color);
    text-align: left;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.1s ease;
  }

  .menu-item:hover:not(:disabled) {
    background-color: color-mix(in srgb, var(--color), transparent 90%);
    transform: translateX(2px);
  }

  .menu-item:active:not(:disabled) {
    transform: translateX(0);
  }

  .menu-item:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .menu-item.danger {
    color: #ff4d4d;
  }

  .menu-item.danger:hover:not(:disabled) {
    background-color: rgba(255, 77, 77, 0.1);
  }

  span {
    flex: 1;
  }
</style>
