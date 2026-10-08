<script lang="ts">
  import type { StudentSession } from "../state/student.svelte";
  import Dialog from "../ui/Dialog.svelte";
  import { LogIn, UserRound } from "lucide-svelte";
  let {
    session,
  }: {
    session: Pick<
      StudentSession,
      | "showIdentity"
      | "studentInput"
      | "identityKind"
      | "student"
      | "nycuEnabled"
      | "authBusy"
      | "busy"
      | "useGuest"
      | "loginNYCU"
      | "error"
    >;
  } = $props();
</script>

<Dialog title="作答身分" bind:open={session.showIdentity}>
  {#if session.identityKind === "nycu"}<p>NYCU · {session.student}</p>{/if}
  {#if session.error}<p class="error" role="alert">{session.error}</p>{/if}
  {#if session.nycuEnabled}<button
      class="oauth"
      disabled={session.busy || session.authBusy}
      onclick={session.loginNYCU}><LogIn size={18} />使用 NYCU 帳號登入</button
    >{/if}
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void session.useGuest();
    }}
  >
    <h3><UserRound size={16} />訪客作答</h3>
    <label for="guest-label">學號或名稱</label>
    <input
      id="guest-label"
      bind:value={session.studentInput}
      maxlength="64"
      required
      autocomplete="username"
    />
    <div class="toolbar">
      <button type="button" onclick={() => (session.showIdentity = false)}
        >取消</button
      ><button
        class="primary"
        disabled={session.authBusy ||
          session.busy ||
          !session.studentInput.trim()}>以訪客身分作答</button
      >
    </div>
  </form>
</Dialog>

<style>
  .oauth {
    width: 100%;
    margin: 12px 0;
    min-height: 44px;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  form {
    border-top: 1px solid var(--border);
    margin-top: 16px;
    padding-top: 8px;
  }
  .toolbar {
    justify-content: flex-end;
    margin-bottom: 0;
  }
  p {
    font-size: 13px;
  }
</style>
