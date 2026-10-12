<script lang="ts">
  import type { MonitoredSubmission } from "@myriad/shared";
  import { metrics, statusLabel, type Metric } from "./monitoring";
  let {
    points,
    frontier,
    x,
    y,
    logarithmic,
    selectedId,
    onselect,
  }: {
    points: MonitoredSubmission[];
    frontier: Set<string>;
    x: Metric;
    y: Metric;
    logarithmic: boolean;
    selectedId: string;
    onselect: (id: string, event: Event) => void;
  } = $props();
  let width = $state(800);
  let inspectedId = $state("");
  const inspected = $derived(points.find((s) => s.id === inspectedId));
  const plotWidth = $derived(Math.max(width, 320));
  const left = 64,
    top = 28,
    bottom = 264,
    right = 28;
  const maxX = $derived(points.reduce((v, s) => Math.max(v, s[x]!), 1));
  const maxY = $derived(points.reduce((v, s) => Math.max(v, s[y]!), 1));
  const label = (metric: Metric) =>
    metrics.find((m) => m.value === metric)!.label;
  function scale(v: number, max: number) {
    return logarithmic ? Math.log1p(v) / Math.log1p(max) : v / max;
  }
  function tick(f: number, max: number) {
    return logarithmic ? Math.expm1(f * Math.log1p(max)) : f * max;
  }
  const px = (s: MonitoredSubmission) =>
    left + scale(s[x]!, maxX) * (plotWidth - left - right);
  const py = (s: MonitoredSubmission) =>
    bottom - scale(s[y]!, maxY) * (bottom - top);
  const path = $derived(
    points
      .filter((s) => frontier.has(s.id))
      .sort((a, b) => a[x]! - b[x]!)
      .map((s) => `${px(s)},${py(s)}`)
      .join(" "),
  );
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 });
  const fractions = $derived(
    width < 480 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1],
  );
</script>

<div class="plot" bind:clientWidth={width}>
  <div class="plot-heading">
    <span>{label(y)}</span><span class="direction">越靠左下，資源用量越少</span>
  </div>
  <div class="canvas">
    <svg
      width={plotWidth}
      height="308"
      role="group"
      aria-label="提交資源散佈圖"
    >
      {#each fractions as f}
        <line
          x1={left}
          x2={plotWidth - right}
          y1={bottom - f * (bottom - top)}
          y2={bottom - f * (bottom - top)}
          class="grid"
        />
        <text
          x={left - 12}
          y={bottom - f * (bottom - top) + 4}
          text-anchor="end">{compact.format(tick(f, maxY))}</text
        >
        <text
          x={left + f * (plotWidth - left - right)}
          y={bottom + 24}
          text-anchor="middle">{compact.format(tick(f, maxX))}</text
        >
      {/each}
      <polyline points={path} class="frontier" />
      {#each points as s (s.id)}
        <g
          role="button"
          tabindex="0"
          aria-label={`${s.studentId} #${s.sequence}，${statusLabel(s)}，${label(x)} ${number.format(s[x]!)}，${label(y)} ${number.format(s[y]!)}，程式碼 ${number.format(s.codeBytes)} bytes`}
          onpointerenter={() => (inspectedId = s.id)}
          onfocus={() => (inspectedId = s.id)}
          onclick={(event) => onselect(s.id, event)}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onselect(s.id, event);
            }
          }}
          class:optimal={frontier.has(s.id)}
          class:rejected={!s.passed}
          class:chosen={selectedId === s.id || inspectedId === s.id}
        >
          <circle class="target" cx={px(s)} cy={py(s)} r="12" />
          <circle class="ring" cx={px(s)} cy={py(s)} r="8" />
          <circle class="point" cx={px(s)} cy={py(s)} r="4" />
        </g>
      {/each}
    </svg>
  </div>
  <div class="x-label">{label(x)}</div>
  <div class="legend">
    <span><i class="frontier-key"></i>Pareto 前緣</span><span
      ><i></i>其他提交</span
    ><span>每個點代表一次提交</span>
  </div>
  <div class="inspection">
    {#if inspected}
      <div class="identity">
        <strong>#{inspected.sequence} · {inspected.studentId}</strong><span
          >{statusLabel(inspected)}</span
        >
      </div>
      <dl>
        <div>
          <dt>Instruction cost</dt>
          <dd>
            {inspected.instructionCost === null
              ? "未記錄"
              : number.format(inspected.instructionCost)}
          </dd>
        </div>
        <div>
          <dt>Memory</dt>
          <dd>
            {inspected.memoryBytes === null
              ? "未記錄"
              : `${number.format(inspected.memoryBytes)} bytes`}
          </dd>
        </div>
        <div>
          <dt>程式碼</dt>
          <dd>{number.format(inspected.codeBytes)} bytes</dd>
        </div>
      </dl>
    {:else}<p>移到圓點或以 Tab 選取可查看數值；點選可開啟程式碼。</p>{/if}
  </div>
</div>

<style>
  .plot {
    margin-top: 20px;
    min-width: 0;
  }
  .plot-heading {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    color: var(--muted);
    font-size: 12px;
  }
  .direction {
    font-size: 12px;
  }
  .canvas {
    overflow-x: auto;
  }
  svg {
    display: block;
  }
  svg text {
    fill: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .grid {
    stroke: var(--border);
    stroke-width: 1;
    stroke-dasharray: 2 5;
  }
  .frontier {
    fill: none;
    stroke: var(--success);
    stroke-width: 1.25;
    opacity: 0.75;
  }
  g {
    cursor: pointer;
    outline: none;
  }
  .target {
    fill: transparent;
  }
  .point {
    fill: var(--surface-editor);
    stroke: var(--muted);
    stroke-width: 1.5;
    pointer-events: none;
  }
  .optimal .point {
    fill: var(--success);
    stroke: var(--success);
  }
  .rejected .point {
    stroke: var(--warning);
    stroke-dasharray: 2 2;
  }
  .ring {
    fill: none;
    stroke: var(--focus);
    stroke-width: 1;
    opacity: 0;
    pointer-events: none;
  }
  .chosen .ring,
  g:focus-visible .ring {
    opacity: 1;
  }
  .x-label {
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin: 18px 0 14px;
    color: var(--muted);
    font-size: 12px;
  }
  .legend span {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .legend i {
    display: inline-block;
    width: 7px;
    height: 7px;
    border: 1px solid var(--muted);
    border-radius: 50%;
  }
  .legend .frontier-key {
    background: var(--success);
    border-color: var(--success);
  }
  .inspection {
    border-top: 1px solid var(--border);
    padding: 14px 0;
    min-height: 94px;
    font-size: 12px;
  }
  .inspection p {
    color: var(--muted);
    margin: 0;
  }
  .identity {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .identity span,
  dt {
    color: var(--muted);
  }
  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 32px;
    margin: 10px 0 0;
  }
  dd {
    margin: 2px 0 0;
    font-variant-numeric: tabular-nums;
  }
</style>
