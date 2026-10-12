<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { api } from "../api";
  let {
    scope,
    examId,
    onchanged,
  }: {
    scope: "creation" | "exam";
    examId?: string;
    onchanged?: () => Promise<void>;
  } = $props();
  type Member = { id: string; provider: string; subject: string; name: string };
  let members = $state<Member[]>([]),
    provider = $state("nycu"),
    subject = $state(""),
    busy = $state(false),
    error = $state("");
  const base = $derived(
    scope === "creation"
      ? "/api/admin/creation-grants"
      : `/api/teacher/exams/${encodeURIComponent(examId!)}/members`,
  );
  const controller = new AbortController();
  async function load() {
    members = await api<Member[]>(base, "GET", undefined, {
      signal: controller.signal,
    });
  }
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await action();
    } catch (e) {
      if (!controller.signal.aborted)
        error = e instanceof Error ? e.message : "無法更新權限";
    } finally {
      busy = false;
    }
  }
  onMount(() => {
    void run(load);
  });
  onDestroy(() => controller.abort());
  async function save(event: SubmitEvent) {
    event.preventDefault();
    await run(async () => {
      await api(
        base,
        "POST",
        { provider: provider.trim(), subject: subject.trim() },
        { signal: controller.signal },
      );
      subject = "";
      await load();
      await onchanged?.();
    });
  }
</script>

<details class="permissions">
  <summary
    >{scope === "creation"
      ? "全域管理 · 建立考試許可"
      : "考試權限 · 共同管理者"}</summary
  >
  <p class="muted">
    {scope === "creation"
      ? "許可持有人可以建立考試／作業，並成為擁有者。撤銷此許可不會移除既有考試權限。"
      : "共同管理者可修改、發布、預覽及檢視此考試的提交與報告；只有擁有者可以邀請或移除共同管理者。"}
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="table-scroll">
    <table>
      <thead><tr><th>登入服務</th><th>帳號</th><th></th></tr></thead><tbody>
        {#each members as member}<tr
            ><td>{member.provider}</td><td>{member.subject}</td><td
              ><button
                disabled={busy}
                onclick={() =>
                  run(async () => {
                    await api(
                      `${base}/${encodeURIComponent(member.id)}`,
                      "DELETE",
                      undefined,
                      { signal: controller.signal },
                    );
                    await load();
                    await onchanged?.();
                  })}
                >{scope === "creation" ? "撤銷許可" : "移除"}<span
                  class="visually-hidden"
                >
                  {member.provider} {member.subject}</span
                ></button
              ></td
            ></tr
          >
        {:else}<tr
            ><td colspan="3" class="muted"
              >{busy ? "載入中…" : "尚未加入任何帳號。"}</td
            ></tr
          >{/each}
      </tbody>
    </table>
  </div>
  <form onsubmit={save}>
    <label
      >登入服務<input
        required
        pattern={"[a-z][a-z0-9_\\-]{0,63}"}
        bind:value={provider}
      /></label
    >
    <label
      >帳號識別<input
        required
        maxlength="256"
        bind:value={subject}
        placeholder="NYCU 使用 username，區分大小寫"
      /></label
    >
    <button disabled={busy || !subject.trim() || !provider.trim()}
      >{scope === "creation" ? "授予建立許可" : "邀請共同管理"}</button
    >
  </form>
</details>

<style>
  .permissions {
    margin: 20px 0;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  summary {
    cursor: pointer;
  }
  form {
    display: grid;
    grid-template-columns: minmax(130px, 1fr) minmax(220px, 2fr) auto;
    gap: 12px;
    align-items: end;
    margin-top: 16px;
  }
  label {
    margin: 0;
  }
  .muted {
    font-size: 12px;
  }
  @media (max-width: 650px) {
    form {
      grid-template-columns: 1fr;
    }
  }
</style>
