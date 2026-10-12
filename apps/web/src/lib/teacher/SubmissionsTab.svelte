<script lang="ts">
  import { tick as afterRender, untrack } from "svelte";
  import type { SemanticCheckResult } from "@myriad/shared";
  import type { ExamDetail, ProblemSubmissions } from "./data";
  import {
    metrics,
    statusLabel,
    paretoFrontier,
    cohortKey,
    type Metric,
  } from "./monitoring";
  import ParetoPlot from "./ParetoPlot.svelte";
  import Select from "../ui/Select.svelte";
  import { api } from "../api";
  import { reportError, track } from "../posthog";
  import { date } from "../format";
  import type { createTeacherSession } from "../state/teacher.svelte";
  import { resource } from "./resource.svelte";
  import Updated from "./Updated.svelte";
  let {
    session,
    detail,
  }: {
    session: ReturnType<typeof createTeacherSession>;
    detail: ExamDetail;
  } = $props();
  // `?problem=` and `?submission=` open a problem, or one submission, directly.
  const linked = new URLSearchParams(location.search);
  // The workspace keys this tab by exam, so the first problem is chosen once.
  const firstProblem = untrack(
    () =>
      detail.problems.find((p) => p.id === linked.get("problem")) ??
      detail.problems[0],
  );
  let problemId = $state(firstProblem?.id ?? "");
  /** `""` is the version of submissions made before versions were recorded. */
  let version = $state(firstProblem?.version ?? "");
  let pendingSource = linked.get("submission") ?? "";
  let profile = $state("");
  let x = $state<Metric>("instructionCost"),
    y = $state<Metric>("memoryBytes");
  let search = $state(""),
    onlyPassed = $state(!pendingSource),
    logarithmic = $state(true);
  let selectedId = $state(""),
    code = $state<string | null>(null),
    codeError = $state("");
  let semanticCheck = $state<SemanticCheckResult | undefined>();
  let page = $state(0);
  let sourceHeading = $state<HTMLHeadingElement>();
  let sourceTrigger: HTMLElement | SVGElement | null = null;
  const data = resource("teacher_problem_submissions", (signal) =>
    api<ProblemSubmissions>(
      `/api/teacher/exams/${encodeURIComponent(detail.id)}/problems/${encodeURIComponent(problemId)}/submissions?version=${encodeURIComponent(version)}`,
      "GET",
      undefined,
      { signal },
    ),
  );
  $effect(() => {
    void session.refreshKey;
    if (!problemId) return;
    void version;
    void data.reload();
    return data.cancel;
  });
  async function showSource(id: string) {
    selectedId = id;
    await afterRender();
    if (selectedId !== id || !sourceHeading) return;
    sourceHeading.focus({ preventScroll: true });
    sourceHeading.scrollIntoView({ block: "start", behavior: "instant" });
  }
  function openSource(id: string, event: Event) {
    sourceTrigger = event.currentTarget as HTMLElement | SVGElement;
    return showSource(id);
  }
  function closeSource() {
    selectedId = "";
    if (sourceTrigger?.isConnected) sourceTrigger.focus();
  }
  // A linked submission opens once its problem's data arrives.
  $effect(() => {
    if (!pendingSource || !data.data) return;
    const id = pendingSource;
    pendingSource = "";
    if (data.data.submissions.some((s) => s.id === id)) void showSource(id);
  });
  const rows = $derived(data.data?.submissions ?? []);
  const current = $derived(
    detail.problems.find((p) => p.id === problemId)?.version ?? "",
  );
  const versions = $derived([
    ...new Set([
      current,
      ...(data.data?.versions ?? []).map((v) => v.version ?? ""),
    ]),
  ]);
  const profiles = $derived([...new Set(rows.map(cohortKey).filter(Boolean))]);
  const activeProfile = $derived(
    profiles.includes(profile) ? profile : (profiles[0] ?? ""),
  );
  const comparable = $derived(
    rows.filter((s) => cohortKey(s) === activeProfile && activeProfile !== ""),
  );
  const frontier = $derived(paretoFrontier(comparable, x, y));
  const filtered = $derived(
    rows.filter(
      (s) =>
        (!onlyPassed || s.passed) &&
        s.studentId.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const points = $derived(
    filtered.filter(
      (s) =>
        s.status === "complete" &&
        s[x] !== null &&
        s[y] !== null &&
        activeProfile !== "" &&
        cohortKey(s) === activeProfile,
    ),
  );
  const ordered = $derived(
    [...filtered].sort((a, b) => b.sequence - a.sequence),
  );
  const selected = $derived(rows.find((s) => s.id === selectedId));
  const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 });
  function chooseProblem(id: string) {
    problemId = id;
    version = detail.problems.find((p) => p.id === id)?.version ?? "";
    selectedId = "";
    // The address keeps the problem, so reloading returns to it.
    const url = new URL(location.href);
    url.searchParams.set("problem", id);
    url.searchParams.delete("submission");
    history.replaceState(history.state, "", url);
  }
  $effect(() => {
    problemId;
    version;
    search;
    onlyPassed;
    page = 0;
  });
  $effect(() => {
    const id = selectedId,
      examId = detail.id;
    code = null;
    semanticCheck = undefined;
    codeError = "";
    if (!id) return;
    const controller = new AbortController();
    api<{ code: string; semanticCheck?: SemanticCheckResult }>(
      `/api/teacher/exams/${encodeURIComponent(examId)}/submissions/${encodeURIComponent(id)}`,
      "GET",
      undefined,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!controller.signal.aborted) {
          track("teacher_submission_viewed", { exam_id: examId });
          code = r.code;
          semanticCheck = r.semanticCheck;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          codeError = e instanceof Error ? e.message : "無法載入程式碼";
          reportError(e, {
            action: "teacher_view_submission",
            exam_id: examId,
          });
        }
      });
    return () => controller.abort();
  });
