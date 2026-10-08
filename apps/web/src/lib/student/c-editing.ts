import { ChangeSet, type EditorState } from "@codemirror/state";
import {
  ensureSyntaxTree,
  indentRange,
  syntaxTree,
} from "@codemirror/language";
import {
  completeFromList,
  ifNotIn,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";

/** Bodies whose contents go one per line: blocks and struct/union members. */
const bodies = new Set(["CompoundStatement", "FieldDeclarationList"]);

/**
 * Breaks single-line bodies apart: a newline after `{`, between statements that
 * share a line, and before `}`. Empty bodies and trailing comments stay put.
 */
function breakBodies(state: EditorState): ChangeSet {
  const changes: { from: number; to: number; insert: string }[] = [];
  const { doc } = state;
  syntaxTree(state).iterate({
    enter(node) {
      if (!bodies.has(node.name)) return;
      const children = [];
      for (let child = node.node.firstChild; child; child = child.nextSibling)
        children.push(child);
      if (children.length <= 2) return;
      for (let i = 1; i < children.length; i++) {
        const previous = children[i - 1],
          child = children[i];
        if (doc.lineAt(previous.to).number !== doc.lineAt(child.from).number)
          continue;
        if (/Comment$/.test(child.name) && previous.name !== "{") continue;
        changes.push({ from: previous.to, to: child.from, insert: "\n" });
      }
    },
  });
  return ChangeSet.of(changes, doc.length);
}

/**
 * Lightweight formatting: put block contents one statement per line, re-indent
 * every line from the syntax tree, strip trailing whitespace and end the file
 * with exactly one newline. Spacing inside a statement is left as written.
 * Returns null when nothing would change.
 */
export function formatChanges(state: EditorState): ChangeSet | null {
  ensureSyntaxTree(state, state.doc.length, 1000);
  const breaks = breakBodies(state);
  const broken = breaks.empty ? state : state.update({ changes: breaks }).state;
  ensureSyntaxTree(broken, broken.doc.length, 1000);
  const indent = indentRange(broken, 0, broken.doc.length);
  const doc = indent.apply(broken.doc);
  const trims: { from: number; to: number; insert?: string }[] = [];
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n),
      kept = line.text.replace(/\s+$/, "");
    if (kept.length < line.text.length)
      trims.push({ from: line.from + kept.length, to: line.to });
  }
  const text = doc.toString(),
    end = text.replace(/\s+$/, "").length;
  // Trailing blank lines collapse into the single final newline.
  if (text.slice(end) !== "\n") {
    while (trims.length && trims[trims.length - 1].from >= end) trims.pop();
    trims.push({ from: end, to: doc.length, insert: "\n" });
  }
  const changes = breaks
    .compose(indent)
    .compose(ChangeSet.of(trims, doc.length));
  return changes.empty ? null : changes;
}

const keywords = [
  "auto",
  "break",
  "case",
  "char",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extern",
  "float",
  "for",
  "goto",
  "if",
  "inline",
  "int",
  "long",
  "register",
  "return",
  "short",
  "signed",
  "sizeof",
  "static",
  "struct",
  "switch",
  "typedef",
  "union",
  "unsigned",
  "void",
  "volatile",
  "while",
].map((label): Completion => ({ label, type: "keyword" }));

