import { z } from "zod";

export const AuthProviderSchema = z.enum(["nycu", "google"]);
export type AuthProvider = z.infer<typeof AuthProviderSchema>;
export const IdentityKindSchema = z.enum([
  "guest",
  ...AuthProviderSchema.options,
]);
export type IdentityKind = z.infer<typeof IdentityKindSchema>;

const labels: Record<IdentityKind, string> = {
  guest: "訪客",
  nycu: "NYCU",
  google: "Google",
};
export function identityLabel(kind: IdentityKind): string {
  return labels[kind];
}

/** Google subjects can be 255 characters; guest labels and NYCU usernames stay at 64. */
export function validateStudentIdentity(
  identity: { identityKind: IdentityKind; studentId: string | null },
  context: z.RefinementCtx,
): void {
  if (identity.studentId === null) return;
  const maximum = identity.identityKind === "google" ? 255 : 64;
  if (identity.studentId.length > maximum)
    context.addIssue({
      code: z.ZodIssueCode.too_big,
      type: "string",
      maximum,
      inclusive: true,
      path: ["studentId"],
      message: `Student identity must contain at most ${maximum} characters`,
    });
}
