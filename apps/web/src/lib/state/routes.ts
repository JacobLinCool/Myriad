export function parseRoute(path: string) {
  const parts = path.split("/").filter(Boolean);
  const valid =
    (parts[0] === "teacher" && parseTeacherRoute(parts) !== null) ||
    (parts[0] === "exams" &&
      (parts.length <= 2 ||
        (parts[2] === "submissions" && parts.length === 3) ||
        (parts[2] === "problems" && parts.length === 4)));
  return {
    parts,
    valid,
    examId: parts[0] === "exams" ? parts[1] : undefined,
    section: parts[2] ?? "overview",
    problemId: parts[2] === "problems" ? parts[3] : undefined,
  };
}
export const teacherTabs = [
  "overview",
  "students",
  "submissions",
  "devices",
  "results",
  "settings",
] as const;
export type TeacherTab = (typeof teacherTabs)[number];
export type TeacherRoute =
  | { view: "exams" }
  | { view: "account" }
  | { view: "exam"; examId: string; tab: TeacherTab };
/** `/teacher`, `/teacher/account`, `/teacher/exams/<id>` and `/teacher/exams/<id>/<tab>`. */
export function parseTeacherRoute(parts: string[]): TeacherRoute | null {
  if (parts[0] !== "teacher") return null;
  if (parts.length === 1) return { view: "exams" };
  if (parts.length === 2 && parts[1] === "account") return { view: "account" };
  if (parts[1] !== "exams" || !parts[2] || parts.length > 4) return null;
  const tab = (parts[3] ?? "overview") as TeacherTab;
  if (!teacherTabs.includes(tab) || parts[3] === "overview") return null;
  return { view: "exam", examId: decodeURIComponent(parts[2]), tab };
}
export function teacherPath(examId: string, tab: TeacherTab = "overview") {
  return `/teacher/exams/${encodeURIComponent(examId)}${tab === "overview" ? "" : `/${tab}`}`;
}
