export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
/** The server refused to create a submission, so nothing is pending. */
export class SubmissionRejected extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SubmissionRejected";
  }
}
export async function api<T>(
  url: string,
  method = "GET",
  data?: unknown,
  options: Pick<RequestInit, "signal" | "headers"> = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (data !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(url, {
    ...options,
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (response.status === 204) return undefined as T;
  const value = await response.json();
  if (!response.ok)
    throw new ApiError(
      value.error ?? `請求失敗 (${response.status})`,
      response.status,
    );
  return value;
}
export function draftKey(student: string, exam: string, problem: string) {
  return `myriad_draft:${JSON.stringify([student, exam, problem])}`;
}
