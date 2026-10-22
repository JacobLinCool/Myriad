<script lang="ts">
  import type { StudentSession } from "../state/student.svelte";
  import { time } from "../format";
  import { PanelLeft, PanelRight, Clock } from "lucide-svelte";

  let {
    session,
  }: {
    session: Pick<
      StudentSession,
      | "exam"
      | "listOpen"
      | "now"
      | "panelOpen"
      | "eid"
      | "parts"
      | "listed"
      | "problem"
      | "remaining"
      | "showIdentity"
      | "student"
      | "identityLabel"
      | "studentLabel"
      | "openIdentity"
      | "workspace"
    >;
  } = $props();
</script>

<header class="topbar">
  <button
    class="mobile-control"
    aria-label="開關題目列表"
    aria-expanded={session.listOpen}
    onclick={() => (session.listOpen = !session.listOpen)}
    ><PanelLeft size={18} /></button
  ><span
    >{session.parts[0] === "teacher"
      ? "管理工作台"
      : (session.exam?.title ??
        session.listed?.title ??
        (session.eid ? "" : "所有考試"))}</span
  >{#if session.problem}<span class="muted breadcrumb"
      >/ {session.problem.title}</span
    >{/if}
  <div class="grow"></div>
  {#if session.exam}<span
      class="countdown"
      class:urgent={session.now >= session.exam.startsAt &&
        session.remaining < 900000}
      ><Clock size={14} />{session.now < session.exam.startsAt
        ? "距離開始"
        : session.now >= session.exam.endsAt
          ? "考試已結束"
          : "剩餘"}
      {session.now < session.exam.endsAt ? time(session.remaining) : ""}</span
    >{/if}{#if session.workspace}<button
      class="mobile-control"
      aria-label="開關結果面板"
      aria-expanded={session.panelOpen}
      onclick={() => (session.panelOpen = !session.panelOpen)}
      ><PanelRight size={18} /></button
    >{/if}
</header>
{#if session.eid}<div class="compact-identity">
    <span>目前身分</span><button
      class="ph-no-capture"
      onclick={session.openIdentity}
      >{session.studentLabel || "尚未填寫"}</button
    ><small>{session.identityLabel}</small>
  </div>{/if}

<style>
  .topbar {
    height: 55px;
    min-height: 55px;
    background: var(--surface-raised);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px;
    font-size: 13px;
  }
  .countdown {
    font-variant-numeric: tabular-nums;
    display: flex;
    gap: 7px;
    align-items: center;
    color: var(--muted);
    white-space: nowrap;
    font-size: 12px;
    transition: color var(--duration-slow) ease;
  }
  .mobile-control {
    display: none;
  }
  @media (max-width: 1099px) {
    .mobile-control {
      display: inline-flex;
      border: 0;
      padding: 5px;
      background: none;
    }
    .breadcrumb {
      display: none;
    }
  }
  @media (max-width: 650px) {
    .topbar {
      padding: 0 10px;
      gap: 7px;
    }
    .topbar > span:first-of-type {
      max-width: 115px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .countdown {
      font-size: 10px;
      gap: 4px;
    }
    .topbar .mobile-control:last-child {
      display: none;
    }
  }

  .compact-identity {
    display: none;
  }

  @media (max-width: 1099px) {
    .compact-identity {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      flex-shrink: 0;
      padding: 0 14px;
      border-bottom: 1px solid var(--border);
      color: var(--muted);
      font-size: 12px;
    }
    .compact-identity button {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 3px 7px;
      color: var(--text);
    }
    .compact-identity small {
      margin-left: auto;
    }
  }
</style>
