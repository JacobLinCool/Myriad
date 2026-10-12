<script lang="ts">
  import { ExternalLink, Eye, RefreshCw } from "lucide-svelte";
  import { date } from "../format";
  import { indicator } from "../ui/indicator";
  import { teacherPath, type TeacherTab } from "../state/routes";
  import type { createTeacherSession } from "../state/teacher.svelte";
  import { follow, type Navigate } from "./link";
  import OverviewTab from "./OverviewTab.svelte";
  import StudentsTab from "./StudentsTab.svelte";
  import SubmissionsTab from "./SubmissionsTab.svelte";
  import DevicesTab from "./DevicesTab.svelte";
  import ResultsTab from "./ResultsTab.svelte";
  import SettingsTab from "./SettingsTab.svelte";
  let {
    session,
    tab,
    navigate,
  }: {
    session: ReturnType<typeof createTeacherSession>;
    tab: TeacherTab;
    navigate: Navigate;
  } = $props();
  const tabs: { value: TeacherTab; label: string }[] = [
    { value: "overview", label: "總覽" },
    { value: "students", label: "學生" },
    { value: "submissions", label: "提交分析" },
    { value: "devices", label: "裝置與環境" },
    { value: "results", label: "成績與匯出" },
    { value: "settings", label: "設定" },
  ];
  const statusLabel = {
    upcoming: "尚未開始",
    active: "進行中",
    ended: "已結束",
  };
  const policyLabel = { best: "每題取最佳提交", last: "每題取最後一次提交" };
  const detail = $derived(
    session.detail?.id === session.selected ? session.detail : null,
  );
</script>

{#if detail}
  <div class="exam-bar">
    <p class="meta">
      <span class="status-badge"
        >{detail.revision ? statusLabel[detail.status] : "尚未發布"}</span
      ><span>{date(detail.startsAt)} — {date(detail.endsAt)}</span><span
        >{policyLabel[detail.policy]}</span
      ><span>{detail.problems.length} 題</span>
    </p>
    <div class="actions">
      {#if detail.revision}<a href={`/exams/${detail.id}`} target="_blank"
          ><ExternalLink size={14} />開啟考試</a
        ><a
          href={`/exams/${detail.id}?preview=1`}
          target="_blank"
          title="不受考試時間限制，以學生介面作答與判題；提交不列入學生資料"
          ><Eye size={14} />以學生視角預覽</a
        >{/if}<button
        disabled={session.loading}
        aria-busy={session.loading}
        onclick={session.refresh}
        ><RefreshCw
          size={14}
          class={session.loading ? "spin" : ""}
        />重新整理</button
      >
    </div>
  </div>
{:else if session.loading}<div class="exam-bar" role="status">
    <span class="visually-hidden">正在載入考試…</span>
    <span class="skeleton" style="width:min(420px,70%);height:22px"></span>
  </div>{/if}

{#if session.selected}
  <nav
    class="tabs indicator-host"
    aria-label="考試分頁"
    use:indicator={'a[aria-current="page"]'}
  >
    {#each tabs as t (t.value)}<a
        href={teacherPath(session.selected, t.value)}
        aria-current={tab === t.value ? "page" : undefined}
        onclick={(e) =>
          follow(e, teacherPath(session.selected, t.value), navigate)}
        >{t.label}</a
      >{/each}
  </nav>
  {#if detail}
    <div class="tab-panel">
      {#key `${detail.id}:${tab}`}
        {#if tab === "overview"}<OverviewTab {session} {detail} {navigate} />
        {:else if tab === "students"}<StudentsTab
            {session}
            {detail}
            {navigate}
          />
        {:else if tab === "submissions"}<SubmissionsTab {session} {detail} />
        {:else if tab === "devices"}<DevicesTab {session} {detail} />
        {:else if tab === "results"}<ResultsTab {session} {detail} />
        {:else}<SettingsTab {session} {detail} />{/if}
      {/key}
    </div>
  {/if}
{/if}

<style>
  .exam-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 20px;
    margin-bottom: 22px;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
  }
  .actions a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
    text-decoration: none;
  }
  .actions a:hover {
    color: var(--text);
  }
  .tabs {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    border-bottom: 1px solid var(--border);
  }
  .tabs a {
    flex-shrink: 0;
    padding: 10px 12px;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    font-size: 12px;
    text-decoration: none;
    white-space: nowrap;
  }
  .tabs a:hover {
    color: var(--text);
  }
  .tabs a[aria-current="page"] {
    border-bottom-color: var(--text);
    color: var(--text);
  }
  /* Once measured, one underline travels between tabs. */
  .tabs:global([data-indicator])::before {
    z-index: 1;
    height: 2px;
    border-radius: 0;
    background: var(--text);
    transform: translate(
      var(--indicator-x),
      calc(var(--indicator-y) + var(--indicator-h) - 2px)
    );
  }
  .tabs:global([data-indicator]) a[aria-current="page"] {
    border-bottom-color: transparent;
  }
  .tab-panel {
    padding-top: 24px;
  }
</style>
