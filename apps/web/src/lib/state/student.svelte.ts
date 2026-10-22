import { onMount, onDestroy } from "svelte";
import {
  identityLabel,
  type AuthProvider,
  type IdentityKind,
  type PublicExam,
  type AttemptSummary,
} from "@myriad/shared";
import { loginFailure, loginUrl } from "../auth";
import { api } from "../api";
import {
  identify,
  reportError,
  resetIdentity,
  setContext,
  track,
} from "../posthog";
import { onEngineStatus, type EngineStatus } from "../engine-status";
import { prepare, recorder, run, submit, type Activity } from "./execution";
import { observeResources } from "../telemetry";
import { LatestRequest, errorMessage } from "./requests";
import { parseRoute } from "./routes";
import { Drafts, codeTemplate, pendingKey, readSplitSize } from "./drafts";
import { canPrefetch, viewTransition, whenIdle } from "../motion";

interface Fetched {
  exam: PublicExam;
  receivedAt: number;
}
/** Prefetched exam responses are reused only briefly and only once. */
const PREFETCH_TTL = 10000;
/** A route the visitor cannot open now; shown, but not an error. */
class Unavailable extends Error {}
/** The exam a teacher asked to preview in this tab. */
const PREVIEW_KEY = "myriad_preview";
function storedPreview() {
  try {
    return sessionStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
}

export class StudentSession {
  path = $state(location.pathname);
  exams = $state<PublicExam[]>([]);
  examsLoaded = $state(false);
  exam = $state<PublicExam | null>(null);
  error = $state("");
  /** Nothing is available to show for the route yet. */
  loading = $state(false);
  /** Any route request is in flight, including revalidation of visible data. */
  refreshing = $state(false);
  student = $state(localStorage.getItem("myriad_student_id") ?? "");
  identityKind = $state<IdentityKind>("guest");
  providers = $state<AuthProvider[]>([]);
  displayName = $state("");
  studentLabel = $derived(this.displayName || this.student);
  authBusy = $state(false);
  authReady = $state(false);
  identityLabel = $derived(identityLabel(this.identityKind));
  participantId = $derived(`${this.identityKind}:${this.student}`);
  studentInput = $state(this.student);
  showIdentity = $state(false);
  code = $state(codeTemplate);
  busy = $state(false);
  activity = $state<Activity>(null);
  judgeError = $state("");
  /** Server-adjusted time when the next submission is accepted. */
  cooldownUntil = $state(0);
  historyBusy = $state(false);
  engine = $state<EngineStatus>({ state: "uninitialized" });
  input = $state("");
  output = $state("");
  diagnostics = $state("");
  progress = $state("");
  verdicts = $state<{ index: number; status: string }[]>([]);
  last = $state<AttemptSummary | null>(null);
  history = $state<AttemptSummary[]>([]);
  panel = $state<"run" | "judge" | "history">("run");
  mobile = $state<"statement" | "editor" | "results">("editor");
  listOpen = $state(false);
  panelOpen = $state(false);
  collapsed = $state(false);
  statementSize = $state(readSplitSize(localStorage));
  now = $state(Date.now());
  pending = $state(false);
  notice = $state("");
  draftStatus = $state<"saved" | "error" | "anonymous">("anonymous");
  /** The exam this tab asked to open in teacher preview, granted or not. */
  previewExam = $state<string | null>(storedPreview());
  private route = $derived(parseRoute(this.path));
  get parts() {
    return this.route.parts;
  }
  get eid() {
    return this.route.examId;
  }
  get section() {
    return this.route.section;
  }
  problem = $derived(
    this.exam?.problems.find((p) => p.id === this.route.problemId) ?? null,
  );
  workspace = $derived(this.section === "problems" && !!this.problem);
  /** The server granted teacher preview for the loaded exam. */
  previewing = $derived(!!this.exam?.preview);
  previewRequested = $derived(
    !!this.route.examId && this.previewExam === this.route.examId,
  );
  /** Students may work: the exam started, or its teacher is previewing it. */
  started = $derived(
    !!this.exam && (this.previewing || this.now >= this.exam.startsAt),
  );
  /** Catalog data for the requested exam, shown while its full record loads. */
  listed = $derived(
    this.exams.find((exam) => exam.id === this.route.examId) ?? null,
  );
  remaining = $derived(
    this.exam
      ? Math.max(
          0,
          (this.now < this.exam.startsAt
            ? this.exam.startsAt
            : this.exam.endsAt) - this.now,
        )
      : 0,
  );
  canSubmit = $derived(
    this.authReady &&
      !!this.exam &&
      this.started &&
      this.now < this.exam.endsAt &&
      this.now >= this.cooldownUntil &&
      !this.busy &&
      !this.pending,
  );
  private offset = 0;
  private version = 0;
  private disposed = false;
  private drafts = new Drafts(localStorage);
  private navigation = new LatestRequest();
  private summaries = new LatestRequest();
  private revalidation = new LatestRequest();
  private sync?: ReturnType<typeof setInterval>;
  private authentication = new LatestRequest();
  private cleanup?: () => void;
  private warmup?: () => void;
  private prefetched = new Map<
    string,
    { at: number; promise: Promise<Fetched>; value?: Fetched }
  >();
  private clock?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  constructor(private request: typeof api = api) {}
  get loadVersion() {
    return this.version;
  }
  save = () => {
    try {
      this.drafts.save(this.code);
      this.draftStatus = this.student ? "saved" : "anonymous";
      return true;
    } catch (e) {
      this.draftStatus = "error";
      this.error = `草稿儲存失敗：${errorMessage(e)}`;
      reportError(e, { action: "save_draft" });
      return false;
    }
  };
  /** Whole seconds until the submission cooldown ends. */
  cooldown = $derived(
    Math.max(0, Math.ceil((this.cooldownUntil - this.now) / 1000)),
  );
  startCooldown = () => {
    this.now = Date.now() + this.offset;
    this.cooldownUntil = this.now + 5000;
  };
  pendingKey = () =>
    pendingKey(
      this.previewing ? `preview:${this.participantId}` : this.participantId,
      this.eid,
    );
  /** Adds the preview marker to exam-scoped requests for a requested preview. */
  private scoped(url: string, examId: string | undefined) {
    if (!examId || this.previewExam !== examId) return url;
    return `${url}${url.includes("?") ? "&" : "?"}preview=1`;
  }
  exitPreview = () => {
    try {
      sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      // Storage may be unavailable; the in-memory state still ends the preview.
    }
    this.previewExam = null;
    track("preview_exited");
    void this.load();
  };
  private loadDraft() {
    this.code = this.drafts.open(
      this.student ? this.participantId : "",
      this.exam?.id,
      this.problem?.id,
      this.problem?.template,
    );
    this.draftStatus = this.student ? "saved" : "anonymous";
    this.pending = !!localStorage.getItem(this.pendingKey());
  }
  navigate = async (url: string) => {
    if (!this.save()) return;
    await viewTransition(() => {
      window.history.pushState({}, "", url);
      this.path = location.pathname;
      this.listOpen = false;
      this.panelOpen = false;
      return this.load();
    });
  };
  private fetchExam(id: string, init?: Pick<RequestInit, "signal">) {
    return this.request<PublicExam>(
      this.scoped(`/api/exams/${encodeURIComponent(id)}`, id),
      "GET",
      undefined,
      init,
    ).then((exam) => ({ exam, receivedAt: Date.now() }));
  }
  /** Starts fetching an exam the visitor is likely to open next. */
  prefetchExam = (id: string) => {
    const existing = this.prefetched.get(id);
    if (
      !canPrefetch() ||
      this.exam?.id === id ||
      (existing && Date.now() - existing.at < PREFETCH_TTL)
    )
      return;
    const entry: { at: number; promise: Promise<Fetched>; value?: Fetched } = {
      at: Date.now(),
      promise: this.fetchExam(id),
    };
    entry.promise.then(
      (value) => (entry.value = value),
      () => this.prefetched.get(id) === entry && this.prefetched.delete(id),
    );
    this.prefetched.set(id, entry);
  };
  private takePrefetched(id: string) {
    const entry = this.prefetched.get(id);
    this.prefetched.delete(id);
    return entry && Date.now() - entry.at < PREFETCH_TTL ? entry : undefined;
  }
  /** Downloads and starts the compiler in idle time so the first run is immediate. */
  private warmEngine() {
    if (this.warmup || !canPrefetch()) return;
    this.warmup = whenIdle(() => {
      const exam = this.exam;
      if (this.disposed || !exam || this.engine.state !== "uninitialized")
        return;
      void (async () => {
        const [{ getEngine }, record] = await Promise.all([
          import("../engine"),
          recorder(this.previewing, {
            examId: exam.id,
            studentId: this.student || null,
            identityKind: this.identityKind,
            problemId: null,
            mode: "startup",
          }),
        ]);
        await getEngine(record);
      })().catch(() => {
        // The status listener reports the failure; the next run retries.
      });
    }, 4000);
  }
  load = async () => {
    if (!this.save()) return;
    const operation = this.navigation.begin();
    ++this.version;
    this.summaries.cancel();
    const route = this.route;
    // Moving within an exam keeps the shell; only a different exam is cleared.
    const keep = !!route.examId && this.exam?.id === route.examId;
    this.loading = !keep && !(!route.examId && this.examsLoaded);
    this.refreshing = true;
    this.error = "";
    this.output = "";
    this.diagnostics = "";
    this.judgeError = "";
    this.progress = "";
    this.notice = "";
    this.verdicts = [];
    this.last = null;
    this.cleanup?.();
    this.cleanup = undefined;
    if (keep) this.loadDraft();
    else {
      this.exam = null;
      this.history = [];
    }
    setContext({
      app_area: route.parts[0] === "teacher" ? "teacher" : "student",
      exam_id: keep ? this.exam?.id : null,
      is_preview: keep && this.previewing,
    });
    try {
      if (!route.valid) throw new Unavailable("找不到這個頁面");
      if (route.parts[0] === "teacher") return;
      if (!route.examId) {
        const rows = await this.request<PublicExam[]>(
          "/api/exams",
          "GET",
          undefined,
          operation,
        );
        if (operation.current()) {
          this.exams = rows;
          this.examsLoaded = true;
        }
        return;
      }
      const prefetched = this.takePrefetched(route.examId);
      // A settled prefetch applies synchronously, inside the view transition.
      let fetched = prefetched?.value;
      if (!fetched && prefetched)
        fetched = await prefetched.promise.catch(() => undefined);
      fetched ??= await this.fetchExam(route.examId, operation);
      if (!operation.current()) return;
      const loaded = fetched.exam;
      this.offset = loaded.serverTime - fetched.receivedAt;
      this.now = Date.now() + this.offset;
      if (
        this.now < loaded.endsAt &&
        route.section === "problems" &&
        !loaded.problems.some((p) => p.id === route.problemId)
      )
        throw new Unavailable(
          this.now < loaded.startsAt
            ? "考試尚未開始，題目將於開始時開放。"
            : "題目不存在或目前不開放閱讀。",
        );
      this.exam = loaded;
      setContext({
        app_area: "student",
        exam_id: loaded.id,
        is_preview: !!loaded.preview,
      });
      if (!keep)
        track("exam_opened", {
          exam_status: loaded.status,
          problem_count: loaded.problems.length,
          identity_kind: this.identityKind,
        });
      // The exam renders now; submission history streams in behind it.
      this.loading = false;
      if (this.now >= loaded.endsAt) return;
      this.loadDraft();
      this.warmEngine();
      await this.loadHistory();
      if (!operation.current()) return;
      const record = await recorder(this.previewing, {
        examId: loaded.id,
        studentId: this.student || null,
        identityKind: this.identityKind,
        problemId: null,
        mode: "startup",
      });
      if (operation.current()) this.cleanup = observeResources(record);
    } catch (e) {
      if (operation.current()) {
        this.exam = null;
        this.history = [];
        this.error = errorMessage(e);
        if (e instanceof Unavailable)
          track("route_unavailable", { section: route.section });
        else reportError(e, { action: "load_route" });
      }
    } finally {
      if (operation.current()) this.loading = this.refreshing = false;
    }
  };
  /**
   * Refreshes the open exam in place: extended times, edited rules and replaced
   * problems appear without reloading the workspace, outputs or drafts.
   */
  revalidate = async () => {
    const exam = this.exam,
      version = this.version;
    if (!exam || this.refreshing || this.now >= exam.endsAt) return;
    const operation = this.revalidation.begin();
    try {
      const fetched = await this.fetchExam(exam.id, operation);
      if (
        !operation.current() ||
        version !== this.version ||
        this.exam?.id !== exam.id
      )
        return;
      this.offset = fetched.exam.serverTime - fetched.receivedAt;
      this.now = Date.now() + this.offset;
      this.exam = fetched.exam;
    } catch {
      // A failed background refresh keeps what is shown; the next one retries.
    }
  };
  private visible = () => {
    if (document.visibilityState === "visible") void this.revalidate();
  };
  loadHistory = async () => {
    const operation = this.summaries.begin(),
      exam = this.exam,
      student = this.student,
      identityKind = this.identityKind,
      version = this.version;
    if (!student || !exam || !this.started || this.now >= exam.endsAt) {
      this.history = [];
      return;
    }
    const visible = () =>
      operation.current() &&
      version === this.version &&
      this.student === student &&
      this.identityKind === identityKind &&
      this.exam?.id === exam.id;
    this.historyBusy = true;
    try {
      const all: AttemptSummary[] = [];
      let after = 0;
      for (;;) {
        const page = await this.request<{
          submissions: AttemptSummary[];
          nextCursor: number;
          hasMore: boolean;
        }>(
          this.scoped(
            `/api/exams/${exam.id}/submissions?student=${encodeURIComponent(student)}&identityKind=${identityKind}&after=${after}`,
            exam.id,
          ),
          "GET",
          undefined,
          operation,
        );
        if (!visible()) return;
        all.push(...page.submissions);
        if (!page.hasMore) break;
        if (!Number.isSafeInteger(page.nextCursor) || page.nextCursor <= after)
          throw new Error("提交紀錄游標未前進，請重試");
        after = page.nextCursor;
      }
      if (visible()) this.history = all.reverse();
    } catch (e) {
      if (visible()) {
        this.error = errorMessage(e);
        reportError(e, { action: "load_history" });
      }
    } finally {
      if (operation.current()) this.historyBusy = false;
    }
  };
  sameWorkspace = (id: string, pid: string, sid: string, version: number) =>
    !this.disposed &&
    version === this.version &&
    this.exam?.id === id &&
    this.problem?.id === pid &&
    this.student === sid;
  login = (provider: AuthProvider) => {
    if (
      this.busy ||
      this.authBusy ||
      !this.providers.includes(provider) ||
      !this.save()
    )
      return;
    track("login_started", { provider });
    location.assign(
      loginUrl(provider, this.path.startsWith("/exams") ? this.path : "/exams"),
    );
  };
  openIdentity = () => {
    if (this.identityKind === "guest") this.studentInput = this.student;
    this.showIdentity = true;
  };
  refreshIdentity = async () => {
    const operation = this.authentication.begin();
    try {
      const result = await this.request<{
        providers: AuthProvider[];
        account: {
          analyticsId: string;
          label: string;
          displayName: string;
          kind: AuthProvider;
        } | null;
      }>("/api/auth/session", "GET", undefined, operation);
      if (!operation.current()) return;
      this.providers = result.providers;
      if (result.account) {
        this.student = result.account.label;
        this.identityKind = result.account.kind;
        this.displayName = result.account.displayName;
        identify(result.account.analyticsId, {
          provider: result.account.kind,
          is_student: true,
        });
      } else {
        this.identityKind = "guest";
        this.displayName = "";
        this.student = localStorage.getItem("myriad_student_id") ?? "";
      }
      this.authReady = true;
    } catch (e) {
      if (operation.current()) {
        this.error = errorMessage(e);
        reportError(e, { action: "refresh_identity" });
      }
    }
  };
  useGuest = async () => {
    if (
      this.authBusy ||
      this.busy ||
      !this.studentInput.trim() ||
      this.studentInput.trim().length > 64 ||
      !this.save()
    )
      return;
    const operation = this.authentication.begin();
    this.authBusy = true;
    try {
      await this.request("/api/auth/session", "DELETE", undefined, operation);
      if (operation.current()) {
        // A guest is unverified, so the device starts a new anonymous person.
        resetIdentity();
        track("guest_selected");
        this.authReady = true;
        this.identityKind = "guest";
        this.identity();
      }
    } catch (e) {
      this.error = errorMessage(e);
      reportError(e, { action: "use_guest" });
    } finally {
      this.authBusy = false;
    }
  };
  identity = () => {
    if (!this.save()) return;
    const student = this.studentInput.trim();
    if (!student || student.length > 64) return;
    try {
      localStorage.setItem("myriad_student_id", student);
    } catch (e) {
      this.error = errorMessage(e);
      return;
    }
    ++this.version;
    this.identityKind = "guest";
    this.displayName = "";
    this.student = student;
    this.loadDraft();
    this.showIdentity = false;
    this.last = null;
    this.verdicts = [];
    this.output = "";
    this.diagnostics = "";
    this.judgeError = "";
    this.progress = "";
    this.input = "";
    this.notice = "";
    void this.loadHistory();
  };
  prepare = () => prepare(this);
  run = () => run(this);
  submit = (resume = false) => submit(this, resume);
  private pop = () => {
    this.save();
    void viewTransition(() => {
      this.path = location.pathname;
      this.listOpen = false;
      this.panelOpen = false;
      void this.load();
    });
  };
  mount = () => {
    this.unsubscribe = onEngineStatus((s) => (this.engine = s));
    window.addEventListener("popstate", this.pop);
    document.addEventListener("visibilitychange", this.visible);
    this.sync = setInterval(() => void this.revalidate(), 60000);
    if (this.path === "/") {
      window.history.replaceState({}, "", "/exams");
      this.path = "/exams";
    }
    // The teacher workspace opens `/exams/<id>?preview=1`; the tab remembers it.
    const query = new URLSearchParams(location.search);
    if (query.get("preview") === "1" && this.eid) {
      try {
        sessionStorage.setItem(PREVIEW_KEY, this.eid);
      } catch {
        // Without storage the preview still lasts for this page.
      }
      this.previewExam = this.eid;
      track("preview_started", { exam_id: this.eid });
      query.delete("preview");
      const rest = query.toString();
      window.history.replaceState(
        {},
        "",
        `${this.path}${rest ? `?${rest}` : ""}`,
      );
    }
    void this.refreshIdentity().then(async () => {
      if (this.disposed) return;
      const identityError = this.error;
      await this.load();
      if (this.disposed) return;
      if (identityError) this.error = identityError;
      const failure =
        this.parts[0] === "teacher"
          ? null
          : loginFailure(new URLSearchParams(location.search));
      if (failure) {
        track("login_failed", {
          provider: failure.provider,
          reason: failure.reason,
        });
        this.showIdentity = true;
        this.error = `${failure.message}或使用訪客作答。`;
        window.history.replaceState({}, "", this.path);
      }
    });
    this.clock = setInterval(() => {
      const before = this.now;
      this.now = Date.now() + this.offset;
      const exam = this.exam;
      if (
        exam &&
        ((before < exam.startsAt && this.now >= exam.startsAt) ||
          (before < exam.endsAt && this.now >= exam.endsAt))
      ) {
        this.prefetched.clear();
        this.save();
        void this.load();
      }
    }, 1000);
  };
  destroy = () => {
    this.save();
    this.disposed = true;
    ++this.version;
    this.authentication.cancel();
    this.navigation.cancel();
    this.summaries.cancel();
    this.cleanup?.();
    this.warmup?.();
    this.prefetched.clear();
    this.unsubscribe?.();
    if (this.clock) clearInterval(this.clock);
    window.removeEventListener("popstate", this.pop);
    document.removeEventListener("visibilitychange", this.visible);
    if (this.sync) clearInterval(this.sync);
    this.revalidation.cancel();
  };
}
export function createStudentSession() {
  const session = new StudentSession();
  onMount(session.mount);
  onDestroy(session.destroy);
  return session;
}
