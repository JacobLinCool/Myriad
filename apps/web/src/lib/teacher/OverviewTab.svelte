<script lang="ts">
  import { api } from "../api";
  import { teacherPath } from "../state/routes";
  import type { createTeacherSession } from "../state/teacher.svelte";
  import type { ExamDetail, Overview } from "./data";
  import { follow, type Navigate } from "./link";
  import { resource } from "./resource.svelte";
  import Updated from "./Updated.svelte";
  let {
    session,
    detail,
    navigate,
  }: {
    session: ReturnType<typeof createTeacherSession>;
    detail: ExamDetail;
    navigate: Navigate;
  } = $props();
  const overview = resource("teacher_overview", (signal) =>
    api<Overview>(
      `/api/teacher/exams/${encodeURIComponent(detail.id)}/overview`,
      "GET",
      undefined,
      { signal },
    ),
  );
  $effect(() => {
    void session.refreshKey;
    void overview.reload();
    return overview.cancel;
  });
  const rows = $derived(
    detail.problems.map((p) => ({
      problem: p,
      current: overview.data?.problems.find(
        (r) => r.problemId === p.id && r.problemVersion === p.version,
      ),
      earlier: (overview.data?.problems ?? [])
        .filter((r) => r.problemId === p.id && r.problemVersion !== p.version)
        .reduce((n, r) => n + r.submissions, 0),
    })),
  );
  const submissionsOf = (id: string) =>
    `${teacherPath(detail.id, "submissions")}?problem=${encodeURIComponent(id)}`;
</script>

{#if overview.error}<p class="error" role="alert">{overview.error}</p>{/if}
{#if overview.data}
  <section aria-labelledby="overview-figures" aria-busy={overview.loading}>
    <h2 id="overview-figures" class="visually-hidden">參加與提交</h2>
    <dl class="figures">
      <div>
        <dt>作答身分</dt>
        <dd>{overview.data.totals.students}</dd>
      </div>
      <div>
        <dt>提交</dt>
        <dd>{overview.data.totals.attempts}</dd>
      </div>
      <div>
        <dt>已完成判題</dt>
        <dd>{overview.data.totals.completed}</dd>
      </div>
      <div>
        <dt>判題中</dt>
        <dd>{overview.data.totals.running}</dd>
      </div>
    </dl>
  </section>
  <section aria-labelledby="overview-problems">
    <header class="section-heading">
      <h2 id="overview-problems">各題狀態</h2>
      <Updated at={overview.data.updatedAt} loading={overview.loading} />
    </header>
    <p class="muted">
      以目前題目版本計算；通過狀態為暫定結果，正式成績以教師複驗為準。
    </p>
    <div class="table-scroll">
      <table>
        <thead
          ><tr
            ><th>題目</th><th>提交</th><th>已繳交人數</th><th>曾通過人數</th><th
              >判題中</th
            ><th>逾時／中止</th></tr
          ></thead
        ><tbody
          >{#each rows as { problem, current, earlier } (problem.id)}<tr
              ><th scope="row"
                ><a
                  href={submissionsOf(problem.id)}
                  onclick={(e) =>
                    follow(e, submissionsOf(problem.id), navigate)}
                  >{problem.title}</a
                >{#if earlier}<small>另有 {earlier} 筆舊版本提交</small
                  >{/if}</th
              ><td>{current?.submissions ?? 0}</td><td
                >{current?.participants ?? 0}</td
              ><td class:pass={!!current?.passedParticipants}
                >{current?.passedParticipants ?? 0}</td
              ><td>{current?.running ?? 0}</td><td>{current?.stopped ?? 0}</td
              ></tr
            >{:else}<tr><td colspan="6" class="muted">尚未上傳題目。</td></tr
            >{/each}</tbody
        >
      </table>
    </div>
    {#if !overview.data.totals.attempts}<p class="muted">
        收到第一筆提交後，人數與各題狀態會顯示在這裡。
      </p>{/if}
  </section>
{:else if overview.loading}<div class="placeholder" role="status">
    <span class="visually-hidden">正在載入總覽…</span>
    <div class="figures">
      {#each [0, 1, 2, 3] as _}<div>
          <span class="skeleton" style="width:56px"></span><span
            class="skeleton figure"
          ></span>
        </div>{/each}
    </div>
    {#each [0, 1, 2] as row}<span
        class="skeleton row"
        style={`width:${100 - row * 7}%`}
      ></span>{/each}
  </div>{/if}

<style>
  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 45px;
    margin: 0 0 32px;
  }
  .figures dt {
    font-size: 12px;
    color: var(--muted);
  }
  .figures dd {
    margin: 8px 0 0;
    font-size: 23px;
    font-variant-numeric: tabular-nums;
  }
  .section-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  h2 {
    margin: 0;
  }
  .muted {
    font-size: 12px;
  }
  th a {
    color: var(--text);
    font-weight: 500;
    text-underline-offset: 4px;
  }
  th small {
    display: block;
    margin-top: 2px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
  }
  .placeholder {
    display: grid;
    gap: 14px;
  }
  .placeholder .figures div {
    display: grid;
    gap: 10px;
  }
  .placeholder .figure {
    width: 44px;
    height: 23px;
  }
  .placeholder .row {
    height: 14px;
    margin: 6px 0;
  }
  @media (max-width: 650px) {
    .figures {
      gap: 14px 22px;
    }
    .figures dd {
      font-size: 19px;
    }
  }
</style>
