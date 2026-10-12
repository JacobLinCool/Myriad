<script lang="ts">
  import { Terminal, FlaskConical, History } from "lucide-svelte";
  import type { StudentSession } from "../state/student.svelte";
  import { date } from "../format";
  import { RefreshCw, CheckCircle2, CircleAlert } from "lucide-svelte";
  import { Tween, prefersReducedMotion } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  let {
    session,
  }: {
    session: Pick<
      StudentSession,
      | "activity"
      | "busy"
      | "diagnostics"
      | "engine"
      | "error"
      | "history"
      | "historyBusy"
      | "input"
      | "judgeError"
      | "last"
      | "loadHistory"
      | "output"
      | "panel"
      | "panelOpen"
      | "pending"
      | "problem"
      | "progress"
      | "submit"
      | "verdicts"
    >;
  } = $props();
  import ResourceSummary from "./ResourceSummary.svelte";
  import Tabs from "../ui/Tabs.svelte";

  const total = $derived(session.problem?.testCount ?? 0);
  const judging = $derived(session.activity === "submit");
  /** Determinate once verdicts stream in; a sweep while compiling or connecting. */
  const ratio = $derived(
    total && session.verdicts.length ? session.verdicts.length / total : null,
  );
  const score = new Tween(0, { easing: cubicOut });
  $effect(() => {
    const target = session.last ? session.last.score * 100 : 0;
    void score.set(target, {
      duration: session.last && !prefersReducedMotion.current ? 700 : 0,
    });
  });
  const problemHistory = $derived(
    session.history.filter((s) => s.problemId === session.problem?.id),
  );
</script>

