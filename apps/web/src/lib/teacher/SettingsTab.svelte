<script lang="ts">
  import ExamDetail from "./ExamDetail.svelte";
  import PermissionEditor from "./PermissionEditor.svelte";
  import type { createTeacherSession } from "../state/teacher.svelte";
  import type { ExamDetail as Detail } from "./data";
  let {
    session,
    detail,
  }: {
    session: ReturnType<typeof createTeacherSession>;
    detail: Detail;
  } = $props();
</script>

<ExamDetail {detail} saving={session.saving} onsave={session.saveSettings} />
{#if detail.canManageMembers}<PermissionEditor
    scope="exam"
    examId={detail.id}
  />{/if}
