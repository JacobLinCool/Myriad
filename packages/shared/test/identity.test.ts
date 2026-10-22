import { expect, it } from "vitest";
import { AttemptRequestSchema } from "../src/journey.js";
import { TelemetryEventSchema } from "../src/telemetry.js";

const operationId = "0331a1dc-28ac-48b1-ac21-c76ca356a21d";
const attempt = {
  operationId,
  problemVersion: "a".repeat(64),
  problemId: "p",
  deviceId: operationId,
  code: "int main(){}",
};
const telemetry = {
  id: operationId,
  sessionId: operationId,
  operationId,
  deviceId: operationId,
  examId: "exam",
  problemId: "p",
  mode: "local",
  kind: "compile",
  outcome: "ok",
  startedAt: 1,
  durationMs: 0,
};

it.each([
  ["submission", AttemptRequestSchema, attempt],
  ["telemetry", TelemetryEventSchema, telemetry],
] as const)(
  "supports full Google subjects in %s without widening guest or NYCU identities",
  (_, schema, base) => {
    const subject = "Ab" + "1".repeat(253);
    expect(
      schema.parse({ ...base, identityKind: "google", studentId: subject })
        .studentId,
    ).toBe(subject);
    expect(
      schema.safeParse({
        ...base,
        identityKind: "google",
        studentId: subject + "1",
      }).success,
    ).toBe(false);
    for (const identityKind of ["guest", "nycu"]) {
      expect(
        schema.safeParse({ ...base, identityKind, studentId: "1".repeat(64) })
          .success,
      ).toBe(true);
      expect(
        schema.safeParse({ ...base, identityKind, studentId: "1".repeat(65) })
          .success,
      ).toBe(false);
    }
    expect(
      schema.safeParse({ ...base, identityKind: "unknown", studentId: "same" })
        .success,
    ).toBe(false);
  },
);

it("allows anonymous startup telemetry but requires an identity for submissions", () => {
  expect(
    TelemetryEventSchema.safeParse({
      ...telemetry,
      identityKind: "guest",
      studentId: null,
    }).success,
  ).toBe(true);
  expect(
    AttemptRequestSchema.safeParse({
      ...attempt,
      identityKind: "guest",
      studentId: null,
    }).success,
  ).toBe(false);
});
