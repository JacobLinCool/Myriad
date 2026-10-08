export function parseRoute(path: string) {
  const parts = path.split("/").filter(Boolean);
  const valid =
    (parts[0] === "teacher" && parts.length === 1) ||
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
