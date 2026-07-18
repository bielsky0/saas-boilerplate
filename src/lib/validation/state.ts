import type { z } from "zod";
import { flattenError } from "zod";

/**
 * The result shape every server action returns (spec 22.2 — "błędy walidacji
 * zwracane w spójnym, przewidywalnym formacie (pole → komunikat)").
 *
 * Same role `lib/security/rate-limit.ts` plays for limits: this module owns the
 * SHAPE, the features own the rules. Before this existed the type was declared
 * four times — `features/auth`, `organizations`, `admin`, `notifications` each
 * had their own `ActionState`/`FormState`, so there was no one place to add a
 * field to and no way for a form component to be generic over an action.
 *
 * `error` and `fieldErrors` are both populated, and that is deliberate rather
 * than redundant:
 *
 *   - `fieldErrors` is what spec 22.2 asks for and what a form renders next to
 *     the offending input.
 *   - `error` is the single-string summary every existing form already renders,
 *     and every existing E2E spec already asserts by exact text.
 *
 * Keeping both means field-level rendering is added form-by-form instead of in
 * one sweep. A form nobody has touched keeps working unchanged. The alternative
 * — replacing `error` with `fieldErrors` outright — was rejected because it
 * turns a UI improvement into a repo-wide breaking change, and because some
 * errors genuinely have no field: a forged token, a failed upstream call, and
 * (deliberately, see below) an authentication failure.
 *
 * ⚠️ NOT every failure should become a field error. Anti-enumeration messages
 * (§2.1) must stay whole-form: telling a caller that `email` specifically was
 * wrong is exactly the disclosure `signInAction` avoids. Field errors are for
 * FORMAT failures the user can see for themselves; domain failures stay in
 * `error`.
 */
export type FormState = {
  /** Whole-form message. Always set when the action failed. */
  error?: string;
  /** Per-field messages, keyed by the schema's field name (§22.2). */
  fieldErrors?: Record<string, string[]>;
  /** Whole-form success message. */
  success?: string;
};

/**
 * Turn a failed parse into a `FormState`.
 *
 * `fallback` is the feature's generic message (`<feature>.errors.generic`),
 * used when zod produced an error with no issue carrying a message — which
 * should not happen, but "should not happen" is not a rendering strategy.
 *
 * Note this returns EVERY message per field, not the first: `z.flattenError`
 * collects them, so a password failing both the length and the digit rule tells
 * the user both things at once instead of making them resubmit to discover the
 * second.
 */
export function invalid(error: z.ZodError, fallback: string): FormState {
  const flat = flattenError(error);
  return {
    error: error.issues[0]?.message ?? fallback,
    fieldErrors: flat.fieldErrors,
  };
}
