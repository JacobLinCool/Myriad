<script lang="ts">
  import { Download } from "lucide-svelte";
  import { api } from "../api";
  import type { createTeacherSession } from "../state/teacher.svelte";
  import type { ExamDetail, Reports } from "./data";
  import { resource } from "./resource.svelte";
  import ReportsPanel from "./ReportsPanel.svelte";
  let {
    session,
    detail,
  }: {
    session: ReturnType<typeof createTeacherSession>;
    detail: ExamDetail;
  } = $props();
  const reports = resource("teacher_reports", (signal) =>
    api<Reports>(
      `/api/teacher/exams/${encodeURIComponent(detail.id)}/results`,
      "GET",
      undefined,
      { signal },
    ),
  );
  $effect(() => {
    void session.refreshKey;
    void reports.reload();
    return reports.cancel;
  });
</script>

<section aria-labelledby="exports-title">
  <h2 id="exports-title">匯出</h2>
  <dl class="exports">
    <div>
      <dt>
        <button
          disabled={session.exporting}
          onclick={() => session.exportData("submissions")}
          ><Download size={14} />提交與程式</button
        >
      </dt>
      <dd>
        每筆已完成提交的程式碼與判題紀錄，供本機 <code>myriad verify</code> 複判。
      </dd>
    </div>
    <div>
      <dt>
        <button
          disabled={session.exporting}
          onclick={() => session.exportData("telemetry")}
          ><Download size={14} />效能紀錄</button
        >
      </dt>
      <dd>學生瀏覽器回報的編譯、執行與下載時間。</dd>
    </div>
    {#if detail.revision}<div>
        <dt>
          <a
            class="button"
            href={`/api/teacher/exams/${encodeURIComponent(detail.id)}/export`}
            download><Download size={14} />題目包</a
          >
        </dt>
        <dd>
          含歷次上傳、標準解與網站上目前的考試資訊；以
          <code>myriad export &lt;目錄&gt; --file &lt;檔案&gt;</code> 還原成題目目錄。
        </dd>
      </div>{/if}
  </dl>
  {#if session.exporting}<p class="muted" role="status">正在匯出…</p>{/if}
</section>
<section aria-busy={reports.loading}>
  {#if reports.error}<p class="error" role="alert">{reports.error}</p>{/if}
  {#if reports.data}<ReportsPanel
      reports={reports.data}
    />{:else if reports.loading}<span class="skeleton block"></span>{/if}
</section>

<style>
  h2 {
    margin: 0 0 12px;
  }
  section + section {
    margin-top: 40px;
  }
  .exports {
    margin: 0;
  }
  .exports div {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 16px;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .exports dd {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .exports .button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--surface-raised);
    color: var(--text);
    text-decoration: none;
    transition: background-color var(--duration-fast) ease;
  }
  .exports .button:hover {
    background: var(--hover);
  }
  .muted {
    font-size: 12px;
  }
  .block {
    display: block;
    height: 120px;
  }
  @media (max-width: 650px) {
    .exports div {
      grid-template-columns: 1fr;
      gap: 8px;
    }
  }
</style>
