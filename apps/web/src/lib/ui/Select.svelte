<script lang="ts">
  import { tick } from "svelte";
  import { Check, ChevronDown } from "lucide-svelte";
  interface Option {
    value: string;
    label: string;
  }
  interface Props {
    id?: string;
    label: string;
    options: Option[];
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    onchange: (value: string) => void;
  }
  const generatedId = $props.id();
  let {
    id = generatedId,
    label,
    options,
    value = "",
    placeholder = "請選擇",
    disabled = false,
    onchange,
  }: Props = $props();
  let open = $state(false),
    activeValue = $state("");
  let trigger: HTMLButtonElement;
  let popup = $state<HTMLDivElement>();
  let search = "",
    lastTyped = 0;
  let position = $state({
    left: 0,
    top: 0,
    width: 0,
    height: 280,
    upward: false,
  });
  const selected = $derived(options.find((option) => option.value === value));
  const active = $derived(
    options.findIndex((option) => option.value === activeValue),
  );
  function positionPopup() {
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const leftEdge = viewport?.offsetLeft ?? 0,
      topEdge = viewport?.offsetTop ?? 0;
    const below = height + topEdge - rect.bottom - 14;
    const above = rect.top - topEdge - 14;
    const upward =
      below < Math.min(280, options.length * 40 + 12) && above > below;
    const listHeight = Math.max(0, Math.min(280, upward ? above : below));
    const listWidth = Math.min(rect.width, width - 16);
    position = {
      left: Math.max(
        leftEdge + 8,
        Math.min(rect.left, leftEdge + width - listWidth - 8),
      ),
      top: upward ? rect.top - 6 - listHeight : rect.bottom + 6,
      width: listWidth,
      height: listHeight,
      upward,
    };
  }
  function portal(node: HTMLDivElement) {
    (trigger.closest("dialog") ?? document.body).append(node);
    return { destroy: () => node.remove() };
  }
  async function highlight(index: number) {
    activeValue = options[index]?.value ?? "";
    await tick();
    popup
      ?.querySelectorAll<HTMLElement>('[role="option"]')
      [index]?.scrollIntoView({ block: "nearest" });
  }
  function expand(last = false) {
    if (disabled || !options.length) return;
    positionPopup();
    open = true;
    search = "";
    const index = options.findIndex((option) => option.value === value);
    void highlight(index >= 0 ? index : last ? options.length - 1 : 0);
  }
  function choose(index: number) {
    if (disabled) return;
    const option = options[index];
    if (!option) return;
    open = false;
    trigger.focus();
    if (option.value !== value) onchange(option.value);
  }
  $effect(() => {
    if (disabled || !options.length) {
      open = false;
      return;
    }
    if (open && active < 0) activeValue = selected?.value ?? options[0].value;
  });
  $effect(() => {
    if (!open) return;
    // Resizing the trigger or changing options may change available popup space.
    options.length;
    positionPopup();
    const observer = new ResizeObserver(positionPopup);
    observer.observe(trigger);
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    window.visualViewport?.addEventListener("resize", positionPopup);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
      window.visualViewport?.removeEventListener("resize", positionPopup);
    };
  });
  function keydown(event: KeyboardEvent) {
    if (disabled) return;
    const key = event.key;
    if (key === "Escape" || key === "Tab") {
      if (open && key === "Escape") event.preventDefault();
      open = false;
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key)) {
      event.preventDefault();
      if (!open) {
        expand(key === "ArrowUp" || key === "End");
        if (key === "Home") void highlight(0);
        if (key === "End") void highlight(options.length - 1);
        return;
      }
      if (key === "Enter" || key === " ") {
        choose(active);
        return;
      }
      void highlight(
        key === "Home"
          ? 0
          : key === "End"
            ? options.length - 1
            : Math.max(
                0,
                Math.min(
                  options.length - 1,
                  active + (key === "ArrowDown" ? 1 : -1),
                ),
              ),
      );
    } else if (
      key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      if (!open) expand();
      const now = Date.now();
      search = (now - lastTyped < 700 ? search : "") + key.toLocaleLowerCase();
      lastTyped = now;
      const repeated = [...search].every((char) => char === search[0]);
      const query = repeated ? search[0] : search;
      const start = repeated ? active + 1 : 0;
      for (let offset = 0; offset < options.length; offset++) {
        const index = (start + offset) % options.length;
        if (options[index].label.toLocaleLowerCase().startsWith(query)) {
          void highlight(index);
          break;
        }
      }
    }
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    const target = event.target as Node;
    if (!trigger?.contains(target) && !popup?.contains(target)) open = false;
  }}
  onfocusin={(event) => {
    const target = event.target as Node;
    if (!trigger?.contains(target) && !popup?.contains(target)) open = false;
  }}
