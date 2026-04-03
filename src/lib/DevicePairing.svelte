<script lang="ts">
  import type { SyncManager } from "./sync";

  let {
    syncManager,
    onClose,
  }: { syncManager: SyncManager; onClose: () => void } = $props();

  let mode = $state<"menu" | "generate" | "enter">("menu");
  let pairingCode = $state<string | null>(null);
  let inputCode = $state("");
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  async function generateCode() {
    isLoading = true;
    error = null;

    const code = await syncManager.generatePairingCode();

    if (code) {
      pairingCode = code;
      mode = "generate";
    } else {
      error = "Failed to generate pairing code. Please try again.";
    }

    isLoading = false;
  }

  async function submitCode() {
    if (inputCode.length < 6) {
      error = "Please enter a 6-character code";
      return;
    }

    isLoading = true;
    error = null;

    const paired = await syncManager.pairWithCode(inputCode);

    if (paired) {
      success = "Device paired successfully! Your data will now sync.";
      setTimeout(() => {
        onClose();
      }, 2000);
    } else {
      error = "Invalid or expired code. Please try again.";
    }

    isLoading = false;
  }

  function handleInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    inputCode = target.value.toUpperCase().slice(0, 6);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && inputCode.length === 6) {
      submitCode();
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  function copyCode() {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="pairing-overlay"
  onclick={onClose}
  onkeydown={handleKeydown}
  role="dialog"
  tabindex="-1"
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="pairing-dialog"
    onclick={(e) => e.stopPropagation()}
    role="document"
  >
    <div class="header">
      <h2>Device Pairing</h2>
      <button class="close-btn" onclick={onClose}>&times;</button>
    </div>

    {#if success}
      <div class="success-message">
        <span class="checkmark">✓</span>
        <p>{success}</p>
      </div>
    {:else if mode === "menu"}
      <div class="menu-options">
        <p>Sync your data across devices by pairing them together.</p>

        <button class="option-btn" onclick={generateCode} disabled={isLoading}>
          <span class="option-icon">📱</span>
          <span class="option-text">
            <strong>Generate Pairing Code</strong>
            <small>Show a code to enter on another device</small>
          </span>
        </button>

        <button
          class="option-btn"
          onclick={() => (mode = "enter")}
          disabled={isLoading}
        >
          <span class="option-icon">🔗</span>
          <span class="option-text">
            <strong>Enter Pairing Code</strong>
            <small>Link this device to an existing account</small>
          </span>
        </button>

        {#if error}
          <p class="error">{error}</p>
        {/if}
      </div>
    {:else if mode === "generate"}
      <div class="code-display">
        <p>Enter this code on your other device:</p>
        <div class="code">
          {pairingCode}
          <button class="copy-btn" onclick={copyCode} title="Copy code"
            >📋</button
          >
        </div>
        <p class="expires">Code expires in 10 minutes</p>
        <button
          class="back-btn"
          onclick={() => {
            mode = "menu";
            pairingCode = null;
          }}
        >
          ← Back
        </button>
      </div>
    {:else if mode === "enter"}
      <div class="code-entry">
        <p>Enter the 6-character code from your other device:</p>
        <input
          type="text"
          class="code-input"
          placeholder="XXXXXX"
          value={inputCode}
          oninput={handleInputChange}
          maxlength="6"
          disabled={isLoading}
        />
        <div class="button-row">
          <button
            class="back-btn"
            onclick={() => (mode = "menu")}
            disabled={isLoading}
          >
            ← Back
          </button>
          <button
            class="submit-btn"
            onclick={submitCode}
            disabled={isLoading || inputCode.length < 6}
          >
            {isLoading ? "Pairing..." : "Pair Device"}
          </button>
        </div>
        {#if error}
          <p class="error">{error}</p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .pairing-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .pairing-dialog {
    background: #2a2a2a;
    border-radius: 8px;
    padding: 24px;
    width: 100%;
    max-width: 400px;
    color: #fff;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .header h2 {
    margin: 0;
    font-size: 20px;
  }

  .close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: #fff;
  }

  .menu-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .menu-options > p {
    color: #aaa;
    margin: 0 0 8px 0;
  }

  .option-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: #333;
    border: 1px solid #444;
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.2s,
      border-color 0.2s;
  }

  .option-btn:hover:not(:disabled) {
    background: #3a3a3a;
    border-color: #555;
  }

  .option-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .option-icon {
    font-size: 24px;
  }

  .option-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .option-text strong {
    font-size: 14px;
  }

  .option-text small {
    color: #888;
    font-size: 12px;
  }

  .code-display {
    text-align: center;
  }

  .code-display > p {
    color: #aaa;
    margin: 0 0 16px 0;
  }

  .code {
    font-size: 32px;
    font-family: monospace;
    letter-spacing: 4px;
    background: #333;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .copy-btn {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    padding: 4px;
    opacity: 0.7;
  }

  .copy-btn:hover {
    opacity: 1;
  }

  .expires {
    color: #888;
    font-size: 12px;
    margin: 0 0 20px 0;
  }

  .code-entry {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .code-entry > p {
    color: #aaa;
    margin: 0;
  }

  .code-input {
    font-size: 24px;
    font-family: monospace;
    letter-spacing: 4px;
    text-align: center;
    padding: 16px;
    background: #333;
    border: 1px solid #444;
    border-radius: 8px;
    color: #fff;
    text-transform: uppercase;
  }

  .code-input:focus {
    outline: none;
    border-color: #48f;
  }

  .button-row {
    display: flex;
    gap: 12px;
  }

  .back-btn {
    padding: 10px 16px;
    background: #333;
    border: 1px solid #444;
    border-radius: 6px;
    color: #fff;
    cursor: pointer;
  }

  .back-btn:hover:not(:disabled) {
    background: #3a3a3a;
  }

  .submit-btn {
    flex: 1;
    padding: 10px 16px;
    background: #48f;
    border: none;
    border-radius: 6px;
    color: #fff;
    cursor: pointer;
    font-weight: bold;
  }

  .submit-btn:hover:not(:disabled) {
    background: #36d;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error {
    color: #f66;
    font-size: 14px;
    margin: 4px 0 0 0;
  }

  .success-message {
    text-align: center;
    padding: 20px;
  }

  .checkmark {
    display: block;
    font-size: 48px;
    color: #4a4;
    margin-bottom: 16px;
  }

  .success-message p {
    color: #4a4;
    margin: 0;
  }
</style>
