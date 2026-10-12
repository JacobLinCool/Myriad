<script lang="ts">
  import { date } from "../format";
  import { teacherPath } from "../state/routes";
  import type { createTeacherSession } from "../state/teacher.svelte";
  import { follow, type Navigate } from "./link";
  let {
    session,
    navigate,
  }: {
    session: ReturnType<typeof createTeacherSession>;
    navigate: Navigate;
  } = $props();
  const now = Date.now();
  function status(e: {
    startsAt: number;
    endsAt: number;
    revision: string | null;
  }) {
    if (!e.revision) return "尚未發布";
    return now < e.startsAt
      ? "尚未開始"
      : now >= e.endsAt
        ? "已結束"
        : "進行中";
  }
</script>

<p class="muted ph-no-capture account">
  {session.access?.account?.provider} · {session.access?.account?.subject}
  {session.access?.canCreateExams
    ? " · 可建立考試／作業"
    : " · 可管理受邀的考試／作業"}
</p>
{#if session.exams.length}
  <div class="table-scroll">
    <table>
      <thead
        ><tr><th>考試</th><th>狀態</th><th>期間</th><th>身分</th></tr></thead
      ><tbody
        >{#each session.exams as exam (exam.id)}<tr
            ><td
              ><a
                href={teacherPath(exam.id)}
                onclick={(e) => follow(e, teacherPath(exam.id), navigate)}
                >{exam.title}</a
              ><small><code>{exam.id}</code></small></td
            ><td><span class="status-badge">{status(exam)}</span></td><td
              >{date(exam.startsAt)} — {date(exam.endsAt)}</td
            ><td
              >{exam.ownerId === session.access?.account?.id
                ? "擁有者"
                : "共同管理"}</td
            ></tr
          >{/each}</tbody
      >
    </table>
  </div>
{:else if session.access?.canCreateExams}<div class="empty">
    <h2>從本機發布第一場考試</h2>
    <p>
      使用 agent 或 CLI 完成建置、測試與發布。所有程式驗證都在教師裝置上執行。
    </p>
    <pre>myriad init my-exam
myriad build my-exam --json
myriad test my-exam aplusb my-exam/problems/aplusb/solution.c --json
myriad deploy my-exam --remote https://your-host --json</pre>
  </div>
{:else}<p class="muted">
    尚無可管理的考試。請由管理員授予建立考試許可，或由考試擁有者邀請你共同管理。
  </p>{/if}

<style>
  .account {
    margin: 0 0 18px;
    font-size: 12px;
  }
  td a {
    color: var(--text);
    font-weight: 500;
    text-underline-offset: 4px;
  }
  td a:hover {
    color: var(--primary-hover);
  }
  td small {
    display: block;
    margin-top: 2px;
    color: var(--muted);
  }
  .empty pre {
    display: inline-block;
    text-align: left;
  }
</style>
