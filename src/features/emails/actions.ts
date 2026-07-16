"use server";

import { isSuppressibleCategory } from "./categories";
import { suppress } from "./data";
import { verifyUnsubscribeToken } from "./suppression";

/**
 * Unsubscribe confirmation (spec 10.3).
 *
 * Authorized by the HMAC in the link, NOT by a session: the recipient is often
 * logged out, on a different device, or has no account at all (an invitation
 * recipient). That is the whole reason suppression is keyed on the address.
 */

export type UnsubscribeState = { error?: string; done?: boolean };

export async function unsubscribeAction(
  _prev: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  const e = formData.get("e");
  const c = formData.get("c");
  const t = formData.get("t");

  const token = verifyUnsubscribeToken(
    typeof e === "string" ? e : null,
    typeof c === "string" ? c : null,
    typeof t === "string" ? t : null,
  );
  // One message for a forged signature and a malformed link alike: neither is
  // actionable by the recipient, and distinguishing them only helps someone
  // probing the format.
  if (!token) return { error: "This unsubscribe link is not valid." };
  if (!isSuppressibleCategory(token.category))
    return { error: "This unsubscribe link is not valid." };

  await suppress(token.email, token.category, "unsubscribe");
  return { done: true };
}
