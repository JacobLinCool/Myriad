<script lang="ts">
  import type { StudentSession } from "../state/student.svelte";

  let {
    session,
  }: {
    session: StudentSession;
  } = $props();
  import ProblemStatement from "./ProblemStatement.svelte";
  import EditorPanel from "./EditorPanel.svelte";
  import JudgePanel from "./JudgePanel.svelte";
  import SplitPane from "../ui/SplitPane.svelte";
  import Tabs from "../ui/Tabs.svelte";
</script>

<div class="workspace-host">
  <Tabs
    class="workspace-tabs"
    label="作答面板"
    bind:value={session.mobile}
    items={[
      { value: "statement", label: "題目" },
      { value: "editor", label: "程式" },
      { value: "results", label: "結果" },
    ]}
  >
    {#snippet content()}
      <main class="workspace" class:show-results={session.mobile === "results"}>
        <section
          class="center-workspace"
          class:phone-statement={session.mobile === "statement"}
          style={`--statement-size:${session.collapsed ? 0 : session.statementSize}%`}
        >
          <ProblemStatement {session} />
          <SplitPane
            label="調整題目與編輯器高度"
            bind:value={session.statementSize}
            onchange={(value) =>
              localStorage.setItem("myriad_statement_size", String(value))}
          />
          <EditorPanel {session} />
        </section>
        <JudgePanel {session} />
      </main>
    {/snippet}</Tabs
  >
</div>

<style>
  .workspace-host {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
  .workspace-host :global(.workspace-tabs > [role="tablist"]) {
    display: none;
  }
  .workspace-host :global(.workspace-tabs > .tab-content) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  @media (max-width: 650px) {
    .workspace-host :global(.workspace-tabs > [role="tablist"]) {
      display: flex;
    }
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--judge-width);
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }
  .center-workspace {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: var(--statement-size) 5px minmax(0, 1fr);
    /* Collapsing the statement eases the editor upward; dragging stays direct. */
    transition: grid-template-rows var(--duration-slow) var(--ease-out);
  }
  .center-workspace:has(:global(.splitter[data-dragging])) {
    transition: none;
  }
  @media (max-width: 1099px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 650px) {
    .center-workspace {
      display: flex;
      flex-direction: column;
    }
    .center-workspace :global(.statement),
    .center-workspace :global(.splitter) {
      display: none;
    }
    .center-workspace :global(.editor-pane) {
      flex: 1;
    }
    .center-workspace.phone-statement :global(.statement) {
      display: flex;
      flex: 1;
      visibility: visible;
      opacity: 1;
    }
    .center-workspace.phone-statement :global(.editor-pane) {
      display: none;
    }
    .workspace.show-results .center-workspace {
      display: none;
    }
    .workspace.show-results :global(.judge-panel) {
      display: flex;
      position: static;
      width: auto;
      border: 0;
      visibility: visible;
      clip-path: none;
    }
  }
</style>
