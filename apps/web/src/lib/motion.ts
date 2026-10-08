import { flushSync } from "svelte";

const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Applies a synchronous state change inside a view transition when the browser
 * supports one, so persistent elements morph instead of being replaced.
 */
export function viewTransition<T>(update: () => T): Promise<T> {
  if (
    typeof document === "undefined" ||
    !("startViewTransition" in document) ||
    document.visibilityState !== "visible" ||
    reducedMotion()
  )
    return Promise.resolve(update());
  // The update callback runs even when a newer transition skips this one.
  return new Promise<T>((resolve, reject) => {
    document.startViewTransition(() => {
      try {
        let result!: T;
        flushSync(() => {
          result = update();
        });
        resolve(result);
      } catch (error) {
        reject(error);
        throw error;
      }
    });
  });
}

/** A valid `view-transition-name` derived from an arbitrary identifier. */
export function transitionName(prefix: string, id: string) {
  return `${prefix}-${[...id].map((c) => (/[\w-]/.test(c) ? c : `_${c.codePointAt(0)!.toString(36)}`)).join("")}`;
}

/** Runs low-priority work once the main thread is idle. */
export function whenIdle(work: () => void, timeout = 2000) {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(work, { timeout });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(work, 200);
  return () => clearTimeout(handle);
}

/** Respects the visitor's data-saver preference for speculative downloads. */
export function canPrefetch() {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return !connection?.saveData && !/2g/.test(connection?.effectiveType ?? "");
}
