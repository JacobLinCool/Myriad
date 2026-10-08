import { api, ApiError } from "../api";
import { LatestRequest, errorMessage } from "./requests";
import {
  collectExport,
  downloadJSON,
  type TeacherExam,
  type Analysis,
  type Reports,
  type ExamDetail,
  type ExamSettings,
  type ExportKind,
} from "../teacher/data";
export function createTeacherSession(
  request: typeof api = api,
  download = downloadJSON,
) {
  let credential = $state(""),
    loggedIn = $state(false),
    checked = $state(false),
    error = $state("");
  let exams = $state<TeacherExam[]>([]),
    selected = $state("");
  let analysis = $state<Analysis | null>(null),
    reports = $state<Reports | null>(null),
    detail = $state<ExamDetail | null>(null),
    saving = $state(false);
  let authenticating = $state(false),
    loading = $state(false),
    exporting = $state(false);
  const authentication = new LatestRequest(),
    selection = new LatestRequest(),
    exports = new LatestRequest();
  async function load() {
    const operation = authentication.begin();
    authenticating = true;
    error = "";
    try {
      const rows = await request<TeacherExam[]>(
        "/api/teacher/exams",
        "GET",
        undefined,
        operation,
      );
      if (operation.current()) {
        exams = rows;
        loggedIn = true;
      }
    } catch (e) {
      if (operation.current()) {
        if (e instanceof ApiError && e.status === 401) loggedIn = false;
        else error = errorMessage(e);
      }
    } finally {
      if (operation.current()) {
        authenticating = false;
        checked = true;
      }
    }
  }
  async function login() {
    if (authenticating) return;
    const operation = authentication.begin(),
      token = credential;
    authenticating = true;
    error = "";
    try {
      await request("/api/teacher/session", "POST", undefined, {
        signal: operation.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!operation.current()) return;
      credential = "";
      const rows = await request<TeacherExam[]>(
        "/api/teacher/exams",
        "GET",
        undefined,
        operation,
      );
      if (operation.current()) {
        exams = rows;
        loggedIn = true;
      }
    } catch (e) {
      if (operation.current()) error = errorMessage(e);
    } finally {
      if (operation.current()) {
        authenticating = false;
        checked = true;
      }
    }
  }
  async function select(id: string) {
    const operation = selection.begin();
    // Refreshing the shown exam keeps its data visible until the new data arrives.
    if (id !== selected) {
      analysis = null;
      reports = null;
      detail = null;
    }
    selected = id;
    loading = true;
    error = "";
    try {
      const path = `/api/teacher/exams/${encodeURIComponent(id)}`;
      const [a, r, d] = await Promise.all([
        request<Analysis>(`${path}/analysis`, "GET", undefined, operation),
        request<Reports>(`${path}/results`, "GET", undefined, operation),
        request<ExamDetail>(path, "GET", undefined, operation),
      ]);
      if (operation.current()) {
        analysis = a;
        reports = r;
        detail = d;
      }
    } catch (e) {
      if (operation.current()) error = errorMessage(e);
    } finally {
      if (operation.current()) loading = false;
    }
  }
  /** Saves exam settings; they apply to students immediately. */
  async function saveSettings(settings: Partial<ExamSettings>) {
    const examId = selected;
    if (!examId || saving) return false;
    saving = true;
    error = "";
    try {
      const saved = await request<ExamSettings>(
        `/api/teacher/exams/${encodeURIComponent(examId)}`,
        "PATCH",
        settings,
      );
      if (selected !== examId) return false;
      if (detail) detail = { ...detail, ...saved };
      exams = exams.map((e) =>
        e.id === examId
          ? {
              ...e,
              title: saved.title,
              startsAt: saved.startsAt,
              endsAt: saved.endsAt,
            }
          : e,
      );
      return true;
    } catch (e) {
      if (selected === examId) error = errorMessage(e);
      return false;
    } finally {
      saving = false;
    }
  }
  async function logout() {
    selection.cancel();
    exports.cancel();
    loading = false;
    exporting = false;
    const operation = authentication.begin();
    authenticating = true;
    error = "";
    try {
      await request("/api/teacher/session", "DELETE", undefined, operation);
      if (operation.current()) {
        loggedIn = false;
        selected = "";
        analysis = null;
        reports = null;
        detail = null;
        exams = [];
      }
    } catch (e) {
      if (operation.current()) error = errorMessage(e);
    } finally {
      if (operation.current()) authenticating = false;
    }
  }
  async function exportData(kind: ExportKind) {
    if (!selected || exporting) return;
    const examId = selected,
      operation = exports.begin();
    exporting = true;
    error = "";
    try {
      const result = await collectExport(
        examId,
        kind,
        operation.signal,
        request,
      );
      if (operation.current()) download(result.filename, result.items);
    } catch (e) {
      if (operation.current()) error = errorMessage(e);
    } finally {
      if (operation.current()) exporting = false;
    }
  }
  function destroy() {
    authentication.cancel();
    selection.cancel();
    exports.cancel();
  }
  return {
    get credential() {
      return credential;
    },
    set credential(value: string) {
      credential = value;
    },
    get loggedIn() {
      return loggedIn;
    },
    /** The stored session has been checked, so the login form is meaningful. */
    get checked() {
      return checked;
    },
    get error() {
      return error;
    },
    get exams() {
      return exams;
    },
    get selected() {
      return selected;
    },
    get analysis() {
      return analysis;
    },
    get reports() {
      return reports;
    },
    get detail() {
      return detail;
    },
    get saving() {
      return saving;
    },
    get busy() {
      return authenticating || loading || exporting;
    },
    get authenticating() {
      return authenticating;
    },
    get loading() {
      return loading;
    },
    get exporting() {
      return exporting;
    },
    load,
    login,
    select,
    logout,
    exportData,
    saveSettings,
    destroy,
  };
}
