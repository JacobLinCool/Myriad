<script lang="ts">
  import { api } from "../api";
  import { date } from "../format";
  import type { createTeacherSession } from "../state/teacher.svelte";
  import type {
    DeviceLink,
    DeviceLinks,
    ExamDetail,
    Performance,
  } from "./data";
  import { resource } from "./resource.svelte";
  import Updated from "./Updated.svelte";
  let {
    session,
    detail,
  }: {
    session: ReturnType<typeof createTeacherSession>;
    detail: ExamDetail;
  } = $props();
  const base = $derived(`/api/teacher/exams/${encodeURIComponent(detail.id)}`);
  const links = resource("teacher_devices", (signal) =>
    api<DeviceLinks>(`${base}/devices`, "GET", undefined, { signal }),
  );
  const performance = resource("teacher_performance", (signal) =>
    api<Performance>(`${base}/performance`, "GET", undefined, { signal }),
  );
  $effect(() => {
    void session.refreshKey;
    void links.reload();
    void performance.reload();
    return () => {
      links.cancel();
      performance.cancel();
    };
  });
  const phaseLabels: Record<string, string> = {
    compile: "編譯",
    engine_init: "環境初始化",
    input_download: "測資下載",
    resource_download: "資源下載",
    run: "程式執行",
    submission: "正式提交",
  };
  const identityLabel = (kind: "guest" | "nycu") =>
    kind === "nycu" ? "NYCU" : "訪客";
  const span = (d: { firstSeenAt: number; lastSeenAt: number }) =>
    d.firstSeenAt === d.lastSeenAt
      ? date(d.firstSeenAt)
      : `${date(d.firstSeenAt)} – ${date(d.lastSeenAt)}`;
</script>

{#snippet deviceTable(rows: DeviceLink[])}
  <div class="table-scroll ph-no-capture">
    <table>
      <thead
        ><tr>
          <th>學號</th><th>裝置</th><th>來源 IP</th><th>User-Agent</th><th
            >提交數</th
          ><th>提交時間</th>
        </tr></thead
      >
      <tbody
        >{#each rows as d}
          <tr>
            <td>{d.studentId} · {identityLabel(d.identityKind)}</td>
            <td
              ><details class="device-id">
                <summary aria-label={`查看完整裝置 ID：${d.deviceId}`}
                  ><code>{d.deviceId.slice(0, 8)}</code></summary
                >
                <code class="full-id">{d.deviceId}</code>
              </details></td
            >
            <td
              >{#if d.ips}{#each d.ips.split(",") as ip}<code class="ip"
                    >{ip}</code
                  >{/each}{:else}—{/if}</td
            >
            <td
              >{#if d.userAgent}
                <details class="user-agent">
                  <summary aria-label="展開或收合完整 User-Agent"
                    ><span>{d.userAgent}</span></summary
                  >
                </details>
                {#if d.userAgents > 1}<small
                    >共 {d.userAgents} 種 User-Agent，顯示其中一種</small
                  >{/if}
              {:else}—{/if}</td
            >
            <td>{d.submissions}</td><td>{span(d)}</td>
          </tr>
        {/each}</tbody
      >
    </table>
  </div>
{/snippet}

<section aria-labelledby="devices-title" aria-busy={links.loading}>
  <header class="section-heading">
    <h2 id="devices-title">裝置關聯</h2>
    {#if links.data}<Updated
        at={links.data.updatedAt}
        loading={links.loading}
      />{/if}
  </header>
  <p class="muted">
    裝置關聯是調查線索，不代表違規；請搭配共用裝置情境、來源 IP 與作答內容判斷。
  </p>
  {#if links.error}<p class="error" role="alert">{links.error}</p>{/if}
  {#if links.data}
    <h3>同裝置的不同身分</h3>
    {@render deviceTable(links.data.devices)}
    {#if !links.data.devices.length}<p class="muted">
        同一裝置以多個學號提交時，關聯紀錄會顯示在這裡。
      </p>{/if}
    <h3>同一身分的多個裝置</h3>
    <p class="muted">
      裝置以瀏覽器儲存區識別，換瀏覽器、無痕視窗或清除資料也會成為新裝置；請搭配來源
      IP 與瀏覽器判斷。
    </p>
    {@render deviceTable(links.data.identities)}
    {#if !links.data.identities.length}<p class="muted">
        同一學號從多個裝置提交時，各裝置的紀錄會顯示在這裡。
      </p>{/if}
  {:else if links.loading}<span class="skeleton block"></span>{/if}
</section>
<section aria-labelledby="performance-title" aria-busy={performance.loading}>
  <header class="section-heading">
    <h2 id="performance-title">瀏覽器效能</h2>
    {#if performance.data}<Updated
        at={performance.data.updatedAt}
        loading={performance.loading}
      />{/if}
  </header>
  {#if performance.error}<p class="error" role="alert">
      {performance.error}
    </p>{/if}
  {#if performance.data}
    <div class="table-scroll">
      <table>
        <thead
          ><tr
            ><th>階段</th><th>樣本</th><th>平均時間</th><th>最長時間</th><th
              >失敗比例</th
            ></tr
          ></thead
        ><tbody
          >{#each performance.data.timings as t}<tr
              ><td>{phaseLabels[t.kind] ?? t.kind}</td><td>{t.samples}</td><td
                >{t.averageMs.toFixed(1)} ms</td
              ><td>{t.maxMs.toFixed(1)} ms</td><td
                >{((100 * t.errors) / t.samples).toFixed(1)}%</td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
    {#if !performance.data.timings.length}<p class="muted">
        學生開始操作後，效能統計會顯示在這裡。
      </p>{/if}
  {:else if performance.loading}<span class="skeleton block"></span>{/if}
</section>

<style>
  section + section {
    margin-top: 40px;
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
  h3 {
    margin: 28px 0 4px;
  }
  .muted {
    font-size: 12px;
  }
  .block {
    display: block;
    height: 120px;
    margin-top: 16px;
  }
  summary {
    cursor: pointer;
  }
  .full-id {
    display: block;
    max-width: 16ch;
    overflow-wrap: anywhere;
    margin-top: 6px;
  }
  .ip {
    display: block;
    max-width: 24ch;
    overflow-wrap: anywhere;
  }
  .user-agent {
    width: 28ch;
    max-width: 40vw;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .user-agent:not([open]) summary span {
    display: -webkit-inline-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    vertical-align: top;
    max-width: calc(100% - 2ch);
  }
  td small {
    display: block;
    max-width: 36ch;
    margin-top: 4px;
    color: var(--muted);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
</style>
