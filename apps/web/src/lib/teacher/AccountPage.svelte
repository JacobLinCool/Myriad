<script lang="ts">
  import PermissionEditor from "./PermissionEditor.svelte";
  import PersonalTokens from "./PersonalTokens.svelte";
  import type { createTeacherSession } from "../state/teacher.svelte";
  let { session }: { session: ReturnType<typeof createTeacherSession> } =
    $props();
</script>

<dl class="facts ph-no-capture">
  <div>
    <dt>登入服務</dt>
    <dd>{session.access?.account?.provider}</dd>
  </div>
  <div>
    <dt>帳號</dt>
    <dd>{session.access?.account?.subject}</dd>
  </div>
  <div>
    <dt>權限</dt>
    <dd>
      {session.access?.isAdmin
        ? "平台管理員"
        : session.access?.canCreateExams
          ? "可建立考試／作業"
          : "可管理受邀的考試／作業"}
    </dd>
  </div>
</dl>
<PersonalTokens />
{#if session.access?.isAdmin}<PermissionEditor
    scope="creation"
    onchanged={session.load}
  />{/if}

<style>
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 45px;
    margin: 0 0 8px;
  }
  .facts dt {
    font-size: 12px;
    color: var(--muted);
  }
  .facts dd {
    margin: 6px 0 0;
  }
</style>
