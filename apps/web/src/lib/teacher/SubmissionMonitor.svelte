<script lang="ts">
  import { tick as afterRender } from "svelte";
  import type {
    MonitoredSubmission,
    SemanticCheckResult,
  } from "@myriad/shared";
  import type { Analysis, ExamDetail } from "./data";
  import {
    metrics,
    statusLabel,
    selectedSubmission,
    paretoFrontier,
    cohortKey,
    type Metric,
  } from "./monitoring";
  import ParetoPlot from "./ParetoPlot.svelte";
  import Select from "../ui/Select.svelte";
  import { api } from "../api";
  import { date } from "../format";
  let { analysis, detail }: { analysis: Analysis; detail: ExamDetail } =
    $props();
  let problemId = $state("");
  let version = $state("");
  let profile = $state("");
  let x = $state<Metric>("instructionCost"),
    y = $state<Metric>("memoryBytes");
  let search = $state(""),
    onlyPassed = $state(true),
    logarithmic = $state(true);
  let selectedId = $state(""),
    code = $state<string | null>(null),
    codeError = $state("");
  let semanticCheck = $state<SemanticCheckResult | undefined>();
  let page = $state(0);
  let sourceHeading = $state<HTMLHeadingElement>();
  let sourceTrigger: HTMLElement | SVGElement | null = null;
  async function openSource(id: string, event: Event) {
    sourceTrigger = event.currentTarget as HTMLElement | SVGElement;
    selectedId = id;
    await afterRender();
    if (selectedId !== id || !sourceHeading) return;
    sourceHeading.focus({ preventScroll: true });
    sourceHeading.scrollIntoView({ block: "start", behavior: "instant" });
  }
  function closeSource() {
    selectedId = "";
    if (sourceTrigger?.isConnected) sourceTrigger.focus();
  }
  $effect(() => {
    if (!detail.problems.some((p) => p.id === problemId)) {
      problemId = detail.problems[0]?.id ?? "";
      version = detail.problems[0]?.version ?? "";
    }
  });
  const rows = $derived(analysis.submissions);
  const people = $derived(
    [...new Map(rows.map((s) => [s.participantId, s])).values()].sort((a, b) =>
      a.studentId.localeCompare(b.studentId),
    ),
  );
  const visiblePeople = $derived(
    people.filter((s) =>
      s.studentId.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const byStudentProblem = $derived.by(() => {
    const map = new Map<string, MonitoredSubmission[]>();
    for (const s of rows) {
      const key = JSON.stringify([
        s.participantId,
        s.problemId,
        s.problemVersion,
      ]);
      const group = map.get(key) ?? [];
      group.push(s);
      map.set(key, group);
    }
    return map;
  });
  function studentRows(
    participant: string,
    problem: ExamDetail["problems"][number],
  ) {
    return (
      byStudentProblem.get(
        JSON.stringify([participant, problem.id, problem.version]),
      ) ?? []
    );
  }
  const problemRows = $derived(rows.filter((s) => s.problemId === problemId));
  const versions = $derived([
    ...new Set([
      detail.problems.find((p) => p.id === problemId)?.version ?? "",
      ...problemRows.map((s) => s.problemVersion ?? ""),
    ]),
  ]);
  const versionRows = $derived(
    problemRows.filter((s) => (s.problemVersion ?? "") === version),
  );
  const profiles = $derived([
    ...new Set(versionRows.map(cohortKey).filter(Boolean)),
  ]);
  const activeProfile = $derived(
    profiles.includes(profile) ? profile : (profiles[0] ?? ""),
  );
  const comparable = $derived(
    versionRows.filter(
      (s) => cohortKey(s) === activeProfile && activeProfile !== "",
    ),
  );
  const frontier = $derived(paretoFrontier(comparable, x, y));
  const filtered = $derived(
    versionRows.filter(
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
          code = r.code;
          semanticCheck = r.semanticCheck;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          codeError = e instanceof Error ? e.message : "無法載入程式碼";
      });
    return () => controller.abort();
  });
</script>

