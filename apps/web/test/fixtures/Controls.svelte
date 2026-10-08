<script lang="ts">
  import Dialog from "../../src/lib/ui/Dialog.svelte";
  import Tabs from "../../src/lib/ui/Tabs.svelte";
  import Collapsible from "../../src/lib/ui/Collapsible.svelte";
  import IconButton from "../../src/lib/ui/IconButton.svelte";
  let open = $state(false),
    tab = $state("one");
</script>

<IconButton label="開啟設定" onclick={() => (open = true)}
  ><span aria-hidden="true">⚙</span></IconButton
>
<Dialog title="設定" bind:open
  ><input aria-label="名稱" /><button onclick={() => (open = false)}
    >完成</button
  ></Dialog
>
<Tabs
  label="功能"
  bind:value={tab}
  items={[
    { value: "one", label: "第一頁" },
    { value: "two", label: "第二頁" },
  ]}
>
  {#snippet content(value)}<p>
      {value === "one" ? "第一頁內容" : "第二頁內容"}
    </p>{/snippet}
</Tabs>
<Collapsible id="report" title="詳細資料"
  ><code>inline</code>
  <table><tbody><tr><td>報告內容</td></tr></tbody></table></Collapsible
>
