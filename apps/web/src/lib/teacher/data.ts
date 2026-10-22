import type { AuthProvider, IdentityKind } from "@myriad/shared";
import { api } from "../api";
export interface ManagementAccess {
  account: {
    id: string;
    /** Pseudonymous ID for analytics. */
    analyticsId: string;
    provider: string;
    subject: string;
    name: string;
  } | null;
  canCreateExams: boolean;
  isAdmin: boolean;
  providers: AuthProvider[];
}
export interface TeacherExam {
  ownerId: string;
  id: string;
  title: string;
  startsAt: number;
  endsAt: number;
  revision: string | null;
}
/** Read-only exam detail; only the settings fields are editable on the site. */
export interface ExamDetail {
  ownerId: string;
  canManageMembers: boolean;
  id: string;
  title: string;
  startsAt: number;
  endsAt: number;
  rules: string;
  policy: "best" | "last";
  status: "upcoming" | "active" | "ended";
  revision: string | null;
  publishedAt: number | null;
  problems: {
    id: string;
    order: number;
    title: string;
    testCount: number;
    groups: number;
    version: string | null;
  }[];
}
export type ExamSettings = Pick<
  ExamDetail,
  "title" | "startsAt" | "endsAt" | "rules" | "policy"
>;
/** Counts for the overview tab; passed participants use each attempt's stored result. */
export interface Overview {
  updatedAt: number;
  totals: {
    attempts: number;
    students: number;
    completed: number;
    running: number;
  };
  problems: {
    problemId: string;
    problemVersion: string | null;
    submissions: number;
    participants: number;
    passedParticipants: number;
    running: number;
    stopped: number;
  }[];
}
export interface StudentCell {
  attempts: number;
  latest: Pick<
    import("@myriad/shared").MonitoredSubmission,
    "id" | "status" | "score" | "passed" | "testsReported"
  >;
  /** The attempt the exam's policy counts, once one is complete. */
  selected: { score: number; passed: boolean } | null;
}
/** One page of the student × problem matrix, current problem versions only. */
export interface StudentPage {
  updatedAt: number;
  total: number;
  offset: number;
  pageSize: number;
  students: {
    participantId: string;
    studentId: string;
    identityKind: IdentityKind;
    cells: Record<string, StudentCell>;
  }[];
}
export interface ProblemSubmissions {
  updatedAt: number;
  version: string | null;
  currentVersion: string | null;
  versions: { version: string | null; submissions: number }[];
  submissions: import("@myriad/shared").MonitoredSubmission[];
}
export interface DeviceLink {
  deviceId: string;
  studentId: string;
  identityKind: IdentityKind;
  submissions: number;
  firstSeenAt: number;
  lastSeenAt: number;
  /** Comma-separated client IPs observed by the server. */
  ips: string | null;
  /** Distinct User-Agent strings; `userAgent` is one sample, not necessarily the latest. */
  userAgents: number;
  userAgent: string | null;
}
export interface DeviceLinks {
  updatedAt: number;
  devices: DeviceLink[];
  /** Identities that submitted from more than one device, one row per device. */
  identities: DeviceLink[];
}
export interface Performance {
  updatedAt: number;
  timings: {
    kind: string;
    samples: number;
    averageMs: number;
    maxMs: number;
    errors: number;
  }[];
}
export interface Reports {
  reports: {
    revision: string;
    uploadedAt: number;
    scores: {
      studentId: string;
      identityKind: IdentityKind;
      totalScore: number;
    }[];
    report: { submissions: { classification: string }[] };
  }[];
}
export type ExportKind = "telemetry" | "submissions";
export async function collectExport(
  examId: string,
  kind: ExportKind,
  signal: AbortSignal,
  request: typeof api = api,
) {
  const items: unknown[] = [];
  let after = 0;
  for (;;) {
    const page = await request<{
      events?: unknown[];
      submissions?: unknown[];
      nextCursor: number;
      hasMore: boolean;
    }>(
      `/api/teacher/exams/${encodeURIComponent(examId)}/${kind}?after=${after}`,
      "GET",
      undefined,
      { signal },
    );
    const rows = kind === "telemetry" ? page.events : page.submissions;
    if (!Array.isArray(rows)) throw new Error("匯出資料格式錯誤");
    items.push(...rows);
    if (!page.hasMore) return { filename: `${examId}-${kind}.json`, items };
    if (!Number.isSafeInteger(page.nextCursor) || page.nextCursor <= after)
      throw new Error("匯出游標未前進，請重試");
    after = page.nextCursor;
  }
}
export function downloadJSON(filename: string, items: unknown[]) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(items, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
