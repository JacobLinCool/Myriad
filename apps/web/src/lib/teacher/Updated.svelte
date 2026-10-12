<script lang="ts">
  let { at, loading = false }: { at: number; loading?: boolean } = $props();
</script>

<span class="updated" role="status"
  >{loading
    ? "更新中…"
    : `更新於 ${new Date(at).toLocaleTimeString("zh-TW")}`}</span
>

<style>
  .updated {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
