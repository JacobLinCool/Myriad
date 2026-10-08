// @vitest-environment jsdom
import { expect, it } from "vitest";
import { renderMarkdownWithMath } from "../src/lib/markdown";

function parse(source: string) {
  const root = document.createElement("div");
  root.innerHTML = renderMarkdownWithMath(source);
  return root;
}

it("keeps dollars inside code blocks and code spans literal", () => {
  const root = parse(
    '```\nTotal Fare = NT$T, Each Passenger Pays = NT$P\n```\n\n用 `printf("NT$%d")` 輸出，$T$ 為總車資。',
  );
  expect(root.querySelector("pre code")?.textContent).toBe(
    "Total Fare = NT$T, Each Passenger Pays = NT$P\n",
  );
  expect(root.querySelector("p code")?.textContent).toBe('printf("NT$%d")');
  expect(root.querySelectorAll("p .katex")).toHaveLength(1);
});

it("renders display and inline math, including underscores and tables", () => {
  const root = parse(
    "$$\\text{base\\_fare} \\times 2$$\n\n一行：$\\text{cost\\_per\\_km}$ 與 $0 \\le n$。\n\n| a | b |\n| --- | --- |\n| 1 | $5000$ |",
  );
  expect(root.querySelectorAll(".katex-display")).toHaveLength(1);
  expect(root.querySelector("p")?.querySelectorAll(".katex")).toHaveLength(2);
  expect(root.querySelector("td:last-child .katex")).not.toBeNull();
  expect(root.innerHTML).not.toContain("<em>");
});

it("leaves currency prose and escaped dollars alone", () => {
  const root = parse("車資 NT$30 加 NT$40，另付 \\$5。");
  expect(root.querySelector(".katex")).toBeNull();
  expect(root.textContent?.trim()).toBe("車資 NT$30 加 NT$40，另付 $5。");
});
