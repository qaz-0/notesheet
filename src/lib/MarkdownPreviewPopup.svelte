<script lang="ts">
  import { onMount } from "svelte";
  import markdownit from "markdown-it";

  const md = markdownit();

  let show = $state(false);
  let htmlContent = $state("");
  let top = $state(0);
  let left = $state(0);
  let minHeight = $state(0);

  onMount(() => {
    const handlePreview = (e: Event) => {
      const customEvent = e as CustomEvent;
      const data = customEvent.detail;

      show = data.show;
      if (show && data.rect) {
        // Render markdown without the trailing \nm trigger
        const text = data.text.endsWith("\nm")
          ? data.text.slice(0, -2)
          : data.text;
        htmlContent = md.render(text);

        // Position to the right side of the cell
        top = data.rect.top;
        left = data.rect.right + 10; // 10px spacing
        minHeight = data.rect.height;

        // Note: For fully robust positioning, we might want to check if it overflows the right edge of the screen,
        // but anchoring to the right side of the active cell box is exactly the plan.
      }
    };

    document.addEventListener("notesheetMarkdownPreview", handlePreview);

    return () => {
      document.removeEventListener("notesheetMarkdownPreview", handlePreview);
    };
  });
</script>

{#if show}
  <div
    class="markdown-preview-popup"
    style="top: {top}px; left: {left}px; min-height: {minHeight}px;"
  >
    <div class="markdown-preview-content">
      {@html htmlContent}
    </div>
  </div>
{/if}

<style>
  .markdown-preview-popup {
    position: fixed;
    z-index: 10000;
    width: 400px; /* slightly wider for reading */
    background-color: color-mix(
      in srgb,
      var(--background-color, #20263c),
      rgba(10, 10, 10, 0.5) 90%
    );
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 3px solid black;
    border-radius: 0px;
    box-shadow: 10px 10px 0px rgba(0, 0, 0, 0.3);
    padding: 12px 16px;
    color: var(--color, #e0e0e0);
    font-family: inherit;
    font-size: 0.9em;
    pointer-events: none; /* Let clicks pass through if needed, though it's on the side */
    animation: popupFadeIn 0.15s ease-out;
    box-sizing: border-box;
    overflow-y: auto;
    max-height: 80vh;
  }

  .markdown-preview-content :global(p) {
    margin: 0 0 0.5em 0;
  }

  .markdown-preview-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-preview-content :global(ul),
  .markdown-preview-content :global(ol) {
    margin: 0.5em 0;
    padding-left: 20px;
  }

  .markdown-preview-content :global(code) {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 4px;
    border-radius: 4px;
    font-family: monospace;
  }

  .markdown-preview-content :global(pre) {
    background: rgba(0, 0, 0, 0.5);
    padding: 10px;
    border-radius: 6px;
    overflow-x: auto;
  }

  .markdown-preview-content :global(h1),
  .markdown-preview-content :global(h2),
  .markdown-preview-content :global(h3),
  .markdown-preview-content :global(h4) {
    margin: 0.5em 0;
    line-height: 1.2;
    color: #ffffff;
  }

  @keyframes popupFadeIn {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
