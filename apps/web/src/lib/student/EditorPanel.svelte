<script lang="ts">
  import type { StudentSession } from "../state/student.svelte";

  import {
    Code2,
    Play,
    Send,
    ChevronDown,
    LoaderCircle,
    ListIndentIncrease,
    Check,
  } from "lucide-svelte";

  let {
    session,
  }: {
    session: Pick<
      StudentSession,
      | "activity"
      | "busy"
      | "canSubmit"
      | "cooldown"
      | "code"
      | "collapsed"
      | "run"
      | "save"
      | "student"
      | "participantId"
      | "eid"
      | "problem"
      | "draftStatus"
      | "submit"
    >;
  } = $props();
  import CCodeEditor from "./CCodeEditor.svelte";
  let editor = $state<ReturnType<typeof CCodeEditor>>();
  /** Brief confirmation after formatting, or that nothing needed changing. */
  let formatted = $state<"changed" | "unchanged" | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));
  function format() {
    if (!editor) return;
    formatted = editor.format() ? "changed" : "unchanged";
    clearTimeout(timer);
    timer = setTimeout(() => (formatted = null), 1600);
  }
</script>

<section class="editor-pane">
  <header class="pane-heading">
    <span><Code2 size={14} /> main.c</span>
    <div class="grow"></div>
    <small aria-live="polite"
      >{formatted === "changed"
        ? "已格式化"
        : formatted === "unchanged"
          ? "格式已整齊"
          : session.draftStatus === "error"
            ? "草稿儲存失敗"
            : session.student
              ? ""
              : "選擇身分後保存草稿"}</small
    ><button
      class="format"
      title="格式化（Shift+Alt+F）"
      aria-keyshortcuts="Shift+Alt+F"
      onclick={format}
      >{#if formatted}<Check size={14} />{:else}<ListIndentIncrease
          size={14}
        />{/if}格式化</button
    >{#if session.collapsed}<button
        class="expand"
        aria-label="展開題目"
        onclick={() => (session.collapsed = false)}
        ><ChevronDown size={16} /></button
      >{/if}
  </header>
  <div class="editor-body">
    <span class="visually-hidden" id="editor-keys"
      >Tab 縮排；先按 Esc 再按 Tab 可離開編輯器。</span
    >
    <CCodeEditor
      bind:this={editor}
      documentKey={JSON.stringify([
        session.participantId,
        session.eid,
        session.problem?.id,
      ])}
      bind:value={session.code}
      describedBy="editor-keys"
      onchange={session.save}
    />
  </div>
  <footer class="editor-actions">
    <span class="muted">C · Clang 22</span>
    <div class="grow"></div>
    <button
      disabled={session.busy}
      aria-busy={session.activity === "run"}
      onclick={session.run}
      >{#if session.activity === "run"}<LoaderCircle
          size={14}
          class="spin"
        />{:else}<Play size={14} />{/if}執行</button
    ><button
      class="primary"
      disabled={!session.canSubmit}
      aria-busy={session.activity === "submit"}
      onclick={() => session.submit()}
      >{#if session.activity === "submit"}<LoaderCircle
          size={14}
          class="spin"
        />{:else}<Send
          size={14}
        />{/if}提交{#if session.cooldown && session.activity !== "submit"}<span
          class="cooldown"
          title="兩次提交需間隔 5 秒">{session.cooldown}</span
        >{/if}</button
    >
  </footer>
</section>

<style>
  .editor-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-editor);
  }
  .editor-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .editor-actions {
    height: 55px;
    min-height: 55px;
    padding: 8px 14px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .editor-actions > span {
    font-size: 11px;
  }
  .editor-actions button {
    font-size: 12px;
  }
  .cooldown {
    min-width: 1ch;
    font-variant-numeric: tabular-nums;
    font-weight: 400;
  }
  /* The working action stays legible while the other waits. */
  .editor-actions button[aria-busy="true"]:disabled {
    opacity: 0.8;
  }
  @media (max-width: 650px) {
    .editor-actions {
      padding: 8px;
    }
    .editor-actions > span {
      display: none;
    }
  }
  .format {
    gap: 5px;
    font-size: 12px;
    color: var(--muted);
    border-radius: var(--radius-sm);
  }
  .format:hover:not(:disabled) {
    color: var(--text);
  }
  @media (max-width: 650px) {
    .pane-heading .expand {
      display: none;
    }
  }
</style>
