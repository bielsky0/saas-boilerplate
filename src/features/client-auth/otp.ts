import { createHash, randomInt } from "node:crypto";

import { enqueueEmail } from "@/features/emails/send";
import type { Locale } from "@/lib/i18n/config";
import { createLogger } from "@/lib/logger";
import { withTenant } from "@/lib/db/tenant";
import { OTP_LENGTH, OTP_TTL_MS } from "./config";
import {
  consumeOtp,
  insertOtp,
  markClientVerified,
  registerFailedAttempt,
  supersedeLiveOtps,
  upsertClient,
} from "./data";
import { issueLimitDecision, verifyLimitDecision, type RequestIdentity } from "./rate-limit";

const log = createLogger("client-auth");

/**
 * Issuing and redeeming a parent's one-time code (langlion §2.19, US-4.5).
 *
 * The two halves of the domain OTP that replaces the boilerplate's magic link for
 * parents. Everything tenant-scoped runs inside `withTenant`, so a code minted by
 * Academy A is not merely filtered out at Academy B — the row is not visible to
 * the query at all.
 *
 * ─── THE RESPONSE NEVER REVEALS WHETHER THE ADDRESS IS KNOWN ────────────────
 *
 * `issueOtp` reports the same success for a brand-new address, an existing
 * parent, and a rate-limited caller's first refusal. This costs nothing here,
 * unlike on a password login, because the upsert means every address that asks
 * BECOMES known (US-4.1) — there is no membership fact left to leak. The property
 * is worth keeping anyway: it is what stops this endpoint from being an oracle
 * for "is this parent enrolled at that academy".
 */

export type IssueOutcome =
  | { status: "sent" }
  /** Rate limited. `retryAfterSeconds` is for the header, not for the body. */
  | { status: "rate_limited"; retryAfterSeconds: number };

export type VerifyOutcome =
  | { status: "verified"; clientId: string }
  | { status: "invalid" }
  | { status: "rate_limited"; retryAfterSeconds: number };

/**
 * A uniformly distributed `OTP_LENGTH`-digit code, zero-padded.
 *
 * `randomInt` rather than `Math.random`: this is a credential, and the modulo bias
 * of a naive range reduction would shrink the space an attacker has to search.
 * Padding keeps the length fixed so a leading zero cannot make a shorter code.
 */
function generateCode(): string {
  const max = 10 ** OTP_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_LENGTH, "0");
}

function hashCode(organizationId: string, email: string, code: string): string {
  // The tenant and address are folded into the hash, so a stored hash cannot be
  // replayed against another academy even if the same digits were issued there.
  return createHash("sha256").update(`${organizationId}:${email}:${code}`).digest("hex");
}

/**
 * Issue a code and email it (US-4.1 upsert + US-4.5).
 *
 * The client row, the superseding of older codes, the new code and the queued
 * email are ONE transaction. `enqueueEmail` takes the same `tx`, which is what
 * makes a rolled-back issue un-send its own mail rather than deliver a code for a
 * row that does not exist — the property `features/billing/webhooks.ts` relies on
 * for the same reason.
 */
export async function issueOtp(input: {
  organizationId: string;
  organizationName: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  locale: Locale;
  identity: RequestIdentity;
}): Promise<IssueOutcome> {
  const limited = await issueLimitDecision(input.organizationId, input.email, input.identity);
  if (limited) return limited;

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await withTenant(input.organizationId, async (tx) => {
    const parent = await upsertClient(tx, input.organizationId, input.email, {
      name: input.name ?? null,
      phone: input.phone ?? null,
    });

    /*
     * A removed parent gets silence, not a code — and the caller still sees
     * "sent", because saying otherwise would turn deletion into a queryable fact.
     * Returning early leaves the upsert's `updatedAt` touch committed, which is
     * harmless and not worth a second round trip to avoid.
     */
    if (parent.deletedAt) {
      log.info("otp suppressed for deleted client", { organizationId: input.organizationId });
      return;
    }

    await supersedeLiveOtps(tx, input.organizationId, input.email);

    const otp = await insertOtp(tx, {
      organizationId: input.organizationId,
      clientId: parent.id,
      email: input.email,
      codeHash: hashCode(input.organizationId, input.email, code),
      expiresAt,
    });

    await enqueueEmail(
      tx,
      "client-otp",
      {
        code,
        orgName: input.organizationName,
        expiresInMinutes: Math.round(OTP_TTL_MS / 60_000),
      },
      { to: input.email, locale: input.locale },
      // Keyed on the OTP row, which is new on every issue — so a resend is a
      // genuinely different message rather than one the queue swallows.
      { dedupeKey: `client-otp:${otp.id}` },
    );
  });

  return { status: "sent" };
}

/**
 * Redeem a code: consume it atomically, then start a session (US-4.5/AC1).
 *
 * ⚠️ THE ORDER IS THE SAFETY PROPERTY (decyzja D38). `consumeOtp` is a single
 * conditional UPDATE, and its result is checked BEFORE anything else happens. Two
 * requests arriving with the same code therefore produce exactly one session: the
 * loser matches no un-consumed row and leaves here with `invalid`, having created
 * nothing.
 *
 * The caller starts the session — this function returns a client id, it does not
 * set cookies — because `cookies().set` is only legal in a Route Handler or
 * Server Function, and keeping that constraint at the edge leaves this callable
 * from a job or a test.
 */
export async function verifyOtp(input: {
  organizationId: string;
  email: string;
  code: string;
  identity: RequestIdentity;
}): Promise<VerifyOutcome> {
  const limited = await verifyLimitDecision(input.organizationId, input.email, input.identity);
  if (limited) return limited;

  const codeHash = hashCode(input.organizationId, input.email, input.code);

  return withTenant(input.organizationId, async (tx) => {
    const consumed = await consumeOtp(tx, input.organizationId, input.email, codeHash);

    if (!consumed) {
      // Wrong, expired, superseded or already used — indistinguishable on purpose
      // (see `consumeOtp`). The attempt still counts, which is what burns a code
      // being guessed at even while the limiter is unavailable.
      await registerFailedAttempt(tx, input.organizationId, input.email);
      return { status: "invalid" as const };
    }

    // The flip that turns "someone typed this address" into "this parent is
    // recognised", and therefore the thing US-4.2/AC1 gates the shortened signup
    // path on — and, from v15, the discount display too (US-4.2/AC6).
    await markClientVerified(tx, input.organizationId, consumed.clientId);

    return { status: "verified" as const, clientId: consumed.clientId };
  });
}