/>
<div class="select">
  <span id={`${id}-label`} class="label">{label}</span>
  <button
    bind:this={trigger}
    {id}
    type="button"
    role="combobox"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={open ? `${id}-list` : undefined}
    aria-labelledby={`${id}-label`}
    aria-activedescendant={open && active >= 0
      ? `${id}-option-${active}`
      : undefined}
    disabled={disabled || !options.length}
    onclick={() => (open ? (open = false) : expand())}
    onkeydown={keydown}
    class="trigger"
  >
    <span class:placeholder={!selected}>{selected?.label ?? placeholder}</span
    ><ChevronDown size={16} class={open ? "turned" : ""} />
  </button>
</div>
{#if open}
  <div
    use:portal
    bind:this={popup}
    id={`${id}-list`}
    role="listbox"
    aria-labelledby={`${id}-label`}
    class="options"
    class:upward={position.upward}
    style={`left:${position.left}px;top:${position.top}px;width:${position.width}px;max-height:${position.height}px`}
    tabindex="-1"
  >
    {#each options as option, index (option.value)}
      <button
        type="button"
        id={`${id}-option-${index}`}
        role="option"
        aria-selected={option.value === value}
        tabindex="-1"
        class:highlighted={active === index}
        onpointermove={() => (activeValue = option.value)}
        onpointerdown={(event) => event.preventDefault()}
        onclick={() => choose(index)}
        onkeydown={keydown}
      >
        <span>{option.label}</span><span class="check"
          >{#if option.value === value}<Check size={16} />{/if}</span
        >
      </button>
    {/each}
  </div>
{/if}

<style>
  .select {
    position: relative;
    min-width: 0;
  }
  .label {
    display: block;
    color: var(--muted);
    margin-bottom: 7px;
    font-size: 12px;
  }
  .trigger {
    width: 100%;
    justify-content: space-between;
    text-align: left;
    min-height: 40px;
    background: var(--surface);
  }
  .trigger > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .placeholder {
    color: var(--muted);
  }
  .trigger :global(svg) {
    flex-shrink: 0;
    color: var(--muted);
  }
  .trigger :global(svg) {
    transition: transform var(--duration-base) var(--ease-out);
  }
  .trigger :global(.turned) {
    transform: rotate(180deg);
  }
  .options {
    position: fixed;
    z-index: 100;
    overflow-y: auto;
    padding: 5px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-popup);
    transform-origin: top;
    animation: popup-in var(--duration-fast) var(--ease-out) both;
  }
  .options.upward {
    transform-origin: bottom;
  }
  @keyframes popup-in {
    from {
      opacity: 0;
      transform: scaleY(0.96) translateY(calc(var(--shift) * -0.5));
    }
  }
  .options button {
    display: flex;
    width: 100%;
    border: 0;
    background: transparent;
    border-radius: var(--radius-sm);
    min-height: 40px;
    justify-content: space-between;
    text-align: left;
  }
  .options button.highlighted {
    background: var(--selected);
  }
  .options button > span:first-child {
    overflow-wrap: anywhere;
  }
  .check {
    width: 16px;
    flex-shrink: 0;
  }
</style>
