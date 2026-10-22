<script lang="ts">
  import { identityLabel } from "@myriad/shared";
  import Collapsible from "../ui/Collapsible.svelte";
  import type { Reports } from "./data";
  let { reports }: { reports: Reports } = $props();
</script>

{#if reports}<h2>本機複判報告</h2>
  <p>
    下載提交後，以原始 bundle 在本機執行 <code>myriad verify</code
    >，再上傳報告以檢視複判結果與差異。
  </p>
  {#each reports.reports as r (r.revision)}<section class="report">
      <div class="toolbar">
        <strong>{new Date(r.uploadedAt).toLocaleString("zh-TW")}</strong><span
          >{r.scores.length} 位學號 · {r.report.submissions.filter(
            (s) => s.classification === "DISPUTED",
          ).length} 筆差異</span
        >
      </div>
      <Collapsible id={`report-${r.revision}`} title="檢視複判結果與版本"
        ><code>{r.revision}</code>
        <table>
          <thead><tr><th>學號</th><th>複判分數</th></tr></thead><tbody
            >{#each r.scores as s}<tr
                ><td>{s.studentId} · {identityLabel(s.identityKind)}</td><td
                  >{s.totalScore.toFixed(2)}</td
                ></tr
              >{/each}</tbody
          >
        </table>
      </Collapsible>
    </section>{:else}<p class="muted">
      完成本機複判並上傳報告後，結果會顯示在這裡。
    </p>{/each}
{/if}

<style>
  .report code {
    display: block;
    overflow-wrap: anywhere;
    color: var(--muted);
    font-size: 11px;
  }
  .report table {
    margin-top: 14px;
  }

  .report {
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
  }
  .report code {
    overflow-wrap: anywhere;
    font-size: 11px;
  }
</style>
