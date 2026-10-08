<script lang="ts">
  import type { StudentSession } from "../state/student.svelte";

  import {
    House,
    Code2,
    History,
    GraduationCap,
    UserRound,
    ArrowLeft,
    CheckCircle2,
  } from "lucide-svelte";

  let {
    session,
  }: {
    session: Pick<
      StudentSession,
      | "eid"
      | "error"
      | "exam"
      | "history"
      | "listOpen"
      | "navigate"
      | "now"
      | "parts"
      | "listed"
      | "problem"
      | "section"
      | "showIdentity"
      | "started"
      | "student"
      | "identityLabel"
      | "studentInput"
      | "workspace"
    >;
  } = $props();
  import IconButton from "../ui/IconButton.svelte";
  import { indicator } from "../ui/indicator";
</script>

<nav
  class="rail indicator-host"
  aria-label="主要導覽"
  use:indicator={"button.active"}
>
  <IconButton
    active={!session.eid && session.parts[0] === "exams"}
    label="考試列表"
    onclick={() => session.navigate("/exams")}><House size={21} /></IconButton
  >
  <IconButton
    active={(session.section === "overview" && !!session.eid) ||
      session.workspace}
    disabled={!session.eid}
    label="作答"
    onclick={() => session.navigate(`/exams/${session.eid}`)}
    ><Code2 size={21} /></IconButton
  >
  <IconButton
    active={session.section === "submissions"}
    disabled={!session.eid ||
      !session.exam ||
      !session.started ||
      session.now >= session.exam.endsAt}
    label="提交紀錄"
    onclick={() => session.navigate(`/exams/${session.eid}/submissions`)}
    ><History size={21} /></IconButton
  >
  <div class="rail-spacer"></div>
  <IconButton
    active={session.parts[0] === "teacher"}
    label="教師工作台"
    onclick={() => session.navigate("/teacher")}
    ><GraduationCap size={21} /></IconButton
  >
  <IconButton
    class="avatar"
    label="切換身分"
    onclick={() => {
      session.studentInput = session.student;
      session.showIdentity = true;
    }}><UserRound size={19} /></IconButton
  >
</nav>
<aside
  class="sidebar"
  class:drawer-open={session.listOpen}
  aria-label="考試與題目"
