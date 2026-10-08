import type {
  PublicExam,
  ProblemPublic,
  AttemptSummary,
} from "@myriad/shared";
import { getDeviceId } from "../device";
import { SubmissionRejected } from "../api";
import { createRecorder, type Recorder } from "../telemetry";
/** The compiler runtime is fetched on first use or by an idle warm-up. */
const engine = () => import("../engine");
export type Activity = "prepare" | "run" | "submit" | null;
/** Teacher previews are not student performance data, so they record nothing. */
export function recorder(
  previewing: boolean,
  context: Parameters<typeof createRecorder>[0],
): Promise<Recorder> {
  return previewing ? Promise.resolve(() => {}) : createRecorder(context);
}
export interface ExecutionContext {
  exam: PublicExam | null;
  problem: ProblemPublic | null;
  student: string;
  identityKind: "guest" | "nycu";
  code: string;
  input: string;
  readonly loadVersion: number;
  busy: boolean;
  /** The teacher is previewing this exam; work is judged but not recorded. */
  readonly previewing: boolean;
  activity: Activity;
  error: string;
  /** Run and submission failures, shown in the judge panel beside the work. */
  judgeError: string;
  /** Starts the client-side wait that mirrors the server's submission cooldown. */
  startCooldown(): void;
  /** Refreshes the exam in place, keeping the workspace and drafts. */
  revalidate(): Promise<void>;
  notice: string;
  panel: "run" | "judge" | "history";
  panelOpen: boolean;
  mobile: "statement" | "editor" | "results";
  output: string;
  diagnostics: string;
  showIdentity: boolean;
  pending: boolean;
  progress: string;
  verdicts: { index: number; status: string }[];
  last: AttemptSummary | null;
  save(): boolean;
  pendingKey(): string;
  navigate(url: string): Promise<void>;
  loadHistory(): Promise<void>;
  sameWorkspace(id: string, pid: string, sid: string, version: number): boolean;
}

