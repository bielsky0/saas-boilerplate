import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";

/**
 * Shared validation schemas (spec 2.1, 16.1).
 *
 * FACTORIES, not constants, because the messages are now translated and a message
 * is a fact about the request rather than about the schema. Each takes the
 * translator and returns the schema:
 *
 *     const t = await getTranslations("auth.validation");
 *     const parsed = signUpSchema(t).safeParse(input);
 *
 * The alternative — schemas emitting stable KEYS as their `message`, translated at
 * the point of display — is cheaper and was rejected: it abuses `message` as a key,
 * so any zod error that escapes an explicit mapping renders `passwordMin` at a
 * user. A factory cannot fail that way.
 *
 * These stay the authoritative check. Today only the server actions call them (the
 * forms post and let the action answer), but nothing here is server-only: the
 * factory is a pure function, so a client form wanting instant feedback can call
 * it with `useTranslations("auth.validation")` and get the same rules in the same
 * language. That is the property worth protecting — the password policy (min 8,
 * a letter and a digit) must have exactly one definition.
 */

type ValidationTranslator = NamespaceTranslator<"auth.validation">;

export function passwordSchema(t: ValidationTranslator) {
  return z
    .string()
    .min(8, t("passwordMin"))
    .regex(/[A-Za-z]/, t("passwordLetter"))
    .regex(/\d/, t("passwordNumber"));
}

/**
 * `z.email(...)` takes the message explicitly. Without it zod emits its own
 * English default, which would survive every translation and surface as the one
 * untranslated string on an otherwise Polish form.
 */
export function emailSchema(t: ValidationTranslator) {
  return z.email(t("emailInvalid"));
}

export function signUpSchema(t: ValidationTranslator) {
  return z.object({
    email: emailSchema(t),
    password: passwordSchema(t),
    name: z.string().trim().max(120).optional(),
  });
}

export function signInSchema(t: ValidationTranslator) {
  return z.object({
    email: emailSchema(t),
    password: z.string().min(1, t("passwordRequired")),
  });
}

export function forgotPasswordSchema(t: ValidationTranslator) {
  return z.object({
    email: emailSchema(t),
  });
}

/**
 * The engine only enforces LENGTH on a reset (see `resetPassword` in the auth
 * adapter), so spec 2.1's letter+digit rule is ours to apply here — exactly as it
 * is on sign-up. Reusing `passwordSchema` is what keeps the two from drifting.
 */
export function resetPasswordSchema(t: ValidationTranslator) {
  return z.object({
    token: z.string().min(1, t("resetTokenInvalid")),
    password: passwordSchema(t),
  });
}

export type SignUpValues = z.infer<ReturnType<typeof signUpSchema>>;
export type SignInValues = z.infer<ReturnType<typeof signInSchema>>;
export type ForgotPasswordValues = z.infer<ReturnType<typeof forgotPasswordSchema>>;
export type ResetPasswordValues = z.infer<ReturnType<typeof resetPasswordSchema>>;
