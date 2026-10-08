<script lang="ts">
  import type { PublicExam } from "@myriad/shared";
  import { date } from "../format";
  import { transitionName } from "../motion";
  let {
    kind,
    listed = null,
    label = "正在載入考試…",
  }: {
    kind: "page" | "workspace";
    listed?: Pick<PublicExam, "id" | "title" | "startsAt" | "endsAt"> | null;
    label?: string;
  } = $props();
</script>

{#if kind === "workspace"}
  <div class="workspace-skeleton" role="status" aria-busy="true">
    <span class="visually-hidden">{label}</span>
    <div class="phone-tabs" aria-hidden="true">
      <span>題目</span><span class="current">程式</span><span>結果</span>
    </div>
    <div class="statement">
      <div class="pane-heading"><span>題目敘述</span></div>
      <div class="lines">
        <span class="skeleton title"></span>
        {#each [94, 88, 97, 62] as width}<span
            class="skeleton"
            style={`width:${width}%`}
          ></span>{/each}
      </div>
    </div>
    <div class="editor">
      <div class="pane-heading"><span>main.c</span></div>
      <div class="code">
        {#each [38, 0, 52, 70, 44, 18] as width}<span
            class="skeleton"
            style={`width:${width}%;opacity:${width ? 1 : 0}`}
          ></span>{/each}
      </div>
    </div>
    <div class="judge"></div>
  </div>
{:else}
  <main class="page-content" role="status" aria-busy="true">
    <span class="visually-hidden">{label}</span>
    <header class="page-heading">
      <div>
        {#if listed}
          <h1
            style={`view-transition-name:${transitionName("exam-title", listed.id)}`}
          >
            {listed.title}
          </h1>
          <p>{date(listed.startsAt)} — {date(listed.endsAt)}</p>
        {:else}
          <span class="skeleton heading"></span>
          <span class="skeleton" style="width:220px"></span>
        {/if}
      </div>
    </header>
    {#each [3, 4, 2] as count}
      <section>
        <span class="skeleton subheading"></span>
        {#each { length: count }, index}<span
            class="skeleton"
            style={`width:${index === count - 1 ? 48 : 86 - index * 9}%`}
          ></span>{/each}
      </section>
    {/each}
  </main>
{/if}

<style>
  .heading {
    width: min(340px, 70%);
    height: 26px;
    margin: 2px 0 18px;
  }
  .subheading {
    width: 120px;
    height: 16px;
    margin-bottom: 18px;
  }
  section {
    display: grid;
    gap: 11px;
    margin: 24px 0 30px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
    max-width: 75ch;
  }
  .workspace-skeleton {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--judge-width);
    grid-template-rows: 40% minmax(0, 1fr);
  }
  .statement {
    border-bottom: 5px solid var(--border);
  }
  .editor {
    background: var(--surface-editor);
  }
  .judge {
    grid-column: 2;
    grid-row: 1 / -1;
    border-left: 1px solid var(--border);
    background: var(--surface);
  }
  .phone-tabs {
    display: none;
  }
  .lines,
  .code {
    display: grid;
    gap: 12px;
    padding: 22px 24px;
    max-width: 75ch;
  }
  .lines .title {
    width: 40%;
    height: 20px;
    margin-bottom: 6px;
  }
  .code {
    padding-left: 54px;
    gap: 10px;
  }
  @media (max-width: 1099px) {
    .workspace-skeleton {
      grid-template-columns: minmax(0, 1fr);
    }
    .judge {
      display: none;
    }
  }
  @media (max-width: 650px) {
    .workspace-skeleton {
      grid-template-rows: auto minmax(0, 1fr);
    }
    .phone-tabs {
      display: flex;
      padding: 0 8px;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      color: var(--muted);
    }
    .phone-tabs span {
      flex: 1;
      text-align: center;
      padding: 10px 5px;
      border-bottom: 2px solid transparent;
    }
    .phone-tabs .current {
      color: var(--text);
      border-bottom-color: var(--text);
    }
    .statement {
      display: none;
    }
  }
</style>
