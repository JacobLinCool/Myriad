<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  type Props = Omit<
    HTMLButtonAttributes,
    "children" | "aria-label" | "title"
  > & {
    label: string;
    active?: boolean;
    children: Snippet;
  };
  let {
    label,
    active = false,
    children,
    class: className = "",
    ...attributes
  }: Props = $props();
</script>

<button
  {...attributes}
  type={attributes.type ?? "button"}
  class={`icon-button ${active ? "active" : ""} ${className}`}
  title={label}
  aria-label={label}
>
  {@render children()}
</button>

<style>
  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    flex-shrink: 0;
  }
  .active {
    background: var(--selected);
  }
</style>
