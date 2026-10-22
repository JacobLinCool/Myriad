<script lang="ts">
  import type { StudentSession } from "../state/student.svelte";
  import { date } from "../format";
  import { transitionName } from "../motion";
  import { Play, LoaderCircle, CheckCircle2 } from "lucide-svelte";
  import Markdown from "../ui/Markdown.svelte";

  let {
    session,
  }: {
    session: Pick<
      StudentSession,
      | "activity"
      | "busy"
      | "engine"
      | "exam"
      | "navigate"
      | "notice"
      | "now"
      | "prepare"
      | "showIdentity"
      | "student"
      | "identityLabel"
      | "studentLabel"
      | "openIdentity"
    >;
  } = $props();
</script>

{#if session.exam}
  <main class="page-content overview">
    <header class="page-heading">
      <div>
        <h1
          style={`view-transition-name:${transitionName("exam-title", session.exam.id)}`}
        >
          {session.exam.title}
        </h1>
        <p>{date(session.exam.startsAt)} — {date(session.exam.endsAt)}</p>
      </div>
      <span class="status-badge"
        >{session.now < session.exam.startsAt
          ? "尚未開始"
          : session.now >= session.exam.endsAt
            ? "已結束"
            : "進行中"}</span
      >
    </header>
    <section>
      <h2>確認作答身分</h2>
      <p>選擇登入或訪客作答，確認身分後開始。</p>
      <div class="toolbar">
        <strong class="ph-no-capture"
          >{session.studentLabel || "尚未選擇身分"}</strong
        ><button onclick={session.openIdentity}>填寫／切換身分</button>
      </div>
    </section>
    <section>
      <h2>考試規則</h2>
      <article class="statement-prose">
        <Markdown
          source={session.exam.rules || "請獨立完成作答，並在截止前完成提交。"}
          lines={3}
        />
      </article>
    </section>
    <section>
      <h2>作答準備</h2>
      <button disabled={session.busy} onclick={session.prepare}
        >{#if session.activity === "prepare"}<LoaderCircle
            size={15}
            class="spin"
          />{:else}<Play size={15} />{/if}{session.activity === "prepare"
          ? "正在準備…"
          : "測試作答環境"}</button
      >{#if session.notice}<p class="pass notice reveal" role="status">
          <CheckCircle2 size={15} />{session.notice}
        </p>{/if}{#if session.engine.state === "error"}<p class="error reveal">
          {session.engine.message}
        </p>{/if}
    </section>
    {#if session.exam.problems.length}<button
        class="primary"
        onclick={() =>
          session.navigate(
            `/exams/${session.exam!.id}/problems/${session.exam!.problems[0].id}`,
          )}>進入作答</button
      >{:else if session.now < session.exam.startsAt}<p class="muted">
        開始時間到達後將自動開放題目。
      </p>{/if}
  </main>
{/if}

<style>
  .overview h1 {
    width: fit-content;
  }
  .overview section {
    margin: 24px 0 30px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
  }
  .overview .statement-prose {
    padding: 0;
  }
  .notice {
    display: flex;
    align-items: center;
    gap: 7px;
  }
</style>
