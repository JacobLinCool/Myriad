/**
 * Follows an in-app link without reloading. Modified clicks keep the browser's
 * behavior, so a link still opens in a new tab or window.
 */
export function follow(
  event: MouseEvent,
  url: string,
  navigate: (url: string) => unknown,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  void navigate(url);
}
export type Navigate = (url: string) => unknown;
