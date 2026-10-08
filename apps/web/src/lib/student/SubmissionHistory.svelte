<script lang="ts">
  import type { StudentSession } from "../state/student.svelte";
  import { date } from "../format";
  import { RefreshCw } from "lucide-svelte";

  let {
    session,
  }: {
    session: Pick<
      StudentSession,
      "error" | "history" | "historyBusy" | "loadHistory" | "student"
    >;
  } = $props();
</script>

<main class="page-content">
  <header class="page-heading">
    <div>
      <h1>提交紀錄</h1>
      <p>
        {session.student || "請先選擇身分"} · 查看每次提交的時間與判定。
      </p>
    </div>
    <button
      disabled={session.historyBusy}
      onclick={() =>
        session.loadHistory().catch((e) => (session.error = e.message))}
      ><RefreshCw
        size={14}
        class={session.historyBusy ? "spin" : ""}
      />重新整理</button
    >
  </header>
  <div class="table-scroll" aria-busy={session.historyBusy}>
    <table>
      <thead
        ><tr><th>時間</th><th>題目</th><th>狀態</th><th>暫定分數</th></tr
        ></thead
      ><tbody
        >{#each session.history as s (s.id)}<tr
            ><td>{date(s.createdAt)}</td><td>{s.problemId}</td><td
              >{s.status}</td
            ><td
              >{s.status === "complete"
                ? `${(s.score * 100).toFixed(0)}%`
                : "—"}</td
            ></tr
          >{:else}{#if session.historyBusy}{#each [112, 64, 72, 40] as _, row}<tr
                aria-hidden="true"
                >{#each [112, 64, 72, 40] as width}<td
                    ><span class="skeleton" style={`width:${width - row * 6}px`}
                    ></span></td
                  >{/each}</tr
              >{/each}{/if}{/each}</tbody
      >
    </table>
  </div>
  {#if !session.history.length && !session.historyBusy}<p class="empty">
      完成第一次提交後，紀錄會顯示在這裡。
    </p>{/if}
</main>

<style>
  .table-scroll {
    transition: opacity var(--duration-base) ease;
  }
  .table-scroll[aria-busy="true"] {
    opacity: 0.6;
  }
  .table-scroll[aria-busy="true"]:has(.skeleton) {
    opacity: 1;
  }
</style>
