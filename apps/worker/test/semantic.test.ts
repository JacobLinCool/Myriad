import { expect, it, vi } from "vitest";
import { evaluateSemantic, DEFAULT_SEMANTIC_MODEL } from "../src/semantic";
function response(verdict: unknown) {
  return Response.json({
    status: "completed",
    model: DEFAULT_SEMANTIC_MODEL,
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(verdict) }],
      },
    ],
  });
}
it("uses Luna low, structured output, private storage and exactly 20000 Unicode characters", async () => {
  const request = vi.fn(async () =>
    response({ passed: false, reason: "未使用指標實作。" }),
  );
  const code = "😀".repeat(20000) + "TAIL";
  const result = await evaluateSemantic(
    "secret",
    DEFAULT_SEMANTIC_MODEL,
    "必須使用指標",
    code,
    request,
  );
  const [url, options] = request.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  const body = JSON.parse(options.body as string),
    input = JSON.parse(body.input);
  expect(url).toBe("https://api.openai.com/v1/responses");
  expect(body).toMatchObject({
    model: "gpt-5.6-luna",
    reasoning: { effort: "low" },
    store: false,
    text: { format: { type: "json_schema", strict: true } },
  });
  expect([...input.source]).toHaveLength(20000);
  expect(input.source.endsWith("TAIL")).toBe(false);
  expect(result).toMatchObject({
    passed: false,
    reason: "未使用指標實作。",
    truncated: true,
    reviewedCharacters: 20000,
  });
});
it("does not interpret service errors, refusal or malformed output as a student failure", async () => {
  for (const payload of [
    Response.json({}, { status: 429 }),
    Response.json({ status: "incomplete" }),
    Response.json({
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal" }] }],
    }),
    response({ passed: false, reason: "" }),
    response({ passed: "true", reason: "" }),
  ])
    await expect(
      evaluateSemantic(
        "secret",
        DEFAULT_SEMANTIC_MODEL,
        "要求",
        "code",
        async () => payload,
      ),
    ).rejects.toThrow();
});
it("stores successful checks with no failure explanation", async () => {
  const result = await evaluateSemantic(
    "secret",
    DEFAULT_SEMANTIC_MODEL,
    "要求",
    "code",
    async () => response({ passed: true, reason: "符合" }),
  );
  expect(result).toMatchObject({
    passed: true,
    reason: "",
    truncated: false,
    reviewedCharacters: 4,
  });
});
