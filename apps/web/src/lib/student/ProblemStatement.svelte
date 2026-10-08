<script lang="ts">
  import type { StudentSession } from "../state/student.svelte";

  import { ChevronUp, Check } from "lucide-svelte";
  import Markdown from "../ui/Markdown.svelte";

  let {
    session,
  }: {
    session: Pick<
      StudentSession,
      | "busy"
      | "collapsed"
      | "input"
      | "mobile"
      | "panel"
      | "panelOpen"
      | "problem"
    >;
  } = $props();
  /** Briefly confirms which sample was copied into the custom input. */
  let filled = $state<number | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));
</script>

{#if session.problem}
  <section class="statement" class:collapsed={session.collapsed}>
    <header class="pane-heading">
      <span>題目敘述</span><button
        aria-label="收合題目敘述"
        onclick={() => (session.collapsed = true)}
        ><ChevronUp size={16} /></button
      >
    </header>
    {#key session.problem.id}
      <article class="statement-prose reveal">
        <Markdown
          source={session.problem.statementMd}
        />{#each session.problem.sampleCases as sample, i}<h3>
            範例 {i + 1}
          </h3>
          <div class="sample-pair">
            <div>
              <small>輸入</small>
              <pre>{sample.input}</pre>
            </div>
            <div>
              <small>輸出</small>
              <pre>{sample.output}</pre>
            </div>
          </div>
          <button
            disabled={session.busy}
            onclick={() => {
              session.input = sample.input;
              session.panel = "run";
              session.panelOpen = true;
              session.mobile = "results";
              filled = i;
              clearTimeout(timer);
              timer = setTimeout(() => (filled = null), 1600);
            }}
            >{#if filled === i}<Check
                size={14}
              />已填入{:else}使用這組輸入{/if}</button
          >{/each}
      </article>
    {/key}
  </section>
{/if}

<style>
  .statement {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition:
      opacity var(--duration-base) ease,
      visibility 0s;
  }
  .statement.collapsed {
    visibility: hidden;
    opacity: 0;
    transition:
      opacity var(--duration-fast) ease,
      visibility 0s linear var(--duration-slow);
  }
  .sample-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .sample-pair pre {
    margin: 5px 0;
  }
  @media (max-width: 650px) {
    .sample-pair {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 650px) {
    .pane-heading button {
      display: none;
    }
  }
</style>
