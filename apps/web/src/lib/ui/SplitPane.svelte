<script lang="ts">
  let {
    value = $bindable(40),
    min = 15,
    max = 75,
    label,
    onchange,
  }: {
    value?: number;
    min?: number;
    max?: number;
    label: string;
    onchange?: (value: number) => void;
  } = $props();
  let dragging = $state<number | null>(null);
  function move(event: PointerEvent) {
    if (dragging !== event.pointerId) return;
    const container = (event.currentTarget as HTMLElement).parentElement!;
    const rect = container.getBoundingClientRect();
    if (!rect.height) return;
    value = Math.round(
      Math.max(
        min,
        Math.min(max, (100 * (event.clientY - rect.top)) / rect.height),
      ),
    );
    onchange?.(value);
  }
  function stop() {
    dragging = null;
  }
</script>

<input
  class="splitter"
  type="range"
  aria-label={label}
  aria-orientation="vertical"
  {min}
  {max}
  step="1"
  bind:value
  data-dragging={dragging === null ? undefined : ""}
  oninput={() => onchange?.(value)}
  onpointerdown={(event) => {
    event.preventDefault();
    const target = event.currentTarget;
    target.focus();
    target.setPointerCapture(event.pointerId);
    dragging = event.pointerId;
  }}
  onpointermove={move}
  onpointerup={stop}
  onpointercancel={stop}
  onlostpointercapture={stop}
/>

<style>
  input {
    appearance: none;
    width: 100%;
    height: 5px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    cursor: row-resize;
    background: var(--border);
    touch-action: none;
  }
  input:hover {
    background: var(--muted);
  }
  input::-webkit-slider-thumb {
    appearance: none;
    width: 28px;
    height: 3px;
    background: var(--muted);
    border-radius: 2px;
  }
  input::-moz-range-thumb {
    width: 28px;
    height: 3px;
    border: 0;
    background: var(--muted);
    border-radius: 2px;
  }
</style>
