// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import { tick } from "svelte";
import CCodeEditor from "../src/lib/student/CCodeEditor.svelte";
afterEach(cleanup);
it("resets undo history on document change without saving external content into the previous draft", async () => {
  const changed = vi.fn();
  const component = render(CCodeEditor, {
    documentKey: "student-a/exam/problem",
    value: "first",
    onchange: changed,
  });
  await tick();
  const editor = EditorView.findFromDOM(
    screen.getByRole("textbox", { name: "C 程式碼編輯器" }),
  )!;
  editor.dispatch({ changes: { from: 5, insert: " edit" } });
  await tick();
  expect(changed).toHaveBeenCalledWith("first edit");
  await component.rerender({
    documentKey: "student-b/exam/problem",
    value: "second",
  });
  expect(editor.state.doc.toString()).toBe("second");
  expect(undo(editor)).toBe(false);
  expect(changed).toHaveBeenCalledTimes(1);
  editor.dispatch({ changes: { from: 6, insert: " new" } });
  await tick();
  expect(undo(editor)).toBe(true);
  await tick();
  expect(editor.state.doc.toString()).toBe("second");
});
