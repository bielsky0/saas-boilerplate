"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import type { FormState } from "@/lib/validation";
import { setPreference } from "./data";
import { NOTIFICATION_TYPES, isSuppressibleType } from "./types";

/**
 * Notification server actions (spec 23.3) — only the preference form remains.
 * Reads and mark-read moved to Nest (`GET/PATCH /v1/notifications`, proxied
 * through `src/app/api/notifications/*`); the preference form follows in
 * etap 2 with the creation pipeline.
 */

/**
 * Save the in-app channel preferences (spec 23.3). One form, one Save button: for
 * each SUPPRESSIBLE type an unchecked checkbox is absent from the FormData, which
 * reads as "off" — the opt-out. Non-suppressible types are never written (they
 * cannot be muted, by construction — see types.ts).
 *
 * Deliberately has NO schema, unlike its siblings above, and the reason is
 * structural rather than an oversight: this loop never reads a key the client
 * chose. It iterates `NOTIFICATION_TYPES` — a server-side constant — and asks
 * the FormData about each one, so an attacker-supplied field name is not looked
 * up, and an attacker-supplied value is compared against `"on"` and collapses to
 * `false`. There is no input here to hold to a shape; the shape is the loop.
 * Adding a schema would be ceremony that implies a check is happening where the
 * real guarantee is that nothing untrusted is consulted.
 */
export async function updateNotificationPreferencesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();

  for (const type of NOTIFICATION_TYPES) {
    if (!isSuppressibleType(type)) continue;
    const enabled = formData.get(`inApp:${type}`) === "on";
    await setPreference(session.user.id, type, enabled);
  }

  revalidatePath("/settings/notifications");
  return { success: "saved" };
}