export async function prepare(session: ExecutionContext): Promise<void> {
  if (!session.exam || session.busy) return;
  const version = session.loadVersion;
  const examId = session.exam.id;
  const student = session.student;
  const visible = () =>
    session.loadVersion === version &&
    session.exam?.id === examId &&
    session.student === student;
  session.busy = true;
  session.activity = "prepare";
  session.error = "";
  try {
    const { getEngine, compileCode, runLocal } = await engine();
    const record = await recorder(session.previewing, {
      examId: session.exam.id,
      studentId: session.student || null,
      identityKind: session.identityKind,
      problemId: null,
      mode: "startup",
    });
    await getEngine(record);
    const b = await compileCode(
      '#include <stdio.h>\nint main(void){puts("Myriad ready");return 0;}',
      record,
    );
    if (!b.success || !b.artifact) throw new Error(b.diagnostics);
    const r = await runLocal(
      b.artifact,
      "",
      {
        instructionBudget: 50000000,
        logicalTimeLimitMs: 2000,
        memoryMb: 128,
        outputLimitBytes: 1048576,
      },
      record,
    );
    if (r.code !== 0 || r.stdout.trim() !== "Myriad ready")
      throw new Error("環境測試未通過");
    if (visible()) session.notice = "準備完成，可以開始作答。";
  } catch (e) {
    if (visible()) session.error = (e as Error).message;
  } finally {
    session.busy = false;
    session.activity = null;
  }
}
export async function run(session: ExecutionContext): Promise<void> {
  if (!session.exam || !session.problem || session.busy) return;
  const snapshot = {
    code: session.code,
    problem: session.problem,
    exam: session.exam,
    student: session.student,
    identityKind: session.identityKind,
    input: session.input,
  };
  const version = session.loadVersion;
  const visible = () =>
    session.sameWorkspace(
      snapshot.exam.id,
      snapshot.problem.id,
      snapshot.student,
      version,
    );
  if (!session.save()) return;
  session.busy = true;
  session.activity = "run";
  session.panel = "run";
  session.panelOpen = true;
  session.mobile = "results";
  session.output = "";
  session.diagnostics = "";
  session.judgeError = "";
  try {
    const { compileCode, runLocal } = await engine();
    const record = await recorder(session.previewing, {
      examId: snapshot.exam.id,
      studentId: snapshot.student || null,
      identityKind: snapshot.identityKind,
      problemId: snapshot.problem.id,
      mode: "local",
    });
    const b = await compileCode(snapshot.code, record);
    if (!b.success || !b.artifact) {
      if (visible()) session.diagnostics = b.diagnostics;
      return;
    }
    const r = await runLocal(
      b.artifact,
      snapshot.input,
      snapshot.problem.limits,
      record,
    );
    if (!visible()) return;
    session.output = `${r.stdout}${r.stderr ? `\n${r.stderr}` : ""}\n\n${r.termination} · ${r.durationMs.toFixed(1)} ms`;
    session.panelOpen = true;
  } catch (e) {
    if (visible()) session.judgeError = (e as Error).message;
  } finally {
    session.busy = false;
    session.activity = null;
  }
}
interface Pending {
  operationId: string;
  /** The problem version this copy was written against. */
  problemVersion: string;
  studentId: string;
  identityKind: "guest" | "nycu";
  deviceId: string;
  code: string;
  problem: ProblemPublic;
  examId: string;
}
export async function submit(
  session: ExecutionContext,
  resume = false,
): Promise<void> {
  if (session.busy) return;
  if (!session.student) {
    session.showIdentity = true;
    return;
  }
  if (!session.exam || !session.problem) return;
  if (!resume && localStorage.getItem(session.pendingKey())) {
    session.panel = "judge";
    session.panelOpen = true;
    session.mobile = "results";
    session.judgeError = "請先查詢並繼續既有提交，避免重複紀錄。";
    return;
  }
  if (!session.save()) return;
  session.busy = true;
  session.activity = "submit";
  session.panel = "judge";
  session.panelOpen = true;
  session.mobile = "results";
  session.diagnostics = "";
  session.judgeError = "";
  // A new attempt replaces the previous result; a resumed one re-sends its verdicts.
  session.last = null;
  session.verdicts = [];
  const currentExam = session.exam,
    currentProblem = session.problem,
    currentStudent = session.student,
    currentKind = session.identityKind,
    currentCode = session.code,
    key = session.pendingKey(),
    preview = session.previewing,
    version = session.loadVersion;
  const visible = () =>
    session.sameWorkspace(
      currentExam.id,
      currentProblem.id,
      currentStudent,
      version,
    );
  try {
    const s: Pending = resume
      ? JSON.parse(localStorage.getItem(key)!)
      : {
          operationId: crypto.randomUUID(),
          problemVersion: currentProblem.version ?? "",
          studentId: currentStudent,
          identityKind: currentKind,
          deviceId: await getDeviceId(),
          code: currentCode,
          problem: currentProblem,
          examId: currentExam.id,
        };
    if (
      s.studentId !== currentStudent ||
      s.identityKind !== currentKind ||
      s.examId !== currentExam.id
    )
      throw new Error("提交快照與目前身分不符");
    if (resume && s.problem.id !== currentProblem.id) {
      await session.navigate(`/exams/${s.examId}/problems/${s.problem.id}`);
      session.busy = false;
      session.activity = null;
      return await submit(session, true);
    }
    // A resumed attempt keeps its version even if the problem was replaced since.
    if (!s.problemVersion)
      throw new Error("題目資料不完整，請重新整理頁面後再提交。");
    const { compileCode, streamJudgeSubmission } = await engine();
    const record = await recorder(preview, {
      examId: s.examId,
      studentId: s.studentId,
      identityKind: s.identityKind,
      problemId: s.problem.id,
      mode: "submission",
      operationId: s.operationId,
    });
    if (visible()) session.progress = "正在編譯…";
    const b = await compileCode(s.code, record);
    if (!b.success || !b.artifact) {
      if (visible()) {
        session.diagnostics = b.diagnostics;
        session.progress = "編譯失敗，尚未提交";
      }
      return;
    }
    localStorage.setItem(key, JSON.stringify(s));
    if (visible()) {
      session.pending = true;
      session.verdicts = [];
      session.startCooldown();
    }
    await streamJudgeSubmission({
      ...s,
      artifact: b.artifact,
      record,
      preview,
      onProgress: (i, n) => {
        if (visible()) session.progress = `執行測試 ${i} / ${n}`;
      },
      onVerdict: (v) => {
        if (!visible()) return;
        session.verdicts = [
          ...session.verdicts.filter((x) => x.index !== v.index),
          v,
        ].sort((a, b) => a.index - b.index);
      },
      onTerminal: () => {
        localStorage.removeItem(key);
        if (visible()) session.pending = false;
      },
      onComplete: (r) => {
        localStorage.removeItem(key);
        if (visible()) {
          session.last = r;
          session.progress = "提交成功 · 已保存";
          session.pending = false;
        }
      },
    });
    await session.loadHistory();
  } catch (e) {
    if (e instanceof SubmissionRejected) {
      localStorage.removeItem(key);
      // A replaced problem is reloaded in place; the draft stays as written.
      if (e.status === 409) await session.revalidate();
      if (visible()) {
        session.pending = false;
        session.judgeError = e.message;
        session.progress = "尚未提交";
      }
    } else if (visible()) {
      session.judgeError = (e as Error).message;
      session.progress = "提交未確認完成；可查詢並繼續既有提交";
    }
  } finally {
    session.busy = false;
    session.activity = null;
  }
}
