"use server";

import { isSuppressibleCategory } from "./categories";
import { suppress } from "./data";
import { unsubscribeTokenSchema } from "./schema";
import { verifyUnsubscribeToken } from "./suppression";

/**
 * Unsubscribe confirmation (spec 10.3).
 *
 * Authorized by the HMAC in the link, NOT by a session: the recipient is often
 * logged out, on a different device, or has no account at all (an invitation
 * recipient). That is the whole reason suppression is keyed on the address.
 */

export type UnsubscribeState = { error?: string; done?: boolean };

const INVALID = "This unsubscribe link is not valid." as const;

export async function unsubscribeAction(
  _prev: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  // One message for a malformed link, a forged signature, and a category that
  // cannot be suppressed alike: none is actionable by the recipient, and
  // distinguishing them only helps someone probing the format. This is why the
  // parse result is discarded rather than turned into `fieldErrors` — the
  // deliberate exception to §22.2's field-level rule, for the same
  // anti-enumeration reason `signInAction` keeps its message whole-form.
  const parsed = unsubscribeTokenSchema.safeParse({
    e: formData.get("e"),
    c: formData.get("c"),
    t: formData.get("t"),
  });
  if (!parsed.success) return { error: INVALID };

  const token = verifyUnsubscribeToken(parsed.data.e, parsed.data.c, parsed.data.t);
  if (!token) return { error: INVALID };
  if (!isSuppressibleCategory(token.category)) return { error: INVALID };

  await suppress(token.email, token.category, "unsubscribe");
  return { done: true };
}
