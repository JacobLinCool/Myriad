import { canPrefetch, whenIdle } from "./motion";

/** A code-split module that renders synchronously once it has been fetched. */
export function lazy<T>(loader: () => Promise<T>) {
  let value = $state.raw<T | null>(null),
    pending: Promise<T> | undefined;
  function load() {
    pending ??= loader().then(
      (module) => (value = module),
      (error) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  }
  /** Fetches ahead of need without surfacing failures; a later load retries. */
  function prefetch() {
    if (!value && canPrefetch()) load().catch(() => {});
  }
  return {
    get current() {
      return value;
    },
    load,
    prefetch,
    prefetchWhenIdle: () => (value || pending ? () => {} : whenIdle(prefetch)),
  };
}
