<script lang="ts">
  import "./Checkbox.css";
  import type { CheckboxState } from "./types";

  let {
    initialState,
    syncKey = null,
    disabled = false,
    color = "#ff3e00",
    zeroToOne = async () => {},
    oneToTwo = async () => {},
    twoToOne = async () => {},
    oneToZero = async () => {},
    twoToZero = async () => {},
  }: {
    initialState: CheckboxState;
    disabled?: boolean;
    color?: string;
    zeroToOne?: (checkbox: HTMLDivElement) => Promise<void>;
    oneToTwo?: (checkbox: HTMLDivElement) => Promise<void>;
    twoToOne?: (checkbox: HTMLDivElement) => Promise<void>;
    oneToZero?: (checkbox: HTMLDivElement) => Promise<void>;
    twoToZero?: (checkbox: HTMLDivElement) => Promise<void>;
    syncKey?: any;
  } = $props();

  let state: CheckboxState = $state(initialState);

  // Sync internal state when initialState prop changes (e.g., on undo/redo)
  $effect(() => {
    syncKey; // Force effect to rerun when syncKey changes
    state = initialState;
  });

  async function handleClick(event?: MouseEvent | KeyboardEvent) {
    const disabled =
      (event?.currentTarget as HTMLElement).getAttribute("data-disabled") ===
      "true";
    if (disabled) return;
    const isCtrlClick = event?.shiftKey ?? false;
    const checkbox = event?.currentTarget as HTMLDivElement;

    // Pessimistic updates: only update state after async operation succeeds
    try {
      if (isCtrlClick) {
        // Go back a state
        if (state === 1) {
          await oneToZero(checkbox);
          state = 0;
        } else if (state === 2) {
          await twoToOne(checkbox);
          state = 1;
        }
      } else {
        // Go forward a state
        if (state === 0 || state === undefined) {
          await zeroToOne(checkbox);
          state = 1;
        } else if (state === 1) {
          await oneToTwo(checkbox);
          state = 2;
        } else {
          await twoToZero(checkbox);
          state = 0;
        }
      }
    } catch (error) {
      console.error("Checkbox transition failed:", error);
    }
  }

  // Handle keydown for accessibility (Enter/Space) - triggers forward transition
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); // Prevent scrolling on spacebar
      handleClick(event); // Pass no event, defaults to forward transition
    }
  }
</script>

<div
  class="tri-state-checkbox"
  data-disabled={disabled ? "true" : undefined}
  data-state={state}
  style="--color: {color};"
  onclick={handleClick}
  role="checkbox"
  aria-checked={state === 1 ? "true" : state === 2 ? "mixed" : "false"}
  tabindex="0"
  onkeydown={handleKeydown}
></div>