</script>

<section aria-labelledby="pareto-title" aria-busy={data.loading}>
  <header class="heading">
    <h2 id="pareto-title">資源分布與 Pareto frontier</h2>
    {#if data.data}<Updated
        at={data.data.updatedAt}
        loading={data.loading}
      />{/if}
  </header>
  <p class="muted">通過狀態與資源數值為暫定結果；正式成績以教師複驗為準。</p>
  {#if data.error}<p class="error" role="alert">{data.error}</p>{/if}
  <div class="controls">
    <Select
      label="題目"
      value={problemId}
      options={detail.problems.map((p) => ({ value: p.id, label: p.title }))}
      onchange={chooseProblem}
    />
    <Select
      label="題目版本"
      value={version}
      options={versions.map((v) => ({
        value: v,
        label: v
          ? `${v.slice(0, 8)}${v === current ? " · 目前" : ""}`
          : "未記錄版本",
      }))}
      onchange={(v) => (version = v)}
    />
    <Select
      label="X 軸"
      value={x}
      options={metrics}
      onchange={(v) => {
        if (v === y) y = x;
        x = v as Metric;
      }}
    />
    <Select
      label="Y 軸"
      value={y}
      options={metrics}
      onchange={(v) => {
        if (v === x) x = y;
        y = v as Metric;
      }}
    />
  </div>
  {#if profiles.length > 1}<Select
      label="成本量測設定"
      value={activeProfile}
      options={profiles.map((p) => ({
        value: p,
        label: JSON.parse(p).join(" / "),
      }))}
      onchange={(v) => (profile = v)}
    />{/if}
  <div class="toggles">
    <label class="search"
      >搜尋學號<input
        id="monitor-search"
        type="search"
        bind:value={search}
        placeholder="輸入學號"
      /></label
    ><label><input type="checkbox" bind:checked={onlyPassed} />只看已通過</label
    ><label
      ><input
        type="checkbox"
        bind:checked={logarithmic}
      />對數刻度（log₁₊ₓ）</label
    >
  </div>
  {#if points.length}
    <ParetoPlot
      {points}
      {frontier}
      {x}
      {y}
      {logarithmic}
      {selectedId}
      onselect={openSource}
    />
  {:else}<div class="empty-plot">
      目前篩選下尚無可比較的完整量測。新提交完成後會顯示在此。
    </div>{/if}
  <p class="muted">
    顯示 {points.length} / {filtered.length} 筆提交；未完成、缺少所選指標或量測設定不同者不繪圖。異常低成本或大型程式碼是檢視線索，需搭配測資與原始碼判讀。
  </p>
  <div class="table-scroll">
    <table>
      <thead
        ><tr
          ><th>提交／學號</th><th>狀態</th><th>Instruction cost</th><th
            >Memory · bytes</th
          ><th>程式碼 · bytes</th><th>時間</th></tr
        ></thead
      >
      <tbody
        >{#each ordered.slice(page * 50, (page + 1) * 50) as s (s.id)}<tr
            class:highlight={s.id === selectedId}
            ><td
              ><button
                class="text-action"
                onclick={(event) => openSource(s.id, event)}
                >#{s.sequence} · {s.studentId}</button
              >{#if frontier.has(s.id)}<small class="passed"
                  >Pareto frontier</small
                >{/if}</td
            ><td>{statusLabel(s)}</td><td
              >{s.instructionCost === null
                ? "未記錄"
                : number.format(s.instructionCost)}</td
            ><td
              >{s.memoryBytes === null
                ? "未記錄"
                : number.format(s.memoryBytes)}</td
            ><td>{number.format(s.codeBytes)}</td><td>{date(s.createdAt)}</td
            ></tr
          >{:else}<tr
            ><td colspan="6" class="muted">沒有符合篩選的提交。</td></tr
          >{/each}</tbody
      >
    </table>
  </div>
  {#if ordered.length > 50}<div class="toggles">
      <button disabled={page === 0} onclick={() => page--}>上一頁</button><span
        >{page + 1} / {Math.ceil(ordered.length / 50)}</span
      ><button
        disabled={(page + 1) * 50 >= ordered.length}
        onclick={() => page++}>下一頁</button
      >
    </div>{/if}
  {#if selected}<section class="source" aria-label="提交詳情">
      <header class="heading">
        <h3 bind:this={sourceHeading} tabindex="-1">
          #{selected.sequence} · {selected.studentId} · {statusLabel(selected)}
        </h3>
        <button onclick={closeSource}>關閉程式碼</button>
      </header>
      <p class="muted">
        {selected.codeBytes} bytes · {date(selected.createdAt)} · 版本 {selected.problemVersion?.slice(
          0,
          8,
        ) ?? "未記錄"}
      </p>
      {#if semanticCheck}<p class:passed={semanticCheck.passed}>
          實作要求 · {semanticCheck.passed
            ? "通過"
            : "未通過"}{semanticCheck.reason ? `：${semanticCheck.reason}` : ""}
        </p>{/if}
      {#if codeError}<p class="error" role="alert">
          {codeError}
        </p>{:else if code === null}<p role="status">載入程式碼…</p>{:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable source must be keyboard accessible) -->
        <pre
          class="ph-no-capture"
          tabindex="0"
          role="region"
          aria-label="提交的 C 程式碼"><code>{code}</code></pre>{/if}
    </section>{/if}
</section>

<style>
  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .heading h2,
  .heading h3 {
    margin: 0;
  }
  .muted,
  small {
    font-size: 12px;
  }
  small {
    display: block;
    color: var(--muted);
  }
  th {
    text-align: left;
  }
  td,
  th {
    font-variant-numeric: tabular-nums;
  }
  .passed {
    color: var(--success);
  }
  .text-action {
    background: none;
    border: 0;
    padding: 4px 0;
    text-align: left;
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .text-action:hover {
    color: var(--focus);
  }
  #monitor-search {
    width: 200px;
  }
  .controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .toggles {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px;
    margin: 16px 0;
  }
  .toggles label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .toggles input {
    width: auto;
    margin: 0;
  }
  .highlight {
    background: var(--selected);
  }
  .empty-plot {
    padding: 50px 20px;
    text-align: center;
    color: var(--muted);
    background: var(--surface-editor);
    border: 1px solid var(--border);
  }
  .source {
    margin-top: 24px;
  }
  .source pre {
    max-height: 500px;
    overflow: auto;
    white-space: pre;
  }
  @media (max-width: 650px) {
    .controls {
      grid-template-columns: 1fr;
    }
  }
</style>
