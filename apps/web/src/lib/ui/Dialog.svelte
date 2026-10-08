<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  let {
    open = $bindable(false),
    title,
    children,
  }: { open?: boolean; title: string; children: Snippet } = $props();
  const id = $props.id();
  let dialog: HTMLDialogElement;
  let previousFocus: HTMLElement | null = null;
  function restoreFocus() {
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      restoreFocus();
    }
  });
  onDestroy(() => {
    if (dialog?.open) dialog.close();
    restoreFocus();
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={`${id}-title`}
  oncancel={() => {
    open = false;
  }}
  onclose={() => {
    open = false;
    restoreFocus();
  }}
>
  <h2 id={`${id}-title`}>{title}</h2>
  {@render children()}
</dialog>

<style>
  dialog {
    margin: auto;
    color: var(--text);
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    padding: 28px;
    width: min(440px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    overflow: auto;
  }
  dialog::backdrop {
    background: var(--scrim);
  }
  /* Enter rises into place; exit is quicker and keeps the dialog in the top layer until it fades. */
  dialog {
    opacity: 0;
    transform: translateY(var(--shift)) scale(0.98);
    transition:
      opacity var(--duration-fast) ease,
      transform var(--duration-fast) var(--ease-out),
      overlay var(--duration-fast) allow-discrete,
      display var(--duration-fast) allow-discrete;
  }
  dialog[open] {
    opacity: 1;
    transform: none;
    transition-duration: var(--duration-base);
  }
  dialog::backdrop {
    opacity: 0;
    transition:
      opacity var(--duration-fast) ease,
      overlay var(--duration-fast) allow-discrete,
      display var(--duration-fast) allow-discrete;
  }
  dialog[open]::backdrop {
    opacity: 1;
    transition-duration: var(--duration-base);
  }
  @starting-style {
    dialog[open],
    dialog[open]::backdrop {
      opacity: 0;
    }
    dialog[open] {
      transform: translateY(var(--shift)) scale(0.98);
    }
  }
  h2 {
    margin-top: 0;
  }
</style>
