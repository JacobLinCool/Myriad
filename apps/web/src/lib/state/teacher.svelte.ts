import { api, ApiError } from "../api";
import { identify, reportError, resetIdentity, track } from "../posthog";
import { LatestRequest, errorMessage } from "./requests";
import {
  collectExport,
  downloadJSON,
  type TeacherExam,
  type ManagementAccess,
  type ExamDetail,
  type ExamSettings,
  type ExportKind,
} from "../teacher/data";
function identifyTeacher(access: ManagementAccess) {
  if (!access.account) return;
  identify(access.account.analyticsId, {
    provider: access.account.provider,
    is_teacher: true,
    can_create_exams: access.canCreateExams,
    is_admin: access.isAdmin,
  });
}
export function createTeacherSession(
  request: typeof api = api,
  download = downloadJSON,
) {
  let access = $state<ManagementAccess | null>(null);
  let credential = $state(""),
    loggedIn = $state(false),
    checked = $state(false),
    error = $state("");
  let exams = $state<TeacherExam[]>([]),
    selected = $state("");
  let detail = $state<ExamDetail | null>(null),
    saving = $state(false),
    /** Tabs reload their own data whenever this changes. */
    refreshKey = $state(0);
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
      const permissions = await request<ManagementAccess>(
        "/api/teacher/access",
        "GET",
        undefined,
        operation,
      );
      if (!operation.current()) return;
      access = permissions;
      if (!permissions.account) {
        loggedIn = false;
        return;
      }
      identifyTeacher(permissions);
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
        else {
          error = errorMessage(e);
          reportError(e, { action: "teacher_load" });
        }
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
      const permissions = await request<ManagementAccess>(
        "/api/teacher/access",
        "GET",
        undefined,
        operation,
      );
      if (!operation.current()) return;
      access = permissions;
      if (!permissions.account) throw new Error("登入帳戶無效");
      identifyTeacher(permissions);
      track("login_succeeded", { provider: "token", app_area: "teacher" });
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
        error = errorMessage(e);
        track("login_failed", {
          provider: "token",
          app_area: "teacher",
          status: e instanceof ApiError ? e.status : null,
        });
      }
    } finally {
      if (operation.current()) {
        authenticating = false;
        checked = true;
      }
    }
  }
  /**
   * Opens an exam's header data; each tab loads only what it shows. Reopening
   * the shown exam keeps its data visible until the new data arrives.
   */
  async function open(id: string) {
    const operation = selection.begin();
    if (id !== selected) {
      track("teacher_exam_selected", { exam_id: id });
      detail = null;
    }
    selected = id;
    loading = true;
    error = "";
    try {
      const d = await request<ExamDetail>(
        `/api/teacher/exams/${encodeURIComponent(id)}`,
        "GET",
        undefined,
        operation,
      );
      if (operation.current()) detail = d;
    } catch (e) {
      if (operation.current()) {
        error = errorMessage(e);
        reportError(e, { action: "teacher_open_exam", exam_id: id });
      }
    } finally {
      if (operation.current()) loading = false;
    }
  }
  /** Reloads the exam header and the open tab. */
  function refresh() {
    if (!selected) return;
    refreshKey++;
    return open(selected);
  }
  function close() {
    selection.cancel();
    selected = "";
    detail = null;
    loading = false;
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
      track("teacher_exam_settings_saved", {
        exam_id: examId,
        changed_fields: Object.keys(settings),
      });
      return true;
    } catch (e) {
      if (selected === examId) error = errorMessage(e);
      reportError(e, { action: "teacher_save_settings", exam_id: examId });
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
        track("logout", { app_area: "teacher" });
        resetIdentity();
        loggedIn = false;
        access = access
          ? { ...access, account: null, isAdmin: false, canCreateExams: false }
          : null;
        selected = "";
        detail = null;
        exams = [];
      }
    } catch (e) {
      if (operation.current()) {
        error = errorMessage(e);
        reportError(e, { action: "teacher_logout" });
      }
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
      if (operation.current()) {
        download(result.filename, result.items);
        track("teacher_data_exported", {
          exam_id: examId,
          export_kind: kind,
          item_count: result.items.length,
        });
      }
    } catch (e) {
      if (operation.current()) {
        error = errorMessage(e);
        reportError(e, { action: "teacher_export", exam_id: examId });
      }
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
    get access() {
      return access;
    },
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
    get refreshKey() {
      return refreshKey;
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
    open,
    refresh,
    close,
    logout,
    exportData,
    saveSettings,
    destroy,
  };
}
