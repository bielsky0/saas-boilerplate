"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authAdapter } from "@/lib/adapters/auth";
import { signOut as serverSignOut } from "@/lib/auth";
import { signInSchema, signUpSchema } from "./schema";

/**
 * Server actions for the email/password flows (spec 2.1). These are the only
 * callers of the auth adapter from the feature layer. They enforce the password
 * policy via the shared zod schema, keep messaging neutral for anti-enumeration,
 * and let Better Auth's `nextCookies` plugin set the session cookie.
 */

export type FormState = { error?: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

function safeCallbackUrl(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const result = await authAdapter.signUpEmailPassword(
    { email: parsed.data.email, password: parsed.data.password, name: parsed.data.name },
    await headers(),
  );

  if (!result.ok) {
    if (result.code === "WEAK_PASSWORD") {
      return { error: "Password must be at least 8 characters and include a letter and a number." };
    }
    return { error: GENERIC_ERROR };
  }

  // Neutral outcome for both fresh and already-registered emails (spec 2.1): the
  // redirect target is identical either way. A `callbackUrl` (e.g. an invitation)
  // is carried through so the verify-email page can offer a "continue" link
  // without leaking whether the email already existed.
  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl"));
  const target =
    callbackUrl === "/dashboard"
      ? "/verify-email?status=sent"
      : `/verify-email?status=sent&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  redirect(target);
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    // Do not reveal which field/why — keep the single neutral message.
    return { error: "Invalid email or password." };
  }

  const result = await authAdapter.signInEmailPassword(
    { email: parsed.data.email, password: parsed.data.password },
    await headers(),
  );

  if (!result.ok) {
    // Unknown email and wrong password are indistinguishable (spec 2.1).
    if (result.code === "INVALID_CREDENTIALS") {
      return { error: "Invalid email or password." };
    }
    return { error: GENERIC_ERROR };
  }

  redirect(safeCallbackUrl(formData.get("callbackUrl")));
}

export async function signOutAction(): Promise<void> {
  await serverSignOut();
  redirect("/login");
}