const fn = (label: string, detail: string, info: string): Completion => ({
  label,
  type: "function",
  detail,
  info,
});
const constant = (label: string, info: string): Completion => ({
  label,
  type: "constant",
  info,
});
const type = (label: string, info: string): Completion => ({
  label,
  type: "type",
  info,
});
/** Standard library names students commonly need, with their signatures. */
const library: Completion[] = [
  fn("printf", "(const char *format, ...)", "<stdio.h> 格式化輸出到標準輸出"),
  fn(
    "scanf",
    "(const char *format, ...)",
    "<stdio.h> 從標準輸入讀取，回傳成功讀取的項目數",
  ),
  fn("puts", "(const char *s)", "<stdio.h> 輸出字串並換行"),
  fn("putchar", "(int c)", "<stdio.h> 輸出一個字元"),
  fn("getchar", "(void)", "<stdio.h> 讀取一個字元，結尾回傳 EOF"),
  fn(
    "fgets",
    "(char *s, int n, FILE *stream)",
    "<stdio.h> 讀取一行，最多 n - 1 個字元",
  ),
  fn("fputs", "(const char *s, FILE *stream)", "<stdio.h> 輸出字串，不加換行"),
  fn(
    "fprintf",
    "(FILE *stream, const char *format, ...)",
    "<stdio.h> 格式化輸出到指定串流",
  ),
  fn(
    "sprintf",
    "(char *s, const char *format, ...)",
    "<stdio.h> 格式化輸出到字串",
  ),
  fn(
    "snprintf",
    "(char *s, size_t n, const char *format, ...)",
    "<stdio.h> 有長度上限的 sprintf",
  ),
  fn(
    "sscanf",
    "(const char *s, const char *format, ...)",
    "<stdio.h> 從字串讀取",
  ),
  constant("EOF", "<stdio.h> 檔案結尾"),
  constant("stdin", "<stdio.h> 標準輸入"),
  constant("stdout", "<stdio.h> 標準輸出"),
  constant("stderr", "<stdio.h> 標準錯誤"),
  fn("malloc", "(size_t size)", "<stdlib.h> 配置記憶體"),
  fn("calloc", "(size_t n, size_t size)", "<stdlib.h> 配置並清零記憶體"),
  fn("realloc", "(void *p, size_t size)", "<stdlib.h> 調整配置大小"),
  fn("free", "(void *p)", "<stdlib.h> 釋放記憶體"),
  fn(
    "qsort",
    "(void *base, size_t n, size_t size, int (*cmp)(const void *, const void *))",
    "<stdlib.h> 排序陣列",
  ),
  fn(
    "bsearch",
    "(const void *key, const void *base, size_t n, size_t size, int (*cmp)(const void *, const void *))",
    "<stdlib.h> 在已排序陣列中二分搜尋",
  ),
  fn("abs", "(int x)", "<stdlib.h> 整數絕對值"),
  fn("llabs", "(long long x)", "<stdlib.h> long long 絕對值"),
  fn("atoi", "(const char *s)", "<stdlib.h> 字串轉 int"),
  fn("atoll", "(const char *s)", "<stdlib.h> 字串轉 long long"),
  fn(
    "strtol",
    "(const char *s, char **end, int base)",
    "<stdlib.h> 字串轉 long",
  ),
  fn(
    "strtoll",
    "(const char *s, char **end, int base)",
    "<stdlib.h> 字串轉 long long",
  ),
  fn("rand", "(void)", "<stdlib.h> 虛擬亂數"),
  fn("srand", "(unsigned seed)", "<stdlib.h> 設定亂數種子"),
  fn("exit", "(int status)", "<stdlib.h> 結束程式"),
  fn("strlen", "(const char *s)", "<string.h> 字串長度"),
  fn("strcmp", "(const char *a, const char *b)", "<string.h> 比較字串"),
  fn(
    "strncmp",
    "(const char *a, const char *b, size_t n)",
    "<string.h> 比較前 n 個字元",
  ),
  fn("strcpy", "(char *dst, const char *src)", "<string.h> 複製字串"),
  fn(
    "strncpy",
    "(char *dst, const char *src, size_t n)",
    "<string.h> 複製最多 n 個字元",
  ),
  fn("strcat", "(char *dst, const char *src)", "<string.h> 串接字串"),
  fn("strchr", "(const char *s, int c)", "<string.h> 尋找字元"),
  fn("strstr", "(const char *s, const char *sub)", "<string.h> 尋找子字串"),
  fn(
    "memset",
    "(void *p, int value, size_t n)",
    "<string.h> 以位元組填滿記憶體",
  ),
  fn(
    "memcpy",
    "(void *dst, const void *src, size_t n)",
    "<string.h> 複製記憶體",
  ),
  fn(
    "memmove",
    "(void *dst, const void *src, size_t n)",
    "<string.h> 複製可重疊的記憶體",
  ),
  fn(
    "memcmp",
    "(const void *a, const void *b, size_t n)",
    "<string.h> 比較記憶體",
  ),
  fn("sqrt", "(double x)", "<math.h> 平方根"),
  fn("pow", "(double x, double y)", "<math.h> x 的 y 次方"),
  fn("fabs", "(double x)", "<math.h> 浮點數絕對值"),
  fn("floor", "(double x)", "<math.h> 向下取整"),
  fn("ceil", "(double x)", "<math.h> 向上取整"),
  fn("round", "(double x)", "<math.h> 四捨五入"),
  fn("log", "(double x)", "<math.h> 自然對數"),
  fn("log2", "(double x)", "<math.h> 以 2 為底的對數"),
  fn("exp", "(double x)", "<math.h> e 的 x 次方"),
  fn("fmax", "(double x, double y)", "<math.h> 較大值"),
  fn("fmin", "(double x, double y)", "<math.h> 較小值"),
  fn("isdigit", "(int c)", "<ctype.h> 是否為數字"),
  fn("isalpha", "(int c)", "<ctype.h> 是否為字母"),
  fn("isalnum", "(int c)", "<ctype.h> 是否為字母或數字"),
  fn("isspace", "(int c)", "<ctype.h> 是否為空白字元"),
  fn("isupper", "(int c)", "<ctype.h> 是否為大寫字母"),
  fn("islower", "(int c)", "<ctype.h> 是否為小寫字母"),
  fn("toupper", "(int c)", "<ctype.h> 轉為大寫"),
  fn("tolower", "(int c)", "<ctype.h> 轉為小寫"),
  constant("INT_MAX", "<limits.h> int 最大值"),
  constant("INT_MIN", "<limits.h> int 最小值"),
  constant("LLONG_MAX", "<limits.h> long long 最大值"),
  constant("LLONG_MIN", "<limits.h> long long 最小值"),
  constant("NULL", "空指標"),
  type("size_t", "<stddef.h> 無號大小型別"),
  type("bool", "<stdbool.h> 布林型別"),
  constant("true", "<stdbool.h>"),
  constant("false", "<stdbool.h>"),
  type("int64_t", "<stdint.h> 64 位元有號整數"),
  type("uint64_t", "<stdint.h> 64 位元無號整數"),
  type("int32_t", "<stdint.h> 32 位元有號整數"),
  type("FILE", "<stdio.h> 檔案串流"),
];

