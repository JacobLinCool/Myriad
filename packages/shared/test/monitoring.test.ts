import { expect, it } from "vitest";
import { TestClaimSchema } from "../src/schema.js";
it("preserves zero and unavailable measurements, rejects invalid metrics", () => {
  const claim = {
    index: 0,
    status: "re",
    metrics: {
      instructionCost: 0,
      memoryBytes: null,
      costProfile: "profile",
      costModel: "model",
    },
  };
  expect(TestClaimSchema.parse(claim)).toEqual(claim);
  for (const value of [-1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expect(
      TestClaimSchema.safeParse({
        ...claim,
        metrics: { ...claim.metrics, instructionCost: value },
      }).success,
    ).toBe(false);
  }
});

import { cCostProfile } from "./fixtures/cost-profile.js";
it("accepts the full runtime cost profile without truncation and bounds oversized input", () => {
  const claim = {
    index: 0,
    status: "re",
    metrics: {
      instructionCost: 0,
      memoryBytes: 65536,
      costProfile: cCostProfile,
      costModel: "weighted",
    },
  };
  expect(cCostProfile.length).toBeGreaterThan(256);
  expect(TestClaimSchema.parse(claim)).toEqual(claim);
  expect(
    TestClaimSchema.safeParse({
      ...claim,
      metrics: { ...claim.metrics, costProfile: "x".repeat(1025) },
    }).success,
  ).toBe(false);
});
