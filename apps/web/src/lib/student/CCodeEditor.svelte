<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState, Prec, Annotation } from "@codemirror/state";
  import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
  } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { cpp } from "@codemirror/lang-cpp";
  import {
    bracketMatching,
    indentOnInput,
    indentUnit,
  } from "@codemirror/language";
  import {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
  } from "@codemirror/autocomplete";
  import { cCompletions, formatChanges } from "./c-editing";
  import { oneDark } from "@codemirror/theme-one-dark";

  interface Props {
    value: string;
    documentKey: string;
    fontSize?: number;
    onchange?: (val: string) => void;
  }

  let {
    value = $bindable(),
    documentKey,
    fontSize = 14,
    onchange,
  }: Props = $props();

  let editorElement: HTMLDivElement;
  let view = $state.raw<EditorView | null>(null);
  let loadedKey = "";
  const externalUpdate = Annotation.define<boolean>();

  function createState() {
    return EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        cpp(),
        indentUnit.of("    "),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: cCompletions, icons: false }),
        oneDark,
        history(),
        // Tab stays free for focus movement; Enter accepts a completion.
        // Shift+Alt+F by physical key: on macOS, Option turns the letter into another character.
        EditorView.domEventHandlers({
          keydown(event) {
            if (
              event.code !== "KeyF" ||
              !event.shiftKey ||
              !event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return false;
            event.preventDefault();
            format();
            return true;
          },
        }),
        keymap.of([
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.contentAttributes.of({ "aria-label": "C 程式碼編輯器" }),
        EditorView.updateListener.of((update) => {
          if (
            update.docChanged &&
            !update.transactions.some((t) => t.annotation(externalUpdate))
          ) {
            const newVal = update.state.doc.toString();
            value = newVal;
            if (onchange) onchange(newVal);
          }
        }),
        Prec.highest(
          EditorView.theme({
            "&": {
              backgroundColor: "var(--surface-editor)",
              color: "var(--text)",
              height: "100%",
              fontSize: "inherit",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            },
            ".cm-scroller": { overflow: "auto" },
            ".cm-activeLine, .cm-activeLineGutter": {
              backgroundColor: "var(--surface)",
            },
            ".cm-gutters": {
              backgroundColor: "var(--surface-editor)",
              borderRight: "1px solid var(--border)",
              color: "var(--muted)",
            },
            ".cm-tooltip": {
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-popup)",
              color: "var(--text)",
              overflow: "hidden",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul": {
              fontFamily: "inherit",
              maxHeight: "14em",
              maxWidth: "min(460px, calc(100vw - 24px))",
              padding: "4px",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
              padding: "4px 8px",
              borderRadius: "var(--radius-sm)",
              lineHeight: "1.5",
            },
            ".cm-tooltip-autocomplete ul li[aria-selected]": {
              backgroundColor: "var(--selected)",
              color: "var(--text)",
            },
            ".cm-completionDetail": {
              color: "var(--muted)",
              fontStyle: "normal",
              marginLeft: "0.8em",
            },
            ".cm-completionMatchedText": {
              textDecoration: "none",
              color: "var(--link)",
              fontWeight: "600",
            },
            ".cm-completionInfo": {
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 10px",
              fontFamily:
                'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              fontSize: "12px",
            },
            "&.cm-focused .cm-matchingBracket": {
              backgroundColor: "var(--selected)",
              outline: "1px solid var(--border-strong)",
            },
          }),
        ),
      ],
    });
  }
  onMount(() => {
    loadedKey = documentKey;
    view = new EditorView({
      state: createState(),
      parent: editorElement,
    });
  });

  $effect(() => {
    if (!view) return;
    if (loadedKey !== documentKey) {
      loadedKey = documentKey;
      view.setState(createState());
      return;
    }
    if (value !== view.state.doc.toString()) {
      view.dispatch({
        annotations: externalUpdate.of(true),
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  });

  /** Splits single-line blocks, re-indents and tidies as one undoable edit; false when already tidy. */
  export function format() {
    if (!view) return false;
    view.focus();
    const changes = formatChanges(view.state);
    if (!changes) return false;
    view.dispatch({ changes, userEvent: "format", scrollIntoView: true });
    return true;
  }

  onDestroy(() => {
    if (view) view.destroy();
  });
</script>

<div
  class="h-full w-full overflow-hidden"
  style="font-size: {fontSize}px;"
  bind:this={editorElement}
></div>

<style>
  div :global(.cm-editor) {
    height: 100%;
    outline: none;
  }
  /* Signatures stay in the list; the side note would cover options on phones. */
  @media (max-width: 650px) {
    div :global(.cm-completionInfo) {
      display: none;
    }
  }
  /* The caret and active line already show focus inside the editor. */
  div :global(.cm-editor.cm-focused) {
    outline: none;
  }
</style>