const snippets: Completion[] = [
  snippetCompletion("for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}", {
    label: "for",
    detail: "片段：計數迴圈",
    type: "keyword",
  }),
  snippetCompletion("while (${condition}) {\n\t${}\n}", {
    label: "while",
    detail: "片段：迴圈",
    type: "keyword",
  }),
  snippetCompletion("if (${condition}) {\n\t${}\n}", {
    label: "if",
    detail: "片段：條件",
    type: "keyword",
  }),
  snippetCompletion("if (${condition}) {\n\t${}\n} else {\n\t\n}", {
    label: "ifelse",
    detail: "片段：條件與否則",
    type: "keyword",
  }),
  snippetCompletion("int main(void) {\n\t${}\n\treturn 0;\n}", {
    label: "main",
    detail: "片段：主程式",
    type: "function",
  }),
  snippetCompletion('printf("${}\\n");', {
    label: "printf",
    detail: "片段：輸出一行",
    type: "text",
  }),
  snippetCompletion('scanf("%d", &${x});', {
    label: "scanf",
    detail: "片段：讀取整數",
    type: "text",
  }),
];

const headers = [
  "stdio.h",
  "stdlib.h",
  "string.h",
  "math.h",
  "ctype.h",
  "limits.h",
  "stdbool.h",
  "stdint.h",
  "stddef.h",
  "time.h",
  "assert.h",
].map((label): Completion => ({
  label,
  type: "namespace",
  // The everyday headers come first.
  boost: ["stdio.h", "stdlib.h", "string.h"].includes(label) ? 1 : 0,
}));

const known = new Set(
  [...keywords, ...library, ...snippets].map((c) => c.label),
);

/** Identifiers already written in the document, excluding the word being typed. */
function documentNames(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_]\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const names = new Map<string, Completion["type"]>();
  const { state } = context;
  syntaxTree(state).iterate({
    enter(node) {
      if (!identifierTypes[node.name] || node.from === word.from) return;
      const name = state.sliceDoc(node.from, node.to);
      if (name.length > 1 && !known.has(name))
        names.set(name, identifierTypes[node.name]);
    },
  });
  return {
    from: word.from,
    options: [...names].map(([label, type]) => ({ label, type })),
    validFor: /^\w*$/,
  };
}
const identifierTypes: Record<string, Completion["type"]> = {
  Identifier: "variable",
  FieldIdentifier: "property",
  TypeIdentifier: "type",
};

function includeHeader(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/#\s*include\s*[<"][\w./]*/);
  if (!match) return null;
  return {
    from: match.from + match.text.search(/[<"]/) + 1,
    options: headers,
    validFor: /^[\w./]*$/,
  };
}

const vocabulary = completeFromList([...keywords, ...library, ...snippets]);
const outsideLiterals = [
  "String",
  "CharLiteral",
  "LineComment",
  "BlockComment",
];

/** Completion sources for C: keywords, the standard library, snippets, local names and headers. */
export const cCompletions = [
  includeHeader,
  ifNotIn(outsideLiterals, (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos);
    if (/^\s*#/.test(line.text)) return null;
    return vocabulary(context);
  }),
  ifNotIn(outsideLiterals, documentNames),
];
