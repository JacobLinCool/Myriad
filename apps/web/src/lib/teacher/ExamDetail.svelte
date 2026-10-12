<script lang="ts">
  import { Pencil } from "lucide-svelte";
  import Select from "../ui/Select.svelte";
  import Markdown from "../ui/Markdown.svelte";
  import { date } from "../format";
  import type { ExamDetail, ExamSettings } from "./data";
  let {
    detail,
    saving,
    onsave,
  }: {
    detail: ExamDetail;
    saving: boolean;
    onsave: (settings: Partial<ExamSettings>) => Promise<boolean>;
  } = $props();

  const policyLabel = { best: "每題取最佳提交", last: "每題取最後一次提交" };
  /** `datetime-local` works in the visitor's local time without seconds. */
  function toLocal(ms: number) {
    const d = new Date(ms),
      pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  let editing = $state(false);
  let draft = $state({
    title: "",
    startsAt: "",
    endsAt: "",
    rules: "",
    policy: "best" as ExamSettings["policy"],
  });
  function edit() {
    draft = {
      title: detail.title,
      startsAt: toLocal(detail.startsAt),
      endsAt: toLocal(detail.endsAt),
      rules: detail.rules,
      policy: detail.policy,
    };
    editing = true;
  }
  // The inputs show minutes only; an untouched time keeps its exact value.
  const startsAt = $derived(
      draft.startsAt === toLocal(detail.startsAt)
        ? detail.startsAt
        : new Date(draft.startsAt).getTime(),
    ),
    endsAt = $derived(
      draft.endsAt === toLocal(detail.endsAt)
        ? detail.endsAt
        : new Date(draft.endsAt).getTime(),
    );
  const invalid = $derived(
    !draft.title.trim()
      ? "請填寫考試標題。"
      : !Number.isFinite(startsAt) || !Number.isFinite(endsAt)
        ? "請填寫開始與結束時間。"
        : endsAt <= startsAt
          ? "結束時間必須晚於開始時間。"
          : "",
  );
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (invalid) return;
    const next: ExamSettings = {
      title: draft.title.trim(),
      startsAt,
      endsAt,
      rules: draft.rules,
      policy: draft.policy,
    };
    // Only fields the teacher changed are sent.
    const changes = Object.fromEntries(
      Object.entries(next).filter(
        ([key, value]) => detail[key as keyof ExamSettings] !== value,
      ),
    ) as Partial<ExamSettings>;
    if (!Object.keys(changes).length || (await onsave(changes)))
      editing = false;
  }
</script>

<section class="detail" aria-labelledby="exam-detail-title">
  <header class="detail-heading">
    <h2 id="exam-detail-title">考試資訊</h2>
    <div class="grow"></div>
    {#if !editing}<button onclick={edit}
        ><Pencil size={14} />編輯考試資訊</button
      >{/if}
  </header>
  {#if editing}
    <form class="settings reveal" onsubmit={save}>
      <label for="exam-title">考試標題</label>
      <input
        id="exam-title"
        bind:value={draft.title}
        maxlength="200"
        required
      />
      <div class="times">
        <div>
          <label for="exam-starts">開始時間</label>
          <input
            id="exam-starts"
            type="datetime-local"
            bind:value={draft.startsAt}
            required
          />
        </div>
        <div>
          <label for="exam-ends">結束時間</label>
          <input
            id="exam-ends"
            type="datetime-local"
            bind:value={draft.endsAt}
            required
          />
        </div>
      </div>
      <div class="policy">
        <Select
          label="計分方式"
          value={draft.policy}
          options={[
            { value: "best", label: policyLabel.best },
            { value: "last", label: policyLabel.last },
          ]}
          onchange={(value) => (draft.policy = value as ExamSettings["policy"])}
        />
      </div>
      <label for="exam-rules">考試說明</label>
      <textarea
        id="exam-rules"
        bind:value={draft.rules}
        maxlength="20000"
        rows="6"
      ></textarea>
      <p class="note">
        儲存後立即對學生生效。之後以 CLI 上傳題目時，會以本機 exam.json
        的設定覆蓋這些欄位。
      </p>
      {#if invalid}<p class="error" role="alert">{invalid}</p>{/if}
      <div class="toolbar">
        <button
          type="button"
          onclick={() => (editing = false)}
          disabled={saving}>取消</button
        ><button class="primary" disabled={saving || !!invalid}
          >{saving ? "儲存中…" : "儲存"}</button
        >
      </div>
    </form>
  {:else}
    <dl class="facts">
      <div>
        <dt>標題</dt>
        <dd>{detail.title}</dd>
      </div>
      <div>
        <dt>期間</dt>
        <dd>{date(detail.startsAt)} — {date(detail.endsAt)}</dd>
      </div>
      <div>
        <dt>計分方式</dt>
        <dd>{policyLabel[detail.policy]}</dd>
      </div>
      <div>
        <dt>最後上傳</dt>
        <dd>
          {#if detail.publishedAt}{date(detail.publishedAt)}
            <code>{detail.revision?.slice(0, 8)}</code>{:else}尚未發布{/if}
        </dd>
      </div>
    </dl>
    <h3>考試說明</h3>
    <article class="statement-prose rules">
      {#if detail.rules}<Markdown source={detail.rules} lines={2} />{:else}<p
          class="muted"
        >
          尚未填寫考試說明。
        </p>{/if}
    </article>
  {/if}
  <h3>題目</h3>
  <p class="muted note">
    題目內容與測資只能在本機修改後以 CLI
    上傳；版本由測資、預期輸出與限制決定，修改題敘不會改變版本。需要在另一台電腦修改時，先在「成績與匯出」下載題目包，再以
    <code>myriad export &lt;目錄&gt; --file &lt;下載的檔案&gt;</code>
    還原成題目目錄。
  </p>
  <div class="table-scroll">
    <table>
      <thead
        ><tr
          ><th></th><th>題目</th><th>ID</th><th>測資</th><th>子任務</th><th
            >版本</th
          ></tr
        ></thead
      ><tbody
        >{#each detail.problems as p, i (p.id)}<tr
            ><td class="muted">{String.fromCharCode(65 + i)}</td><td
              >{p.title}</td
            ><td><code>{p.id}</code></td><td>{p.testCount}</td><td
              >{p.groups}</td
            ><td
              ><code title={p.version ?? ""}
                >{p.version?.slice(0, 8) ?? "—"}</code
              ></td
            ></tr
          >{:else}<tr><td colspan="6" class="muted">尚未上傳題目。</td></tr
          >{/each}</tbody
      >
    </table>
  </div>
</section>

<style>
  .detail {
    margin-top: 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .detail-heading {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .detail-heading h2 {
    margin: 0;
  }
  .detail-heading button {
    font-size: 12px;
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 18px 28px;
    margin: 18px 0 6px;
  }
  .facts dt {
    font-size: 12px;
    color: var(--muted);
  }
  .facts dd {
    margin: 6px 0 0;
    font-variant-numeric: tabular-nums;
  }
  .facts code,
  td code {
    font-size: 11px;
    color: var(--muted);
  }
  .rules {
    padding: 0;
  }
  .settings {
    max-width: 640px;
    margin-top: 6px;
  }
  .times {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .policy {
    margin: 14px 0 2px;
  }
  .note {
    font-size: 12px;
  }
  .settings .toolbar {
    justify-content: flex-end;
  }
  @media (max-width: 650px) {
    .times {
      grid-template-columns: 1fr;
    }
  }
</style>
