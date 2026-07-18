import { z } from "zod";

/**
 * Unsubscribe link validation (spec 10.3 / 22.2).
 *
 * The one genuinely PUBLIC input surface in the app that had no schema. Both
 * consumers — the RFC 8058 one-click route and the in-body confirmation action —
 * hand-rolled `typeof x === "string" ? x : null` three times each before parsing
 * the token, which is a type guard rather than a validation and admits `""`.
 *
 * NOT a translator factory, even though a human does read the failure. The
 * messages here are deliberately not per-field and not derived from the schema:
 * a malformed link and a forged signature must be indistinguishable (see
 * `actions.ts`), so the call sites emit one fixed message and discard the issue
 * detail. A factory would suggest field errors are available, and they must not
 * be — telling a caller which of `e`/`c`/`t` was wrong helps exactly one person,
 * and it is the person probing the token format.
 *
 * The fields are the query/form parameter names as they appear in the link:
 *   e — the encoded recipient address
 *   c — the suppression category
 *   t — the HMAC over the two
 *
 * This checks SHAPE only. `verifyUnsubscribeToken` remains the authority on
 * whether the signature is genuine; passing this schema means only that there is
 * something worth verifying.
 */
export const unsubscribeTokenSchema = z.object({
  e: z.string().min(1).max(320),
  c: z.string().min(1).max(64),
  t: z.string().min(1).max(128),
});

export type UnsubscribeToken = z.infer<typeof unsubscribeTokenSchema>;
