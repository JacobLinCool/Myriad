<script module lang="ts">
  import { lazy } from "../lazy.svelte";
  /** Markdown, KaTeX and sanitization load with the first rendered document. */
  export const markdown = lazy(() => import("../markdown"));
</script>

<script lang="ts">
  let { source, lines = 4 }: { source: string; lines?: number } = $props();
  let failed = $state(false);
  $effect(() => {
    markdown.load().catch(() => (failed = true));
  });
</script>

{#if markdown.current}
  {@html markdown.current.renderMarkdownWithMath(source)}
{:else if failed}
  <p class="plain">{source}</p>
{:else}
  <div class="placeholder" role="status">
    <span class="visually-hidden">正在載入內容…</span>
    {#each { length: lines }, index}
      <span
        class="skeleton"
        style={`width:${index === lines - 1 ? 46 : 92 - ((index * 17) % 24)}%`}
      ></span>
    {/each}
  </div>
{/if}

<style>
  .placeholder {
    display: grid;
    gap: 11px;
    padding: 6px 0 14px;
    max-width: 75ch;
  }
  .plain {
    white-space: pre-wrap;
  }
</style>
