<script lang="ts" generics="T extends string">
  import type { Snippet } from "svelte";
  import { indicator } from "./indicator";
  let {
    value = $bindable(),
    items,
    label,
    content,
    icon,
    class: className = "",
  }: {
    value: T;
    items: { value: T; label: string }[];
    label: string;
    content: Snippet<[T]>;
    icon?: Snippet<[T]>;
    class?: string;
  } = $props();
  const id = $props.id();
  let root: HTMLDivElement;
  function keydown(event: KeyboardEvent, index: number) {
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % items.length
            : event.key === "ArrowLeft"
              ? (index + items.length - 1) % items.length
              : -1;
    if (next < 0) return;
    event.preventDefault();
    value = items[next].value;
    root
      .querySelectorAll<HTMLButtonElement>(
        ':scope > [role="tablist"] > [role="tab"]',
      )
      [next]?.focus();
  }
</script>

<div class={`tabs ${className}`} bind:this={root}>
  <div
    role="tablist"
    aria-label={label}
    class="indicator-host"
    use:indicator={'[role="tab"][aria-selected="true"]'}
  >
    {#each items as item, index (item.value)}
      <button
        type="button"
        role="tab"
        id={`${id}-tab-${item.value}`}
        aria-selected={value === item.value}
        aria-controls={`${id}-panel`}
        tabindex={value === item.value ? 0 : -1}
        onclick={() => (value = item.value)}
        onkeydown={(event) => keydown(event, index)}
        >{#if icon}{@render icon(item.value)}{/if}{item.label}</button
      >
    {/each}
  </div>
  <div
    class="tab-content"
    role="tabpanel"
    id={`${id}-panel`}
    aria-labelledby={`${id}-tab-${value}`}
    tabindex="0"
  >
    {@render content(value)}
  </div>
</div>

<style>
  .tabs {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  [role="tablist"] {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    padding: 0 8px;
  }
  button {
    flex: 1;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: none;
    font-size: 12px;
    padding: 10px 5px;
    color: var(--muted);
  }
  button[aria-selected="true"] {
    border-bottom-color: var(--text);
    color: var(--text);
  }
  /* Once measured, one underline travels between tabs instead of each tab drawing its own. */
  [role="tablist"]:global([data-indicator])::before {
    z-index: 1;
    height: 2px;
    border-radius: 0;
    background: var(--text);
    transform: translate(
      var(--indicator-x),
      calc(var(--indicator-y) + var(--indicator-h) - 2px)
    );
  }
  [role="tablist"]:global([data-indicator]) button[aria-selected="true"] {
    border-bottom-color: transparent;
  }
  .tab-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
</style>
