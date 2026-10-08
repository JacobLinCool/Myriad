<script lang="ts">
  import type { Analysis, ExportKind } from "./data";
  let {
    analysis,
    examId,
    busy,
    onexport,
  }: {
    analysis: Analysis;
    examId: string;
    busy: boolean;
    onexport: (kind: ExportKind) => void;
  } = $props();
  const phaseLabels: Record<string, string> = {
    compile: "編譯",
    engine_init: "環境初始化",
    input_download: "測資下載",
    resource_download: "資源下載",
    run: "程式執行",
    submission: "正式提交",
  };
</script>

{#if analysis}
  <h2>參加與提交</h2>
  <dl class="statistics">
    <div>
      <dt>作答身分</dt>
      <dd>{analysis.totals.students}</dd>
    </div>
    <div>
      <dt>提交嘗試</dt>
      <dd>{analysis.totals.attempts}</dd>
    </div>
    <div>
      <dt>已完成</dt>
      <dd>{analysis.totals.completed ?? 0}</dd>
    </div>
  </dl>
  <div class="toolbar">
    <a href={`/exams/${examId}`}>開啟考試</a><a
      href={`/exams/${examId}?preview=1`}
      title="不受考試時間限制，以學生介面作答與判題；提交不列入學生資料"
      >以學生視角預覽</a
    ><button disabled={busy} onclick={() => onexport("submissions")}
      >匯出提交與程式</button
    ><button disabled={busy} onclick={() => onexport("telemetry")}
      >匯出效能紀錄</button
    >
  </div>
  <h2>瀏覽器效能</h2>
  <div class="table-scroll">
    <table>
      <thead
        ><tr
          ><th>階段</th><th>樣本</th><th>平均時間</th><th>最長時間</th><th
            >失敗比例</th
          ></tr
        ></thead
      ><tbody
        >{#each analysis.timings as t}<tr
            ><td>{phaseLabels[t.kind] ?? t.kind}</td><td>{t.samples}</td><td
              >{t.averageMs.toFixed(1)} ms</td
            ><td>{t.maxMs.toFixed(1)} ms</td><td
              >{((100 * t.errors) / t.samples).toFixed(1)}%</td
            ></tr
          >{/each}</tbody
      >
    </table>
  </div>
  {#if !analysis.timings.length}<p class="muted">
      學生開始操作後，效能統計會顯示在這裡。
    </p>{/if}
  <h2>同裝置的不同身分</h2>
  <p class="muted">請搭配共用裝置情境與作答內容檢視這些關聯。</p>
  <div class="table-scroll">
    <table>
      <thead><tr><th>裝置</th><th>學號</th><th>提交數</th></tr></thead><tbody
        >{#each analysis.devices as d}<tr
            ><td><code>{d.deviceId}</code></td><td
              >{d.studentId} · {d.identityKind === "nycu" ? "NYCU" : "訪客"}</td
            ><td>{d.submissions}</td></tr
          >{/each}</tbody
      >
    </table>
  </div>
  {#if !analysis.devices.length}<p class="muted">
      同一裝置以多個學號提交時，關聯紀錄會顯示在這裡。
    </p>{/if}
{/if}

<style>
  .statistics {
    display: flex;
    gap: 45px;
    padding: 12px 0 20px;
  }
  .statistics dt {
    font-size: 12px;
    color: var(--muted);
  }
  .statistics dd {
    font-size: 23px;
    margin-top: 8px;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 650px) {
    .statistics {
      gap: 22px;
    }
    .statistics dd {
      font-size: 19px;
    }
  }
</style>
