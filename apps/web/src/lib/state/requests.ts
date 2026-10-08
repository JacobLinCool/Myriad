/** Each new request invalidates and cancels the previous request, including A → B → A. */
export class LatestRequest {
  private controller?: AbortController;
  begin() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    return {
      signal: controller.signal,
      current: () =>
        this.controller === controller && !controller.signal.aborted,
    };
  }
  cancel() {
    this.controller?.abort();
    this.controller = undefined;
  }
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
