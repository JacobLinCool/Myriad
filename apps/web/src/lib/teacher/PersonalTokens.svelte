<script lang="ts">
  import { onDestroy } from "svelte";
  import { api } from "../api";
  let tokens = $state<{ id: string; createdAt: number }[]>([]),
    secret = $state(""),
    busy = $state(false),
    error = $state("");
  const controller = new AbortController();
  onDestroy(() => controller.abort());
  async function load() {
    tokens = await api("/api/teacher/tokens", "GET", undefined, {
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
        error = e instanceof Error ? e.message : "無法更新憑證";
    } finally {
      busy = false;
    }
  }
</script>

<details
  class="tokens"
  ontoggle={(e) => {
    if (e.currentTarget.open) void run(load);
    else secret = "";
  }}
>
  <summary>個人 CLI 憑證</summary>
  <p class="muted">
    憑證沿用你的帳號權限，供 CLI 或 agent
    使用。新憑證只顯示一次，請存入受保護的檔案，再以 --token-file 使用。
  </p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <button
    disabled={busy}
    onclick={() =>
      run(async () => {
        const result = await api<{ token: string }>(
          "/api/teacher/tokens",
          "POST",
          {},
          { signal: controller.signal },
        );
        secret = result.token;
        await load();
      })}>建立個人憑證</button
  >
  {#if secret}<label
      >新憑證<input aria-label="新憑證" readonly value={secret} /></label
    >{/if}
  {#each tokens as token}<div class="token">
      <code>{token.id}</code><span
        >{new Date(token.createdAt).toLocaleDateString("zh-TW")}</span
      ><button
        disabled={busy}
        onclick={() =>
          run(async () => {
            await api(
              `/api/teacher/tokens/${encodeURIComponent(token.id)}`,
              "DELETE",
              undefined,
              { signal: controller.signal },
            );
            secret = "";
            await load();
          })}>撤銷<span class="visually-hidden"> {token.id}</span></button
      >
    </div>{/each}
</details>

<style>
  .tokens {
    margin: 20px 0;
  }
  summary {
    cursor: pointer;
  }
  .muted {
    font-size: 12px;
  }
  .token {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    padding: 12px 0;
  }
  code {
    overflow-wrap: anywhere;
  }
</style>
