import { api } from "../api";
export interface TeacherExam {
  id: string;
  title: string;
  startsAt: number;
  endsAt: number;
  revision: string | null;
}
/** Read-only exam detail; only the settings fields are editable on the site. */
export interface ExamDetail {
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
export interface Analysis {
  totals: { attempts: number; students: number; completed: number };
  devices: {
    deviceId: string;
    studentId: string;
    identityKind: "guest" | "nycu";
    submissions: number;
  }[];
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
      identityKind: "guest" | "nycu";
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
