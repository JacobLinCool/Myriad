import type { AttemptSummary } from "./journey.js";

/** Compact teacher-only data. Resource measurements are provisional client reports. */
export interface MonitoredSubmission {
  id: string;
  sequence: number;
  participantId: string;
  studentId: string;
  identityKind: "guest" | "nycu";
  problemId: string;
  problemVersion: string | null;
  status: AttemptSummary["status"];
  createdAt: number;
  score: number;
  passed: boolean;
  testsReported: number;
  codeBytes: number;
  instructionCost: number | null;
  memoryBytes: number | null;
  costProfile: string | null;
  costModel: string | null;
}
