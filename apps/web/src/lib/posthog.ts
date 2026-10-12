/// <reference types="vite/client" />
import posthog, { type Properties } from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY;
/** A local build is still development, whatever mode built it. */
const environment =
  import.meta.env.DEV || ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "development"
    : "production";
/** Analytics is optional: without a key, or under test, every call is a no-op. */
export const analyticsEnabled = !!key && import.meta.env.MODE !== "test";

if (analyticsEnabled) {
  posthog.init(key, {
    // Exam venues may allow only this origin, so the Worker proxies PostHog.
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-05-30",
    person_profiles: "identified_only",
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    // Code, outputs and identities carry the `ph-no-capture` class and are
    // left out of recordings and autocapture; inputs are always masked.
    session_recording: { maskAllInputs: true },
  });
  posthog.register({
    environment,
    app_area: location.pathname.startsWith("/teacher") ? "teacher" : "student",
  });
}

export function track(event: string, properties?: Properties) {
  if (analyticsEnabled) posthog.capture(event, properties);
}
/** Errors shown to the user; cancelled requests are not errors. */
export function reportError(error: unknown, context: Properties) {
  if (!analyticsEnabled) return;
  if (error instanceof DOMException && error.name === "AbortError") return;
  posthog.captureException(error, context);
}
/** `id` is the server's pseudonymous analytics ID, never a student ID. */
export function identify(id: string, properties: Properties) {
  if (analyticsEnabled) posthog.identify(id, properties);
}
/**
 * Ends an identified person's events on this device. An anonymous visitor keeps
 * their ID, so a guest's journey stays one funnel.
 */
export function resetIdentity() {
  if (!analyticsEnabled) return;
  if (posthog.get_property("$user_state") !== "identified") return;
  posthog.reset();
  posthog.register({ environment });
  if (context) setContext(context);
}
interface Context {
  app_area: "student" | "teacher";
  exam_id?: string | null;
  is_preview?: boolean;
}
let context: Context | undefined;
/** Context attached to every later event, so insights can filter by exam. */
export function setContext(next: Context) {
  if (!analyticsEnabled) return;
  context = next;
  const { exam_id, is_preview, ...rest } = next;
  posthog.register(rest);
  if (exam_id) posthog.register({ exam_id, is_preview: !!is_preview });
  else {
    posthog.unregister("exam_id");
    posthog.unregister("is_preview");
  }
}
