<script lang="ts">
  import { identityLabel } from "@myriad/shared";
  import { api } from "../api";
  import { teacherPath } from "../state/routes";
  import type { createTeacherSession } from "../state/teacher.svelte";
  import type { ExamDetail, StudentCell, StudentPage } from "./data";
  import { follow, type Navigate } from "./link";
  import { resource } from "./resource.svelte";
  import { statusLabel } from "./monitoring";
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
  let input = $state(""),
    query = $state(""),
    offset = $state(0);
  // Searching waits for a pause in typing, so each keystroke is not a query.
  $effect(() => {
    const next = input.trim();
    const timer = setTimeout(() => {
      if (next !== query) {
        query = next;
        offset = 0;
      }
    }, 300);
    return () => clearTimeout(timer);
  });
  const page = resource("teacher_students", (signal) =>
    api<StudentPage>(
      `/api/teacher/exams/${encodeURIComponent(detail.id)}/students?q=${encodeURIComponent(query)}&offset=${offset}`,
      "GET",
      undefined,
      { signal },
    ),
  );
  $effect(() => {
    void session.refreshKey;
    void query;
    void offset;
    void page.reload();
    return page.cancel;
  });
  const sourceOf = (problemId: string, cell: StudentCell) =>
    `${teacherPath(detail.id, "submissions")}?problem=${encodeURIComponent(problemId)}&submission=${encodeURIComponent(cell.latest.id)}`;
  const range = $derived(
    page.data && page.data.total
      ? `第 ${page.data.offset + 1}–${page.data.offset + page.data.students.length} 位，共 ${page.data.total} 位`
      : "",
  );
</script>

<div class="search">
  <label for="student-search">搜尋學號</label><input
    id="student-search"
    type="search"
    bind:value={input}
    placeholder="輸入學號的一部分"
    autocomplete="off"
  />
</div>
<header class="section-heading">
  <h2>學生繳交與通過狀態</h2>
  {#if page.data}<Updated
      at={page.data.updatedAt}
      loading={page.loading}
    />{/if}
</header>
<p class="muted">
  只列出曾提交的作答者；尚無班級名冊。每格顯示目前題目版本的最新狀態，以及依「{detail.policy ===
  "best"
    ? "最佳"
    : "最後"}提交」採計的結果。點選格子可檢視該次提交的程式碼。
</p>
{#if page.error}<p class="error" role="alert">{page.error}</p>{/if}
<div class="table-scroll ph-no-capture" aria-busy={page.loading}>
  <table>
    <thead
      ><tr
        ><th>學號</th>{#each detail.problems as p (p.id)}<th>{p.title}</th
          >{/each}</tr
      ></thead
    >
    <tbody
      >{#if page.data}{#each page.data.students as student (student.participantId)}
          <tr
            ><th scope="row"
              >{student.studentId}<small
                >{identityLabel(student.identityKind)}</small
              ></th
            >{#each detail.problems as p (p.id)}
              {@const cell = student.cells[p.id]}
              <td
                >{#if cell}<a
                    class="cell"
                    href={sourceOf(p.id, cell)}
                    onclick={(e) => follow(e, sourceOf(p.id, cell), navigate)}
                    ><span>{statusLabel(cell.latest)}</span><small
                      class:pass={cell.selected?.passed}
                      >{cell.attempts} 次 · {cell.selected
                        ? `採計 ${(100 * cell.selected.score).toFixed(0)}%${cell.selected.passed ? " · 通過" : ""}`
                        : "待完成"}</small
                    ></a
                  >{:else}<span class="muted">未繳交</span>{/if}</td
              >{/each}</tr
          >
        {:else}<tr
            ><td colspan={detail.problems.length + 1} class="muted"
              >{query
                ? "沒有符合的學生。"
                : "收到第一筆提交後會顯示學生狀態。"}</td
            ></tr
          >{/each}{:else}{#each [0, 1, 2, 3] as row}<tr
            ><td colspan={detail.problems.length + 1}
              ><span class="skeleton" style={`width:${90 - row * 9}%`}
              ></span></td
            ></tr
          >{/each}{/if}</tbody
    >
  </table>
</div>
{#if page.data && page.data.total > page.data.pageSize}<div class="pager">
    <button
      disabled={page.loading || offset === 0}
      onclick={() => (offset = Math.max(0, offset - page.data!.pageSize))}
      >上一頁</button
    ><span>{range}</span><button
      disabled={page.loading || offset + page.data.pageSize >= page.data.total}
      onclick={() => (offset += page.data!.pageSize)}>下一頁</button
    >
  </div>{:else if range}<p class="muted count">{range}</p>{/if}

<style>
  .search {
    max-width: 320px;
    margin-bottom: 24px;
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
  tbody th {
    color: var(--text);
    font-weight: 500;
  }
  small {
    display: block;
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
  }
  .cell {
    display: block;
    padding: 2px 0;
    color: var(--text);
    text-decoration: none;
    white-space: nowrap;
  }
  .cell:hover span {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .cell small.pass {
    color: var(--success);
  }
  .skeleton {
    display: block;
    height: 14px;
  }
  .pager {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 16px;
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .count {
    margin-top: 12px;
  }
</style>
