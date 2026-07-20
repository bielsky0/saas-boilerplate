import { z } from "zod";

import { OTP_LENGTH } from "./config";

/**
 * Request validation for the parent-authentication endpoints (plan F3).
 *
 * PLAIN ZOD, NO TRANSLATOR — unlike `features/clients/schema.ts` and every form
 * schema in the app. These validate a JSON API rather than a form: the response
 * carries a stable machine-readable `error` code and the UI that lands in F5 owns
 * the wording. Putting user-facing copy here would mean two places to change a
 * sentence, one of which nobody renders.
 */

/**
 * The academy being addressed.
 *
 * A field TODAY, the `Host` header AFTER the subdomain middleware (F5) — see
 * `./organization.ts` for why the public subdomain is the right currency for this
 * either way. Bounds only; the value is looked up, never interpolated anywhere,
 * so a stricter DNS-label regex here would duplicate `subdomainSchema` without
 * changing any outcome.
 */
const subdomain = z.string().trim().toLowerCase().min(1).max(63);

/**
 * Lowercased, exactly as `client.email` is stored — the pair
 * `(organizationId, email)` is a UNIQUE key, and "Anna@…" arriving as a second
 * parent alongside "anna@…" would be two people who are one person.
 */
const email = z.email().trim().toLowerCase();

export const requestCodeSchema = z.object({
  subdomain,
  email,
  /**
   * Carried through to the US-4.1 upsert. Optional for the same reason it is
   * optional on the column: the row may be created before the parent has finished
   * typing, and an academy that does not collect phone numbers should not be made
   * to invent one.
   */
  name: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
});

export const verifyCodeSchema = z.object({
  subdomain,
  email,
  /**
   * Digits only, exact length — the shape `generateCode` produces. A malformed
   * code is refused before it reaches the database, but it is refused with the
   * SAME response as a wrong one: length and charset are not facts worth
   * confirming to someone guessing.
   */
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`)),
});

export const logoutSchema = z.object({ subdomain });

export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
