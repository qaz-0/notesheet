<script lang="ts">
    import './Checkbox.css'
    import type { CheckboxState } from './types';

	let {
        initialState,
        disabled = false,
		color = '#ff3e00',
		zeroToOne = () => {},
		oneToTwo = () => {},
		twoToOne = () => {},
		oneToZero = () => {},
		twoToZero = () => {}
	}: {
		initialState: CheckboxState;
        disabled?: boolean;
		color?: string;
		zeroToOne?: (checkbox: HTMLDivElement) => void;
		oneToTwo?: (checkbox: HTMLDivElement) => void;
		twoToOne?: (checkbox: HTMLDivElement) => void;
		oneToZero?: (checkbox: HTMLDivElement) => void;
		twoToZero?: (checkbox: HTMLDivElement) => void;
	} = $props();

	let state: CheckboxState = $state(initialState); // Update to use initialState

	function handleClick(event?: MouseEvent | KeyboardEvent) {
		const disabled = (event?.currentTarget as HTMLElement).getAttribute("data-disabled") === "true";
		if (disabled) return;
		const isCtrlClick = event?.shiftKey ?? false;
		const checkbox = event?.currentTarget as HTMLDivElement; // Cast to HTMLDivElement

		if (isCtrlClick) {
			// Go back a state
			if (state === 1) {
				oneToZero(checkbox); // Pass the checkbox element
				state = 0;
			} else if (state === 2) {
				twoToOne(checkbox);
				state = 1;
			}
		} else {
			// Go forward a state
			if (state === 0 || state === undefined) {
				state = 1;
				zeroToOne(checkbox);
			} else if (state === 1) {
				state = 2;
				oneToTwo(checkbox);
			} else {
				state = 0;
				twoToZero(checkbox);
			}
		}
	}

	// Handle keydown for accessibility (Enter/Space) - triggers forward transition
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault(); // Prevent scrolling on spacebar
			handleClick(event); // Pass no event, defaults to forward transition
		}
	}
</script>

<div
	class="tri-state-checkbox"
	data-disabled={disabled ? 'true' : undefined}
	data-state={state}
	style="--color: {color};"
	onclick={handleClick}
	role="checkbox"
	aria-checked={state === 1 ? 'true' : state === 2 ? 'mixed' : 'false'}
	tabindex="0"
	onkeydown={handleKeydown}
>
</div>