<section aria-labelledby="monitor-title" class="monitor">
  <header class="heading">
    <h2 id="monitor-title">提交動態</h2>
    <span class="muted"
      >更新於 {new Date(analysis.updatedAt).toLocaleTimeString("zh-TW")}</span
    >
  </header>
  <p class="muted">通過狀態與資源數值為暫定結果；正式成績以教師複驗為準。</p>
  <div class="table-scroll">
    <table>
      <caption>各題狀態 · 目前題目版本</caption>
      <thead
        ><tr
          ><th>題目</th><th>提交</th><th>已繳交人數</th><th>曾通過人數</th><th
            >執行中</th
          ><th>逾時／中止</th></tr
        ></thead
      >
      <tbody
        >{#each detail.problems as p}
          {@const submissions = rows.filter(
            (s) => s.problemId === p.id && s.problemVersion === p.version,
          )}
          <tr
            ><th
              ><button class="text-action" onclick={() => chooseProblem(p.id)}
                >{p.title}</button
              ></th
            ><td>{submissions.length}</td><td
              >{new Set(submissions.map((s) => s.participantId)).size}</td
            ><td class="passed"
              >{new Set(
                submissions.filter((s) => s.passed).map((s) => s.participantId),
              ).size}</td
            ><td>{submissions.filter((s) => s.status === "running").length}</td
            ><td
              >{submissions.filter((s) =>
                ["expired", "failed"].includes(s.status),
              ).length}</td
            ></tr
          >
        {/each}</tbody
      >
    </table>
  </div>

  <h3>學生繳交與通過狀態</h3>
  <label for="monitor-search">搜尋學號</label><input
    id="monitor-search"
    type="search"
    bind:value={search}
    placeholder="輸入學號"
  />
  <p class="muted">
    顯示曾提交的 {people.length} 位作答者；尚無班級名冊，未曾提交者不在此清單。每格顯示目前版本的最新狀態，以及依「{detail.policy ===
    "best"
      ? "最佳"
      : "最後"}提交」選取的結果。
  </p>
  <div class="table-scroll matrix">
    <table>
      <thead
        ><tr
          ><th>學號</th>{#each detail.problems as p}<th>{p.title}</th
            >{/each}</tr
        ></thead
      >
      <tbody
        >{#each visiblePeople as student}
          <tr
            ><th
              >{student.studentId}<small
                >{student.identityKind === "nycu" ? "NYCU" : "訪客"}</small
              ></th
            >
            {#each detail.problems as p}
              {@const attempts = studentRows(student.participantId, p)}
              {@const latest = attempts.at(-1)}
              {@const scored = selectedSubmission(attempts, detail.policy)}
              <td
                >{#if latest}<button
                    class="cell"
                    onclick={(event) => {
                      chooseProblem(p.id);
                      onlyPassed = false;
                      void openSource(latest.id, event);
                    }}
                    ><span>{statusLabel(latest)}</span><small
                      class:passed={scored?.passed}
                      >{attempts.length} 次 · {scored
                        ? `採計 ${(100 * scored.score).toFixed(0)}%${scored.passed ? " · 通過" : ""}`
                        : "待完成"}</small
                    ></button
                  >{:else}<span class="muted">未繳交</span>{/if}</td
              >
            {/each}
          </tr>
        {:else}<tr
            ><td colspan={detail.problems.length + 1} class="muted"
              >{people.length
                ? "沒有符合的學生。"
                : "收到第一筆提交後會顯示學生狀態。"}</td
            ></tr
          >{/each}</tbody
      >
    </table>
  </div>

  <h3>資源分布與 Pareto frontier</h3>
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
          ? `${v.slice(0, 8)}${v === detail.problems.find((p) => p.id === problemId)?.version ? " · 目前" : ""}`
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
    <label><input type="checkbox" bind:checked={onlyPassed} />只看已通過</label
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
        <pre tabindex="0" role="region" aria-label="提交的 C 程式碼"><code
            >{code}</code
          ></pre>{/if}
    </section>{/if}
</section>

<style>
  .monitor {
    margin-top: 28px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 24px;
  }
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
  caption {
    text-align: left;
    color: var(--muted);
    font-size: 12px;
    padding: 8px 0;
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
  .cell {
    display: block;
    background: none;
    border: 0;
    padding: 6px 0;
    white-space: nowrap;
    text-align: left;
  }
  .cell:hover,
  .text-action:hover {
    color: var(--focus);
  }
  .matrix {
    max-height: 420px;
  }
  #monitor-search {
    max-width: 320px;
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
