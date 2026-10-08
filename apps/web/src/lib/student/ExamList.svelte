<script lang="ts">
  import type { StudentSession } from "../state/student.svelte";
  import { date } from "../format";
  import { transitionName } from "../motion";
  import { RefreshCw } from "lucide-svelte";

  let {
    session,
  }: {
    session: Pick<
      StudentSession,
      | "error"
      | "exams"
      | "examsLoaded"
      | "load"
      | "refreshing"
      | "navigate"
      | "prefetchExam"
    >;
  } = $props();
</script>

<main class="page-content">
  <header class="page-heading">
    <div>
      <h1>所有考試</h1>
      <p>選擇一場考試，準備開始作答。</p>
    </div>
    <button
      onclick={session.load}
      disabled={session.refreshing}
      aria-label="重新整理考試"
      ><RefreshCw size={16} class={session.refreshing ? "spin" : ""} /></button
    >
  </header>
  <div class="exam-list" aria-busy={session.refreshing}>
    {#if !session.examsLoaded && !session.error}
      <div role="status">
        <span class="visually-hidden">正在載入考試…</span>
        {#each [62, 48, 55] as width}<div class="exam-row placeholder">
            <div>
              <span class="skeleton title" style={`width:${width}%`}></span>
              <span class="skeleton"></span>
            </div>
            <span class="skeleton badge"></span>
          </div>{/each}
      </div>
    {:else}
      {#each session.exams as e (e.id)}<button
          class="exam-row"
          onpointerenter={() => session.prefetchExam(e.id)}
          onpointerdown={() => session.prefetchExam(e.id)}
          onfocus={() => session.prefetchExam(e.id)}
          onclick={() => session.navigate(`/exams/${e.id}`)}
          ><div>
            <h2
              style={`view-transition-name:${transitionName("exam-title", e.id)}`}
            >
              {e.title}
            </h2>
            <p>{date(e.startsAt)} — {date(e.endsAt)}</p>
          </div>
          <span class="status-badge"
            >{e.status === "active"
              ? "進行中"
              : e.status === "upcoming"
                ? "尚未開始"
                : "已結束"}</span
          ></button
        >{:else}<div class="empty">
          <h2>等待考試發布</h2>
          <p>教師發布後，考試會出現在這裡。</p>
        </div>{/each}
    {/if}
  </div>
</main>

<style>
  .exam-row {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    text-align: left;
    background: none;
    border: 0;
    border-radius: 0;
    border-bottom: 1px solid var(--border);
    padding: 22px 4px;
    gap: 20px;
  }
  button.exam-row:active:not(:disabled) {
    transform: none;
    background: var(--surface);
  }
  .exam-row h2 {
    margin: 0 0 8px;
    font-size: 17px;
    width: fit-content;
  }
  .exam-row p {
    font-size: 12px;
    margin: 0;
  }
  .placeholder > div {
    flex: 1;
    display: grid;
    gap: 12px;
  }
  .placeholder .skeleton {
    width: 190px;
  }
  .placeholder .title {
    height: 17px;
  }
  .placeholder .badge {
    width: 58px;
    height: 24px;
  }
  .exam-list[aria-busy="true"] .exam-row:not(.placeholder) {
    opacity: 0.6;
  }
  .exam-list .exam-row {
    transition:
      opacity var(--duration-base) ease,
      background-color var(--duration-fast) ease;
  }
  @media (max-width: 650px) {
    .exam-row {
      align-items: start;
      gap: 10px;
    }
  }
</style>
