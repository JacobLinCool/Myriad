import { LatestRequest, errorMessage } from "../state/requests";
import { reportError } from "../posthog";
/**
 * Data one tab shows. A reload keeps the previous data visible until the new
 * data arrives, and a newer reload always wins over an older one.
 */
export function resource<T>(
  action: string,
  load: (signal: AbortSignal) => Promise<T>,
) {
  let data = $state<T | null>(null),
    error = $state(""),
    loading = $state(false);
  const latest = new LatestRequest();
  async function reload() {
    const operation = latest.begin();
    loading = true;
    error = "";
    try {
      const value = await load(operation.signal);
      if (operation.current()) data = value;
    } catch (e) {
      if (operation.current()) {
        error = errorMessage(e);
        reportError(e, { action });
      }
    } finally {
      if (operation.current()) loading = false;
    }
  }
  return {
    get data() {
      return data;
    },
    get error() {
      return error;
    },
    get loading() {
      return loading;
    },
    reload,
    cancel: () => latest.cancel(),
  };
}