<aside class="judge-panel" class:panel-open={session.panelOpen}>
  <div class="engine-status">
    <span
      class:ready={session.engine.state === "ready"}
      class:loading={session.engine.state === "downloading"}
      class:failed={session.engine.state === "error"}
      class="status-dot"
    ></span><span
      >{session.engine.state === "ready"
        ? "編譯器就緒"
        : session.engine.state === "downloading"
          ? "載入編譯器中"
          : session.engine.state === "error"
            ? "編譯器載入失敗"
            : "編譯器尚未啟動"}</span
    >
  </div>
  <Tabs
    label="判題面板"
    bind:value={session.panel}
    items={[
      { value: "run", label: "執行" },
      { value: "judge", label: "判題" },
      { value: "history", label: "紀錄" },
    ]}
  >
    {#snippet icon(value)}
      {#if value === "run"}<Terminal
          size={14}
        />{:else if value === "judge"}<FlaskConical size={14} />{:else}<History
          size={14}
        />{/if}
    {/snippet}
    {#snippet content()}
      <div class="panel-content">
        {#if session.judgeError}<div class="judge-error reveal" role="alert">
            <CircleAlert size={15} /><span>{session.judgeError}</span>
          </div>{/if}
        {#if session.diagnostics}<div class="reveal">
            <h3>編譯訊息</h3>
            <pre class="error ph-no-capture">{session.diagnostics}</pre>
          </div>{/if}
        {#key session.panel}<div class="panel-view">
            {#if session.panel === "run"}<label for="stdin">自訂輸入</label
              ><textarea
                id="stdin"
                bind:value={session.input}
                spellcheck="false"
                placeholder="輸入測試資料"
              ></textarea>
              <h3>執行結果</h3>
              {#if session.activity === "run"}<div
                  class="running"
                  role="status"
                >
                  <div class="progress-track indeterminate"><span></span></div>
                  <p class="muted">正在編譯並執行…</p>
                </div>{:else if session.output}<pre
                  class="reveal ph-no-capture">{session.output}</pre>{:else}<p
                  class="muted"
                >
                  執行程式後，輸出與耗時會顯示在這裡。
                </p>{/if}
            {:else if session.panel === "judge"}<h3 aria-live="polite">
                {session.progress || "準備提交"}
              </h3>
              {#if judging || session.verdicts.length}<div
                  class="progress-track"
                  class:indeterminate={judging && ratio === null}
                  role="progressbar"
                  aria-label="判題進度"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={session.verdicts.length}
                  style={`--progress:${ratio ?? 0}`}
                >
                  <span></span>
                </div>{/if}
              {#if session.pending}<button
                  class="reveal"
                  disabled={session.busy}
                  onclick={() => session.submit(true)}
                  ><RefreshCw size={14} />查詢並繼續提交</button
                >{/if}{#each session.verdicts as v (v.index)}<div
                  class="verdict-row reveal"
                >
                  <span>測試 {v.index + 1}</span><strong
                    class:pass={v.status === "AC"}>{v.status}</strong
                  >
                </div>{/each}{#if session.last}<div class="submission-result">
                  <CheckCircle2 size={20} /><strong
                    ><span class="visually-hidden"
                      >已保存 · {(session.last.score * 100).toFixed(0)}%</span
                    ><span aria-hidden="true"
                      >已保存 · {score.current.toFixed(0)}%</span
                    ></strong
                  >
                </div>
                {#if session.last.semanticCheck}
                  <div class="semantic-result" role="status">
                    <strong
                      >{session.last.semanticCheck.passed
                        ? "實作要求 · 通過"
                        : "實作要求 · 未通過"}</strong
                    >
                    {#if !session.last.semanticCheck.passed}<p>
                        {session.last.semanticCheck.reason}
                      </p>
                      <p class="muted">
                        本次得分為 0%；測資得分 {(
                          (session.last.testScore ?? 0) * 100
                        ).toFixed(0)}%。
                      </p>{/if}
                    {#if session.last.semanticCheck.truncated}<p class="muted">
                        僅檢查程式碼前 20,000 個字元。
                      </p>{/if}
                  </div>
                {/if}
                <ResourceSummary verdicts={session.last.verdicts} />{/if}
            {:else}<button
                disabled={session.busy || session.historyBusy}
                onclick={() =>
                  session
                    .loadHistory()
                    .catch((e) => (session.error = e.message))}
                ><RefreshCw
                  size={14}
                  class={session.historyBusy ? "spin" : ""}
                />更新紀錄</button
              >
              <div class="history-list" aria-busy={session.historyBusy}>
                {#each problemHistory as s (s.id)}<div class="history-item">
                    <strong
                      >{s.status === "complete"
                        ? `${(s.score * 100).toFixed(0)}%`
                        : s.status}</strong
                    ><span>{date(s.createdAt)}</span><small
                      >{s.id.slice(0, 8)}</small
                    >
                  </div>{:else}{#if session.historyBusy}{#each [0, 1] as _}<div
                        class="history-item"
                        aria-hidden="true"
                      >
                        <span class="skeleton" style="width:44px"></span><span
                          class="skeleton"
                          style="width:96px"
                        ></span><span class="skeleton" style="width:64px"
                        ></span>
                      </div>{/each}{:else}<p class="muted">
                      提交這個題目後，可在這裡查看判定與時間。
                    </p>{/if}{/each}
              </div>
            {/if}
          </div>{/key}
      </div>
    {/snippet}</Tabs
  >
</aside>

<style>
  .judge-panel {
    border-left: 1px solid var(--border);
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface);
  }
  .engine-status {
    height: 48px;
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 17px;
    font-size: 12px;
    color: var(--muted);
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--muted);
    transition: background-color var(--duration-slow) ease;
  }
  .status-dot.ready {
    background: var(--success);
  }
  .status-dot.failed {
    background: var(--danger);
  }
  .status-dot.loading {
    animation: breathe 1.2s var(--ease-in-out) infinite alternate;
  }
  @keyframes breathe {
    to {
      opacity: 0.25;
    }
  }
  .panel-content {
    padding: 16px;
    overflow: auto;
    min-height: 0;
    flex: 1;
  }
  .judge-error {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin-bottom: 14px;
    padding: 10px 12px;
    border: 1px solid var(--danger-border);
    border-radius: 6px;
    background: var(--danger-surface);
    color: var(--danger);
    font-size: 12px;
    line-height: 1.6;
  }
  .judge-error :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }
  .panel-view {
    animation: fade-in var(--duration-fast) ease both;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  .panel-content textarea {
    height: 145px;
    resize: vertical;
    font-size: 12px;
  }
  .panel-content p {
    font-size: 12px;
  }
  .running {
    padding-top: 6px;
  }
  .running p {
    margin-top: 12px;
  }
  .progress-track {
    margin: -2px 0 14px;
  }
  .verdict-row {
    display: flex;
    justify-content: space-between;
    padding: 11px 0;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  .submission-result {
    margin: 22px 0;
    display: flex;
    gap: 9px;
    align-items: center;
    flex-wrap: wrap;
    font-variant-numeric: tabular-nums;
    animation: settle var(--duration-slow) var(--ease-out) both;
  }
  .submission-result :global(svg) {
    animation: check-in 420ms var(--ease-out) both;
  }
  @keyframes settle {
    from {
      opacity: 0;
      transform: translateY(var(--shift));
    }
  }
  @keyframes check-in {
    from {
      opacity: 0;
      transform: scale(0.6) rotate(-20deg);
    }
  }

  .semantic-result {
    margin: 16px 0;
    font-size: 12px;
  }
  .semantic-result p {
    margin: 6px 0;
  }
  .history-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    padding: 13px 0;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  .history-item small {
    grid-column: 1/-1;
  }
  .history-list {
    margin-top: 8px;
    transition: opacity var(--duration-base) ease;
  }
  .history-list[aria-busy="true"] {
    opacity: 0.6;
  }
  @media (max-width: 1099px) {
    /* The results drawer wipes in from the right edge. */
    .judge-panel {
      position: absolute;
      right: 0;
      top: 55px;
      bottom: 0;
      width: var(--judge-width);
      z-index: 10;
      visibility: hidden;
      clip-path: inset(0 0 0 100%);
      transition:
        clip-path var(--duration-base) var(--ease-in-out),
        visibility 0s linear var(--duration-base);
    }
    .judge-panel.panel-open {
      visibility: visible;
      clip-path: inset(0);
      transition:
        clip-path var(--duration-slow) var(--ease-out),
        visibility 0s;
    }
  }
  @media (max-width: 650px) {
    .judge-panel.panel-open {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .submission-result :global(svg) {
      animation: none;
    }
  }
</style>
