<script module lang="ts">
  import type { Component } from "svelte";
  import { lazy } from "./lib/lazy.svelte";
  import type { StudentSession } from "./lib/state/student.svelte";
  const workspace = lazy(
    () =>
      import("./lib/student/Workspace.svelte") as Promise<{
        default: Component<{ session: StudentSession }>;
      }>,
  );
  const teacher = lazy(() => import("./lib/teacher/Teacher.svelte"));
</script>

<script lang="ts">
  import { RefreshCw, Eye } from "lucide-svelte";
  import { createStudentSession } from "./lib/state/student.svelte";
  import Navigation from "./lib/student/Navigation.svelte";
  import Topbar from "./lib/student/Topbar.svelte";
  import ExamList from "./lib/student/ExamList.svelte";
  import ExamOverview from "./lib/student/ExamOverview.svelte";
  import SubmissionHistory from "./lib/student/SubmissionHistory.svelte";
  import IdentityDialog from "./lib/student/IdentityDialog.svelte";
  import LoadingView from "./lib/student/LoadingView.svelte";
  import { markdown } from "./lib/ui/Markdown.svelte";
  const session = createStudentSession();
  const failed = () => (session.error = "介面載入失敗，請重新整理頁面。");
  $effect(() => {
    if (session.parts[0] === "teacher") teacher.load().catch(failed);
  });
  $effect(() => {
    if (session.workspace) workspace.load().catch(failed);
  });
  // Fetch the next likely surface while the visitor reads the current one.
  $effect(() => (session.eid ? workspace.prefetchWhenIdle() : undefined));
  $effect(() => markdown.prefetchWhenIdle());
</script>

<svelte:head
  ><title>{session.exam ? session.exam.title + " · " : ""}Myriad</title
  ></svelte:head
>
<div class="app-shell">
  <Navigation {session} />
  <div class="main-shell">
    <Topbar {session} />
    {#if session.previewRequested}<div
        class="preview-banner reveal"
        role="status"
      >
        <Eye size={15} /><span
          >{session.previewing
            ? "管理者預覽：不受考試時間限制，提交會正常判題，但不列入學生紀錄、統計與匯出。"
            : "管理者預覽需要在同一瀏覽器登入此考試的管理工作台。"}</span
        ><button onclick={session.exitPreview}>結束預覽</button>
      </div>{/if}
    {#if session.error}<div class="error-banner reveal" role="alert">
        <span>{session.error}</span><button
          disabled={session.busy}
          onclick={session.load}><RefreshCw size={14} />重新載入</button
        >
      </div>{/if}
    {#if session.parts[0] === "teacher"}
      {#if teacher.current}<teacher.current.default
          path={session.path}
          navigate={session.navigate}
        />{:else}<LoadingView kind="page" label="正在載入管理工作台…" />{/if}
    {:else if session.eid && (session.loading || (!session.exam && !session.error))}<LoadingView
        kind={session.section === "problems" ? "workspace" : "page"}
        listed={session.listed}
      />
    {:else if session.exam && session.now >= session.exam.endsAt}<main
        class="page-content"
      >
        <h1>考試已結束</h1>
        <p>感謝參與，現在可以關閉此頁面。</p>
        <button onclick={() => session.navigate("/exams")}>返回考試列表</button>
      </main>
    {:else if !session.eid}<ExamList {session} />
    {:else if session.exam && session.workspace && session.problem}
      {#if workspace.current}<workspace.current.default
          {session}
        />{:else}<LoadingView kind="workspace" label="正在載入作答介面…" />{/if}
    {:else if session.exam && session.section === "submissions"}<SubmissionHistory
        {session}
      />
    {:else if session.exam && session.section === "overview"}<ExamOverview
        {session}
      />{/if}
  </div>
</div>
<IdentityDialog {session} />

<style>
  .app-shell {
    height: 100dvh;
    display: grid;
    grid-template-columns: var(--rail-width) var(--sidebar-width) minmax(
        0,
        1fr
      );
    overflow: hidden;
  }
  .preview-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    color: var(--warning);
    font-size: 12px;
  }
  .preview-banner span {
    flex: 1;
  }
  .preview-banner button {
    font-size: 11px;
    padding: 5px 8px;
    color: var(--text);
  }
  @media (max-width: 650px) {
    .preview-banner {
      padding: 8px;
      font-size: 11px;
    }
  }
  .main-shell {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--canvas);
  }
  @media (min-width: 1100px) {
    .app-shell {
      grid-template-columns: var(--rail-width) var(--sidebar-width) minmax(
          0,
          1fr
        );
    }
  }
  @media (max-width: 1099px) {
    .app-shell {
      grid-template-columns: var(--rail-width) minmax(0, 1fr);
    }
  }
  @media (max-width: 650px) {
    .app-shell {
      grid-template-columns: 44px minmax(0, 1fr);
    }
  }
</style>