>
  <div class="brand">
    <strong
      ><img src="/favicon.svg" alt="" width="22" height="22" />Myriad</strong
    ><span class="small">C</span>
  </div>
  {#if session.exam}<button
      class="back-link"
      onclick={() => session.navigate("/exams")}
      ><ArrowLeft size={14} /> 所有考試</button
    ><button
      class="exam-label"
      onclick={() => session.navigate(`/exams/${session.exam!.id}`)}
      >{session.exam.title}</button
    >
    <p class="sidebar-caption">題目</p>
    <div class="problem-list indicator-host" use:indicator={"button.active"}>
      {#each session.exam.problems as p, i}<button
          class:active={session.problem?.id === p.id && session.workspace}
          onclick={() =>
            session.navigate(`/exams/${session.exam!.id}/problems/${p.id}`)}
          ><span class="problem-index">{String.fromCharCode(65 + i)}</span><span
            >{p.title}</span
          >{#if session.history.some((s) => s.problemId === p.id && s.status === "complete" && s.score === 1)}<CheckCircle2
              size={14}
            />{/if}</button
        >{:else}<p class="muted inset">
          {session.now >= session.exam.endsAt
            ? "考試已結束。"
            : "題目尚未開放。"}
        </p>{/each}
    </div>
    <div class="sidebar-bottom">
      <span>目前身分</span><button
        onclick={() => {
          session.studentInput = session.student;
          session.showIdentity = true;
        }}>{session.student || "選擇身分"}</button
      ><small>{session.identityLabel}</small>
    </div>
  {:else if session.eid && !session.error}<div
      class="sidebar-placeholder"
      aria-hidden="true"
    >
      <span class="back-link"><ArrowLeft size={14} /> 所有考試</span>
      {#if session.listed}<span class="exam-label">{session.listed.title}</span
        >{:else}<span class="skeleton exam-skeleton"></span>{/if}
      <p class="sidebar-caption">題目</p>
      {#each [70, 54, 82, 60] as width}<span class="row"
          ><span class="skeleton index"></span><span
            class="skeleton"
            style={`width:${width}%`}
          ></span></span
        >{/each}
    </div>
  {:else}<p class="sidebar-caption">工作區</p>
    <button
      class="nav-row"
      class:active={session.parts[0] === "exams"}
      onclick={() => session.navigate("/exams")}
      ><House size={16} /> 所有考試</button
    ><button
      class="nav-row"
      class:active={session.parts[0] === "teacher"}
      onclick={() => session.navigate("/teacher")}
      ><GraduationCap size={16} /> 教師工作台</button
    >
  {/if}
</aside>

<style>
  .rail {
    background: var(--surface-raised);
    display: flex;
    align-items: center;
    flex-direction: column;
    padding: 14px 5px;
    gap: 14px;
  }
  .rail :global(button) {
    width: 42px;
    height: 42px;
    padding: 0;
    background: none;
    border: none;
    color: var(--muted);
    border-radius: 11px;
  }
  .rail {
    --indicator-radius: 11px;
  }
  .rail :global(button.active) {
    background: var(--selected);
    color: var(--text);
  }
  .rail:global([data-indicator]) :global(button.active),
  .problem-list:global([data-indicator]) button.active {
    background: transparent;
  }
  .rail :global(.avatar) {
    background: var(--selected);
    color: var(--text);
    width: 34px;
    height: 34px;
  }
  .sidebar {
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 0 12px;
    min-height: 0;
  }
  .brand {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 19px;
    letter-spacing: -0.025em;
    padding: 0 8px;
  }
  .brand strong {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }
  .brand img {
    display: block;
    border-radius: 5px;
  }
  .brand .small {
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    font-size: 11px;
    color: var(--muted);
    padding: 1px 5px;
  }
  .back-link {
    background: none;
    border: 0;
    justify-content: start;
    font-size: 12px;
    color: var(--muted);
    padding-left: 8px;
  }
  .exam-label {
    background: none;
    border: 0;
    text-align: left;
    justify-content: start;
    font-weight: 600;
    font-size: 15px;
    padding: 12px 8px;
  }
  .sidebar-caption {
    font-size: 12px;
    color: var(--muted);
    margin: 24px 8px 8px;
  }
  .problem-list {
    overflow: auto;
    flex: 1;
  }
  .sidebar-placeholder {
    display: flex;
    flex-direction: column;
  }
  .sidebar-placeholder .back-link,
  .sidebar-placeholder .exam-label {
    display: flex;
    align-items: center;
    gap: 7px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .sidebar-placeholder .exam-label {
    padding: 12px 8px;
  }
  .exam-skeleton {
    width: 70%;
    height: 15px;
    margin: 14px 8px;
  }
  .sidebar-placeholder .row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 13px 10px;
  }
  .sidebar-placeholder .index {
    width: 12px;
    flex-shrink: 0;
  }
  .problem-list button,
  .nav-row {
    width: 100%;
    justify-content: flex-start;
    text-align: left;
    background: none;
    border: 0;
    padding: 11px 10px;
    gap: 9px;
    margin: 2px 0;
  }
  .problem-list button.active,
  .nav-row.active {
    background: var(--selected);
  }
  .problem-index {
    font-size: 12px;
    color: var(--muted);
    min-width: 15px;
  }
  .problem-list button span:nth-child(2) {
    flex: 1;
  }
  .sidebar-bottom {
    margin-top: auto;
    padding: 20px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--muted);
  }
  .sidebar-bottom button {
    justify-content: start;
    padding: 6px 9px;
    max-width: 100%;
    overflow: hidden;
  }
  .sidebar-bottom small {
    font-size: 11px;
  }
  @media (max-width: 1099px) {
    /* The drawer wipes open from the rail edge and closes slightly faster. */
    .sidebar {
      position: fixed;
      left: var(--rail-width);
      top: 55px;
      bottom: 0;
      width: var(--sidebar-width);
      z-index: 15;
      border-right: 1px solid var(--border);
      visibility: hidden;
      clip-path: inset(0 100% 0 0);
      transition:
        clip-path var(--duration-base) var(--ease-in-out),
        visibility 0s linear var(--duration-base);
    }
    .sidebar.drawer-open {
      visibility: visible;
      clip-path: inset(0);
      transition:
        clip-path var(--duration-slow) var(--ease-out),
        visibility 0s;
    }
  }
  @media (max-width: 650px) {
    .rail {
      padding: 10px 2px;
      gap: 12px;
    }
    .rail :global(button) {
      width: 36px;
      height: 36px;
    }
    .sidebar {
      left: 44px;
    }
  }
</style>
