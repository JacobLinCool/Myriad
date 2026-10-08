// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { cpp } from "@codemirror/lang-cpp";
import { indentUnit } from "@codemirror/language";
import { undo } from "@codemirror/commands";
import {
  CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { cCompletions, formatChanges } from "../src/lib/student/c-editing";
import CCodeEditor from "../src/lib/student/CCodeEditor.svelte";
afterEach(cleanup);
const state = (doc: string) =>
  EditorState.create({ doc, extensions: [cpp(), indentUnit.of("    ")] });
it("formatting re-indents, strips trailing spaces and keeps one final newline", () => {
  const messy =
    'int main(void){\nfor(int i=0;i<3;i++){   \nif(i){\nputs("x");\n}\n}\n\t\treturn 0;\n}\n\n\n';
  const s = state(messy);
  const formatted = formatChanges(s)!.apply(s.doc).toString();
  expect(formatted).toBe(
    'int main(void){\n    for(int i=0;i<3;i++){\n        if(i){\n            puts("x");\n        }\n    }\n    return 0;\n}\n',
  );
  expect(formatChanges(state(formatted))).toBeNull();
});
it("formatting puts single-line block contents one statement per line", () => {
  const s = state(
    'int main(void) {\n    for (int i = 1; i <= n; i++) { long long x; scanf("%lld", &x); p[i] = p[i - 1] + x; }\n    int a[3] = {1, 2, 3}; // keep\n    if (a[0]) { return 1; } else { return 2; }\n}\nvoid e(void) {}\n',
  );
  const formatted = formatChanges(s)!.apply(s.doc).toString();
  expect(formatted).toBe(
    'int main(void) {\n    for (int i = 1; i <= n; i++) {\n        long long x;\n        scanf("%lld", &x);\n        p[i] = p[i - 1] + x;\n    }\n    int a[3] = {1, 2, 3}; // keep\n    if (a[0]) {\n        return 1;\n    } else {\n        return 2;\n    }\n}\nvoid e(void) {}\n',
  );
  expect(formatChanges(state(formatted))).toBeNull();
});
it("editor formatting is one undoable edit that saves the draft", async () => {
  const saved: string[] = [];
  const view = render(CCodeEditor, {
    documentKey: "k",
    value: "int main(void){\nreturn 0;\n}\n",
    onchange: (v: string) => saved.push(v),
  });
  await tick();
  const editor = EditorView.findFromDOM(
    screen.getByRole("textbox", { name: "C 程式碼編輯器" }),
  )!;
  expect(view.component.format()).toBe(true);
  expect(editor.state.doc.toString()).toBe(
    "int main(void){\n    return 0;\n}\n",
  );
  expect(saved.at(-1)).toBe("int main(void){\n    return 0;\n}\n");
  expect(view.component.format()).toBe(false);
  undo(editor);
  expect(editor.state.doc.toString()).toBe("int main(void){\nreturn 0;\n}\n");
});
async function complete(doc: string, explicit = false) {
  const pos = doc.indexOf("|"),
    s = state(doc.replace("|", ""));
  const context = new CompletionContext(s, pos, explicit);
  const results = await Promise.all(
    cCompletions.map((source: CompletionSource) => source(context)),
  );
  return (results.filter(Boolean) as CompletionResult[]).flatMap((r) =>
    r.options.map((o) => o.label),
  );
}
it("completes keywords, library functions and names from the document", async () => {
  const labels = await complete(
    "long long prefix[10];\nint main(void){\n  pr|\n}\n",
  );
  expect(labels).toEqual(
    expect.arrayContaining(["printf", "prefix", "return"]),
  );
  expect(labels.filter((l) => l === "prefix")).toHaveLength(1);
});
it("does not complete inside strings or comments and completes headers", async () => {
  expect(await complete('int main(void){ puts("pr|"); }')).toEqual([]);
  expect(await complete("// pr|\nint main(void){}")).toEqual([]);
  expect(await complete("#include <st|")).toEqual(
    expect.arrayContaining(["stdio.h", "stdlib.h", "string.h"]),
  );
});
