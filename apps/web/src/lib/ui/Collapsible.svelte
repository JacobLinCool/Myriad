<script lang="ts">
  import type { Snippet } from "svelte";
  import { ChevronRight } from "lucide-svelte";
  interface Props {
    id?: string;
    title: string;
    open?: boolean;
    children: Snippet;
  }
  const generatedId = $props.id();
  let {
    id = generatedId,
    title,
    open = $bindable(false),
    children,
  }: Props = $props();
</script>

<div class="collapsible">
  <button
    type="button"
    id={`${id}-trigger`}
    aria-expanded={open}
    aria-controls={`${id}-content`}
    onclick={() => (open = !open)}
    class="disclosure"
  >
    <ChevronRight size={16} class={open ? "expanded" : ""} /><span>{title}</span
    >
  </button>
  <div
    id={`${id}-content`}
    role="region"
    aria-labelledby={`${id}-trigger`}
    hidden={!open}
    class="content"
  >
    {@render children()}
  </div>
</div>

<style>
  .disclosure {
    width: 100%;
    justify-content: flex-start;
    background: transparent;
    border: 0;
    border-radius: 6px;
    padding: 10px 8px;
    text-align: left;
  }
  .disclosure :global(svg) {
    flex-shrink: 0;
    color: var(--muted);
  }
  .disclosure :global(svg) {
    transition: transform var(--duration-base) var(--ease-out);
  }
  .disclosure :global(.expanded) {
    transform: rotate(90deg);
  }
  .content {
    padding: 10px 8px 2px;
    min-width: 0;
  }
  .content:not([hidden]) {
    animation: reveal var(--duration-base) var(--ease-out) both;
  }
</style>
