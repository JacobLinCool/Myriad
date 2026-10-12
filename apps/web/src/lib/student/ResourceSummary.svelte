<script lang="ts">
  import type { TestVerdict } from "@myriad/shared";
  let { verdicts }: { verdicts: TestVerdict[] } = $props();
  const costs = $derived(
    verdicts.flatMap((v) =>
      v.metrics?.instructionCost != null ? [v.metrics.instructionCost] : [],
    ),
  );
  const memory = $derived(
    verdicts.flatMap((v) =>
      v.metrics?.memoryBytes != null ? [v.metrics.memoryBytes] : [],
    ),
  );
  const total = $derived(costs.reduce((a, b) => a + b, 0));
  const peak = $derived(memory.reduce((a, b) => Math.max(a, b), 0));
  const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 });
  const bytes = (v: number) =>
    v >= 1048576
      ? `${number.format(v / 1048576)} MiB`
      : v >= 1024
        ? `${number.format(v / 1024)} KiB`
        : `${v} bytes`;
</script>

<section class="resources" aria-label="執行資源">
  <h3>執行資源</h3>
  <dl class="totals">
    <div>
      <dt>Instruction cost <span>測資總和</span></dt>
      <dd>{costs.length ? number.format(total) : "未記錄"}</dd>
      {#if costs.length && costs.length !== verdicts.length}<small
          >僅 {costs.length} / {verdicts.length} 筆有量測</small
        >{/if}
    </div>
    <div>
      <dt>尖峰記憶體 <span>所有測資最大值</span></dt>
      <dd title={`${peak} bytes`}>{memory.length ? bytes(peak) : "未記錄"}</dd>
      {#if memory.length && memory.length !== verdicts.length}<small
          >僅 {memory.length} / {verdicts.length} 筆有量測</small
        >{/if}
    </div>
  </dl>
</section>

<style>
  .resources {
    border-top: 1px solid var(--border);
    padding-top: 16px;
    margin-top: 16px;
    font-size: 12px;
  }
  h3 {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 600;
  }
  dl {
    margin: 0 0 24px;
  }
  .totals > div {
    margin-bottom: 14px;
  }
  dt,
  small {
    color: var(--muted);
  }
  dt span {
    display: block;
    font-size: 12px;
  }
  dd {
    margin: 4px 0 0;
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }
  small {
    display: block;
    font-size: 12px;
  }
</style>
