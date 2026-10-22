import {
  AuthProviderSchema,
  identityLabel,
  type AuthProvider,
} from "@myriad/shared";

export function loginUrl(provider: AuthProvider, returnTo: string) {
  return `/api/auth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`;
}

/** Callback parameters are untrusted; only known providers enter telemetry. */
export function loginFailure(params: URLSearchParams) {
  const reason = params.get("auth_error");
  if (!reason) return null;
  const parsed = AuthProviderSchema.safeParse(params.get("auth_provider"));
  const provider = parsed.success ? parsed.data : undefined;
  const label = provider ? `${identityLabel(provider)} ` : "";
  const expected = params.get("expected") ?? "";
  const origin = /^https?:\/\/[\w.-]+(:\d+)?$/.test(expected)
    ? expected
    : "本站正式網址";
  const message =
    reason === "cancelled"
      ? `已取消 ${label}登入，請重新登入。`
      : reason === "origin"
        ? `這個網址無法完成 ${label}登入，請改用 ${origin} 開啟。`
        : `${label}登入未完成，請重試。`;
  return { provider, reason, message };
}
