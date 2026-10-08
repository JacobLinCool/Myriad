import "katex/dist/katex.min.css";
import {
  Marked,
  type TokenizerExtension,
  type RendererExtension,
} from "marked";
import DOMPurify from "dompurify";
import katex from "katex";

/**
 * Math is tokenized by marked itself instead of being replaced before parsing,
 * so `$` inside code spans and fenced blocks (e.g. `NT$%d`) stays literal.
 */
type MathToken = { type: "math"; raw: string; text: string; display: boolean };

const blockMath: TokenizerExtension & RendererExtension = {
  name: "math",
  level: "block",
  start: (src) => src.match(/^ {0,3}\$\$/m)?.index,
  tokenizer(src) {
    const match = /^ {0,3}\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n+|$)/.exec(src);
    if (!match) return;
    return {
      type: "math",
      raw: match[0],
      text: match[1].trim(),
      display: true,
    };
  },
  renderer: (token) => render(token as unknown as MathToken) + "\n",
};

// Pandoc's rule: no space just inside the dollars and no digit right after the
// closing one, so prose like "NT$30 and NT$40" is not taken as math.
const inlinePattern = /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/;
const inlineDisplayPattern = /^\$\$((?:\\.|[^\\$])+?)\$\$/;

const inlineMath: TokenizerExtension & RendererExtension = {
  name: "math",
  level: "inline",
  start(src) {
    const index = src.search(/(?<!\\)\$/);
    return index < 0 ? undefined : index;
  },
  tokenizer(src) {
    const display = inlineDisplayPattern.exec(src);
    if (display)
      return {
        type: "math",
        raw: display[0],
        text: display[1].trim(),
        display: true,
      };
    const inline = inlinePattern.exec(src);
    if (inline)
      return { type: "math", raw: inline[0], text: inline[1], display: false };
  },
  renderer: (token) => render(token as unknown as MathToken),
};

function render(token: MathToken): string {
  return katex.renderToString(token.text, {
    displayMode: token.display,
    throwOnError: false,
  });
}

const parser = new Marked({ extensions: [blockMath, inlineMath] });

export function renderMarkdownWithMath(content: string): string {
  if (!content) return "";
  const html = parser.parse(content, { async: false }) as string;
  // KaTeX emits MathML plus styled spans; allow those through the sanitizer.
  return DOMPurify.sanitize(html, {
    ADD_TAGS: [
      "annotation",
      "semantics",
      "math",
      "mrow",
      "mo",
      "mi",
      "mn",
      "msup",
      "msub",
      "msubsup",
      "mover",
      "munder",
      "munderover",
      "mfrac",
      "mroot",
      "msqrt",
      "mtext",
      "mspace",
      "mpadded",
      "mstyle",
      "mtable",
      "mtr",
      "mtd",
      "svg",
      "path",
      "line",
    ],
    ADD_ATTR: ["aria-hidden", "style", "viewBox", "preserveAspectRatio"],
  });
}
