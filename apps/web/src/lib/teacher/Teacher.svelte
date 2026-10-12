<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { LoaderCircle, UserRound } from "lucide-svelte";
  import TeacherExams from "./TeacherExams.svelte";
  import AccountPage from "./AccountPage.svelte";
  import ExamWorkspace from "./ExamWorkspace.svelte";
  import { createTeacherSession } from "../state/teacher.svelte";
  import { parseTeacherRoute } from "../state/routes";
  import { follow, type Navigate } from "./link";
  let { path, navigate }: { path: string; navigate: Navigate } = $props();
  const session = createTeacherSession();
  const route = $derived(
    parseTeacherRoute(path.split("/").filter(Boolean)) ?? {
      view: "exams" as const,
    },
  );
  const title = $derived(
    route.view === "account"
      ? "帳號與權限"
      : route.view === "exam"
        ? ((session.detail?.id === route.examId
            ? session.detail.title
            : null) ??
          session.exams.find((e) => e.id === route.examId)?.title ??
          "考試")
        : "管理工作台",
  );
  let loginError = $state("");
  onMount(() => {
    if (new URLSearchParams(location.search).has("auth_error"))
      loginError = "登入未完成，請使用本站正式登入網址重試。";
    void session.load();
  });
  onDestroy(session.destroy);
  // The exam in the address is the open exam; leaving the exam view closes it.
  $effect(() => {
    if (!session.loggedIn) return;
    if (route.view === "exam") {
      if (route.examId !== session.selected) void session.open(route.examId);
    } else if (session.selected) session.close();
  });
</script>

<section class="teacher page-content">
  <header class="page-heading">
    <div>
      {#if route.view !== "exams"}<a
          class="crumb"
          href="/teacher"
          onclick={(e) => follow(e, "/teacher", navigate)}>管理工作台</a
        >{/if}
      <h1>{title}</h1>
    </div>
    {#if session.loggedIn}<div class="account-actions">
        <a
          href="/teacher/account"
          aria-current={route.view === "account" ? "page" : undefined}
          onclick={(e) => follow(e, "/teacher/account", navigate)}
          ><UserRound size={14} />帳號與權限</a
        ><button disabled={session.authenticating} onclick={session.logout}
          >登出</button
        >
      </div>{/if}
  </header>
  {#if loginError}<p class="error" role="alert">{loginError}</p>{/if}
  {#if session.error}<p class="error" role="alert">{session.error}</p>{/if}
  {#if !session.checked}
    <div class="login-form" role="status" aria-busy="true">
      <span class="visually-hidden">正在確認登入狀態…</span>
      <span class="skeleton" style="width:96px"></span>
      <span class="skeleton field"></span>
    </div>
  {:else if !session.loggedIn}
    {#if session.access?.nycuEnabled}<a
        class="oauth-login"
        href="/api/auth/nycu/start?returnTo=%2Fteacher">使用 NYCU 帳號登入</a
      >{/if}
    <form
      class="login-form"
      onsubmit={(e) => {
        e.preventDefault();
        session.login();
      }}
    >
      <label for="teacher-token">個人 API 憑證</label><input
        id="teacher-token"
        type="password"
        autocomplete="off"
        bind:value={session.credential}
        required
      />
      <p>請輸入平台管理員核發的個人 API 憑證。</p>
      <button class="primary" disabled={session.busy || !session.credential}
        >{#if session.authenticating}<LoaderCircle
            size={15}
            class="spin"
          />{/if}登入管理工作台</button
      >
    </form>
  {:else if route.view === "account"}
    <AccountPage {session} />
  {:else if route.view === "exam"}
    <ExamWorkspace {session} tab={route.tab} {navigate} />
  {:else}
    <TeacherExams {session} {navigate} />
  {/if}
</section>

<style>
  h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .page-heading {
    align-items: end;
    margin-bottom: 18px;
  }
  .crumb {
    display: inline-block;
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 12px;
    text-decoration: none;
  }
  .crumb:hover {
    color: var(--text);
  }
  .account-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .account-actions a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
    text-decoration: none;
  }
  .account-actions a:hover,
  .account-actions a[aria-current="page"] {
    color: var(--text);
  }
  .oauth-login {
    display: inline-block;
    margin: 18px 0;
  }
  .login-form {
    max-width: 460px;
  }
  div.login-form {
    display: grid;
    gap: 9px;
    margin-top: 14px;
  }
  .login-form .field {
    height: 40px;
  }
  .login-form p {
    font-size: 12px;
  }
</style>
