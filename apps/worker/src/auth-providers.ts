import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { AuthProvider } from "@myriad/shared";
import { token, type Env } from "./core.js";

type VerifiedProfile = { subject: string; displayName: string };
interface ProviderLogin {
  authorizationUrl: string;
  authorizationState: string;
  data: Record<string, string>;
}
interface ProviderAdapter {
  configured: (env: Env) => boolean;
  start: (
    env: Env,
    callback: string,
    context: string,
  ) => Promise<ProviderLogin>;
  complete: (
    env: Env,
    callback: URL,
    data: unknown,
  ) => Promise<VerifiedProfile>;
}
const firebaseKeys = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
  { timeoutDuration: 15000 },
);
const profileText = (maxLength: number) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value),
    );
const googleSubject = profileText(255).refine((value) =>
  /^[\x21-\x7e]+$/.test(value),
);
const firebaseClaims = z.object({
  aud: z.string(),
  sub: z.string().min(1).max(128),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  auth_time: z.number().int().positive(),
  name: profileText(256).optional(),
  firebase: z.object({
    sign_in_provider: z.literal("google.com"),
    // Firebase documents this signed claim as the provider's unique user ID.
    // https://firebase.google.com/docs/reference/rules/rules.firestore.Request
    identities: z.object({ "google.com": z.tuple([googleSubject]) }),
    tenant: z.never().optional(),
  }),
});
const firebasePending = z
  .object({
    sessionId: z.string().min(1).max(4096),
    context: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const nycuPending = z
  .object({ verifier: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();

async function firebaseRequest(
  env: Env,
  operation: "createAuthUri" | "signInWithIdp",
  body: Record<string, unknown>,
) {
  const url = new URL(
    `https://identitytoolkit.googleapis.com/v1/accounts:${operation}`,
  );
  url.searchParams.set("key", env.FIREBASE_API_KEY!);
  const response = await fetch(url, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  // Provider bodies and request URLs can contain credentials; never include them in errors.
  if (!response.ok) throw new Error("Firebase authentication request failed");
  return response.json<unknown>();
}

export const authProviders: Record<AuthProvider, ProviderAdapter> = {
  nycu: {
    configured: (env) => !!(env.NYCU_CLIENT_ID && env.NYCU_CLIENT_SECRET),
    async start(env, callback, context) {
      const verifier = token();
      const digest = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      );
      const challenge = btoa(String.fromCharCode(...digest))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
      const url = new URL("https://id.nycu.edu.tw/o/authorize/");
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: env.NYCU_CLIENT_ID!,
        redirect_uri: callback,
        scope: "profile",
        state: context,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
      return {
        authorizationUrl: url.toString(),
        authorizationState: context,
        data: { verifier },
      };
    },
    async complete(env, callback, data) {
      const { verifier } = nycuPending.parse(data);
      const response = await fetch("https://id.nycu.edu.tw/o/token/", {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: callback.searchParams.get("code")!,
          redirect_uri: `${callback.origin}${callback.pathname}`,
          client_id: env.NYCU_CLIENT_ID!,
          client_secret: env.NYCU_CLIENT_SECRET!,
          code_verifier: verifier,
        }),
      });
      if (!response.ok) throw new Error("NYCU token request failed");
      const credentials = z
        .object({ access_token: z.string().min(1), token_type: z.string() })
        .parse(await response.json());
      if (credentials.token_type.toLowerCase() !== "bearer")
        throw new Error("Invalid NYCU credentials");
      const profileResponse = await fetch(
        "https://id.nycu.edu.tw/api/profile/",
        {
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${credentials.access_token}`,
            Accept: "application/json",
          },
        },
      );
      if (!profileResponse.ok) throw new Error("NYCU profile unavailable");
      const profile = z
        .object({ username: profileText(64) })
        .parse(await profileResponse.json());
      return { subject: profile.username, displayName: profile.username };
    },
  },
  google: {
    configured: (env) => !!(env.FIREBASE_PROJECT_ID && env.FIREBASE_API_KEY),
    async start(env, callback, context) {
      const result = z
        .object({
          authUri: z.string().url(),
          sessionId: z.string().min(1).max(4096),
          providerId: z.literal("google.com"),
        })
        .parse(
          await firebaseRequest(env, "createAuthUri", {
            providerId: "google.com",
            continueUri: callback,
            authFlowType: "CODE_FLOW",
            context,
          }),
        );
      const url = new URL(result.authUri);
      const state = url.searchParams.get("state");
      if (
        url.origin !== "https://accounts.google.com" ||
        url.username ||
        url.password ||
        url.hash ||
        !["/o/oauth2/auth", "/o/oauth2/v2/auth"].includes(url.pathname) ||
        url.searchParams.getAll("redirect_uri").length !== 1 ||
        url.searchParams.get("redirect_uri") !== callback ||
        url.searchParams.getAll("response_type").length !== 1 ||
        url.searchParams.get("response_type") !== "code" ||
        url.searchParams.getAll("state").length !== 1 ||
        !state ||
        state.length > 8192
      )
        throw new Error("Invalid Firebase authorization URL");
      return {
        authorizationUrl: result.authUri,
        authorizationState: state,
        data: { sessionId: result.sessionId, context },
      };
    },
    async complete(env, callback, data) {
      const pending = firebasePending.parse(data);
      const result = z
        .object({
          idToken: z.string().min(1),
          context: z.literal(pending.context),
          providerId: z.literal("google.com"),
          localId: z.string().min(1).max(128),
          needConfirmation: z.literal(false).optional(),
          needEmail: z.literal(false).optional(),
          mfaPendingCredential: z.never().optional(),
          pendingToken: z.never().optional(),
          errorMessage: z.never().optional(),
        })
        .parse(
          await firebaseRequest(env, "signInWithIdp", {
            requestUri: callback.toString(),
            sessionId: pending.sessionId,
            returnSecureToken: true,
            returnIdpCredential: false,
            returnRefreshToken: false,
          }),
        );
      const { payload, protectedHeader } = await jwtVerify(
        result.idToken,
        firebaseKeys,
        {
          algorithms: ["RS256"],
          issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
          audience: env.FIREBASE_PROJECT_ID!,
          requiredClaims: [
            "iss",
            "aud",
            "sub",
            "exp",
            "iat",
            "auth_time",
            "firebase",
          ],
        },
      );
      const verified = firebaseClaims.parse(payload);
      const now = Math.floor(Date.now() / 1000);
      if (
        !protectedHeader.kid ||
        verified.aud !== env.FIREBASE_PROJECT_ID ||
        result.localId !== verified.sub ||
        verified.iat > now ||
        verified.auth_time > now ||
        verified.auth_time > verified.iat ||
        verified.exp <= verified.iat
      )
        throw new Error("Invalid Firebase identity claims");
      const subject = verified.firebase.identities["google.com"][0];
      return { subject, displayName: verified.name ?? subject };
    },
  },
};

export function enabledProviders(env: Env): AuthProvider[] {
  return (Object.keys(authProviders) as AuthProvider[]).filter(
    (provider) => !!env.APP_ORIGIN && authProviders[provider].configured(env),
  );
}
