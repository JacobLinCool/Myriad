<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Select from "../ui/Select.svelte";
  import PermissionEditor from "./PermissionEditor.svelte";
  import PersonalTokens from "./PersonalTokens.svelte";
  import SubmissionMonitor from "./SubmissionMonitor.svelte";
  import AnalysisPanel from "./AnalysisPanel.svelte";
  import ReportsPanel from "./ReportsPanel.svelte";
  import ExamDetail from "./ExamDetail.svelte";
  import { createTeacherSession } from "../state/teacher.svelte";
  import { RefreshCw, LoaderCircle } from "lucide-svelte";
  const session = createTeacherSession();
  let loginError = $state("");
  onMount(() => {
    if (new URLSearchParams(location.search).has("auth_error"))
      loginError = "登入未完成，請使用本站正式登入網址重試。";
    void session.load();
  });
  onDestroy(session.destroy);
</script>

<section class="teacher page-content">
  <header class="page-heading">
    <div>
      <h1>教師工作台</h1>
    </div>
    {#if session.loggedIn}<button
        disabled={session.authenticating}
        onclick={session.logout}>登出</button
      >{/if}
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
      <p>請輸入管理員核發的個人 API 憑證。</p>
      <button class="primary" disabled={session.busy || !session.credential}
        >{#if session.authenticating}<LoaderCircle
            size={15}
            class="spin"
          />{/if}登入教師工作台</button
      >
    </form>
  {:else}
    <p class="muted">
      {session.access?.account?.provider} · {session.access?.account?.subject}
      {session.access?.canCreateExams
        ? " · 可建立考試／作業"
        : " · 可管理受邀的考試／作業"}
    </p>
    {#if session.access?.isAdmin}<PermissionEditor
        scope="creation"
        onchanged={session.load}
      />{/if}
    <PersonalTokens />
    <div class="teacher-exams">
      <div class="exam-select">
        <Select
          id="teacher-exam"
          label="選擇考試"
          value={session.selected}
          placeholder="選擇要管理的考試"
          options={session.exams.map((exam) => ({
            value: exam.id,
            label: `${exam.title} · ${exam.ownerId === session.access?.account?.id ? "擁有者" : "共同管理"}${exam.revision ? "" : " · 尚未發布"}`,
          }))}
          onchange={session.select}
        />
      </div>
      <button
        disabled={!session.selected || session.busy}
        onclick={() => session.select(session.selected)}
        ><RefreshCw
          size={14}
          class={session.loading ? "spin" : ""}
        />重新整理</button
      >
    </div>
    {#if !session.exams.length && session.access?.canCreateExams}<div
        class="empty"
      >
        <h2>從本機發布第一場考試</h2>
        <p>
          使用 agent 或 CLI
          完成建置、測試與發布。所有程式驗證都在教師裝置上執行。
        </p>
        <pre>myriad init my-exam
myriad build my-exam --json
myriad test my-exam aplusb my-exam/problems/aplusb/solution.c --json
myriad deploy my-exam --remote https://your-host --json</pre>
      </div>{/if}
    {#if !session.exams.length && !session.access?.canCreateExams}<p
        class="muted"
      >
        尚無可管理的考試。請由管理員授予建立考試許可，或由考試擁有者邀請你共同管理。
      </p>{/if}
    {#if session.detail?.canManageMembers}
      {#key session.selected}<PermissionEditor
          scope="exam"
          examId={session.selected}
        />{/key}
    {/if}
    {#if session.exporting}<p class="reveal" role="status">正在匯出…</p>{/if}
    {#if session.loading && !session.analysis}<div
        class="analysis-placeholder"
        role="status"
      >
        <span class="visually-hidden">正在載入考試資料…</span>
        <span class="skeleton heading"></span>
        <div class="figures">
          {#each [0, 1, 2] as _}<div>
              <span class="skeleton" style="width:56px"></span><span
                class="skeleton figure"
              ></span>
            </div>{/each}
        </div>
        <span class="skeleton heading"></span>
        {#each [0, 1, 2, 3] as row}<span
            class="skeleton row"
            style={`width:${100 - row * 7}%`}
          ></span>{/each}
      </div>{/if}
    <div class="selection" aria-busy={session.loading}>
      {#if session.detail && session.analysis}
        {#key session.selected}<SubmissionMonitor
            analysis={session.analysis}
            detail={session.detail}
          />{/key}
      {/if}
      {#if session.detail}<div class="reveal">
          <ExamDetail
            detail={session.detail}
            saving={session.saving}
            onsave={session.saveSettings}
          />
        </div>{/if}
      {#if session.analysis}<div class="reveal">
          <AnalysisPanel
            analysis={session.analysis}
            examId={session.selected}
            busy={session.busy}
            onexport={session.exportData}
          />
        </div>{/if}
      {#if session.reports}<div class="reveal">
          <ReportsPanel reports={session.reports} />
        </div>{/if}
    </div>
  {/if}
</section>

<style>
  .oauth-login {
    display: inline-block;
    margin: 18px 0;
  }
  .exam-select {
    flex: 1;
    min-width: 180px;
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
  .selection {
    transition: opacity var(--duration-base) ease;
  }
  .selection[aria-busy="true"] {
    opacity: 0.6;
  }
  .analysis-placeholder {
    display: grid;
    gap: 14px;
    margin-top: 25px;
  }
  .analysis-placeholder .heading {
    width: 140px;
    height: 18px;
    margin-top: 12px;
  }
  .figures {
    display: flex;
    gap: 45px;
    padding: 4px 0 20px;
  }
  .figures div {
    display: grid;
    gap: 10px;
  }
  .figures .figure {
    width: 44px;
    height: 23px;
  }
  .analysis-placeholder .row {
    height: 14px;
    margin: 6px 0;
  }
  .teacher-exams {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    flex-wrap: wrap;
  }
</style>
