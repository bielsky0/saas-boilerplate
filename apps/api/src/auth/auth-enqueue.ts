import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, isNull } from "drizzle-orm";

import { job, personalAccount, user, type Db } from "@repo/db";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  type Locale,
} from "@repo/i18n-core";

/**
 * Auth side effects — queue rows + locale reads (spec 2.1 / 10 / 12 / 16).
 *
 * The Nest twin of web's `enqueueEmail` / `enqueueNotification` /
 * `startOnboardingSequence` (the INSERT half) and `storedLocaleForUser` /
 * `recipientLocale`. Delivery (retry, suppression, rendering, the outbox E2E
 * reads) runs HERE now (faza 2.3: `src/emails`, `src/onboarding`, `src/jobs`),
 * so this file must stay row-shape-compatible with those handlers:
 * `email.send` `{template,data,to,name?,locale}`, `notification.create`
 * `{userId,organizationId,accountId,type,params,link?}`, `onboarding.step`
 * `{userId,step}` — all JSON primitives, `locale` a plain string.
 */

// ─── Request locale (no Next.js request scope in Nest) ───────────────────────

/** Minimal `cookie` header parser — Express has no cookie middleware here. */
function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

/**
 * The locale in effect for THIS request, or null.
 *
 * Explicit header, then cookie, then nothing — deliberately NOT Accept-Language
 * and NOT the default. The forms send `x-app-locale` (they know their page's
 * locale); `/api/dev/seed-user` carries the seeder's `app-locale` cookie. A
 * missing signal stays missing: stamping a negotiated guess into `user.locale`
 * would launder "their browser said en" into "they chose en", and that
 * fabricated preference would then outrank the browser forever. NULL is the
 * honest answer, exactly like web's `requestLocale()`.
 */
export function requestLocaleFromHeaders(headers: Headers | null): Locale | null {
  if (!headers) return null;
  const header = headers.get(LOCALE_HEADER);
  if (isLocale(header)) return header;
  const cookie = parseCookies(headers.get("cookie"))[LOCALE_COOKIE];
  if (isLocale(cookie)) return cookie;
  return null;
}

/**
 * Request-locale propagation into engine hooks (spec 16.1).
 *
 * The engine's email hooks (`sendVerificationEmail`, `sendResetPassword`) run
 * on the engine's own connection with NO request scope — a server-side
 * `auth.api.*` call carries headers but no `Request`, so the hook cannot see
 * them. The controllers resolve the locale from THEIR request and publish it
 * here; the hooks read it back. Same shape as web's ambient `headers()`, made
 * explicit: concurrent requests stay isolated (per-async-chain storage), and
 * an empty store reads as "no signal", never as a default.
 */
const requestLocaleStore = new AsyncLocalStorage<Locale | null>();

export function runWithRequestLocale<T>(locale: Locale | null, fn: () => T): T {
  return requestLocaleStore.run(locale, fn);
}

function ambientRequestLocale(): Locale | null {
  return requestLocaleStore.getStore() ?? null;
}

// ─── Stored locale (the durable answer) ──────────────────────────────────────

/** The user's stored choice, or null if they never made one. */
export async function storedLocaleForUserId(db: Db, userId: string): Promise<Locale | null> {
  const [row] = await db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const value = row?.locale ?? null;
  return isLocale(value) ? value : null;
}

/** Same, by email — for sign-in-adjacent reads that must not touch a session. */
export async function storedLocaleForEmail(db: Db, email: string): Promise<Locale | null> {
  const [row] = await db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  const value = row?.locale ?? null;
  return isLocale(value) ? value : null;
}

/**
 * What language to write to this user in (spec 16.1): stored choice, else the
 * request in flight (ambient hook context, else explicit headers), else the
 * default. Reads, never writes.
 */
export async function recipientLocale(
  db: Db,
  userId: string,
  headers: Headers | null,
): Promise<Locale> {
  return (
    (await storedLocaleForUserId(db, userId)) ??
    ambientRequestLocale() ??
    requestLocaleFromHeaders(headers) ??
    DEFAULT_LOCALE
  );
}

/**
 * Stamp the registration-time language onto a genuinely-new row (spec 16.1).
 *
 * Runs AFTER a successful engine sign-up, never before: sign-up answers `ok`
 * for an already-registered email too, so stamping anywhere reachable on that
 * path would let anyone overwrite anyone else's language with a duplicate
 * sign-up. The conditional update (`locale IS NULL`) is the second half — a
 * real choice is never overwritten by a later guess.
 */
export async function stampLocaleIfUnset(
  db: Db,
  userId: string,
  locale: Locale | null,
): Promise<void> {
  if (!locale) return;
  await db
    .update(user)
    .set({ locale })
    .where(and(eq(user.id, userId), isNull(user.locale)));
}

// ─── Engine link repair ──────────────────────────────────────────────────────

/**
 * Absolutize a callback against the WEB origin (faza 2.1).
 *
 * The engine resolves relative callbacks against ITS baseURL (the API) — but
 * every caller still speaks web-relative (`/dashboard`, `/reset-password`),
 * because that is what the web engine accepted. A relative callback baked
 * into an emailed link would 302 the browser to `:3001/...`, where no page
 * exists. Absolute web URLs pass through (the engine's origin check already
 * validated them against trustedOrigins); anything else falls back.
 */
export function absoluteWebCallback(raw: unknown, webURL: string, fallbackPath: string): string {
  const base = webURL.replace(/\/+$/, "");
  if (typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")) {
    return `${base}${raw}`;
  }
  if (typeof raw === "string") {
    try {
      if (new URL(raw).origin === base) return raw;
    } catch {
      // Fall through to the fallback below.
    }
  }
  return `${base}${fallbackPath}`;
}

/**
 * Repair an engine-built emailed URL in place: if its `callbackURL` param is
 * relative, point it at the web origin. Covers every caller — including the
 * legacy engine-HTTP paths the E2E suite drives directly with web-relative
 * `redirectTo` — without touching request bodies or endpoint shapes.
 */
export function repairEngineUrl(engineUrl: string, webURL: string, fallbackPath: string): string {
  try {
    const parsed = new URL(engineUrl);
    const callback = parsed.searchParams.get("callbackURL");
    if (callback) {
      parsed.searchParams.set("callbackURL", absoluteWebCallback(callback, webURL, fallbackPath));
    }
    return parsed.toString();
  } catch {
    return engineUrl;
  }
}

// ─── Personal account ────────────────────────────────────────────────────────
/** Idempotently ensure a user's personal account exists (spec 3.1). */
export async function ensurePersonalAccount(db: Db, userId: string): Promise<void> {
  await db.insert(personalAccount).values({ userId }).onConflictDoNothing();
}

export async function getPersonalAccountByUserId(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(personalAccount)
    .where(and(eq(personalAccount.userId, userId), isNull(personalAccount.deletedAt)))
    .limit(1);
  return row ?? null;
}

// ─── Job rows (the INSERT half of the queue) ─────────────────────────────────

export interface EnqueueOptions {
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
}

async function insertJob(
  db: Db,
  name: string,
  payload: Record<string, unknown>,
  options?: EnqueueOptions,
): Promise<void> {
  await db
    .insert(job)
    .values({
      name,
      payload,
      dedupeKey: options?.dedupeKey ?? null,
      runAt: options?.runAt ?? new Date(),
      ...(options?.maxAttempts !== undefined ? { maxAttempts: options.maxAttempts } : {}),
    })
    // A duplicate key adds no row and is not an error (the webhooks.ts pattern).
    .onConflictDoNothing({ target: [job.dedupeKey] });
}

export interface EmailRecipient {
  to: string;
  name?: string | null;
  locale: Locale;
}

/**
 * Queue an email. Transactional templates only from auth flows
 * (`verify-email`, `password-reset`) — both unsuppressible by construction, so
 * no suppression check here (web's handler re-checks anyway at send time).
 */
export async function enqueueEmailJob(
  db: Db,
  template: "verify-email" | "password-reset",
  data: { url: string; name?: string | null },
  recipient: EmailRecipient,
  options?: EnqueueOptions,
): Promise<void> {
  await insertJob(
    db,
    "email.send",
    {
      template,
      data: { url: data.url, ...(data.name ? { name: data.name } : {}) },
      to: recipient.to,
      ...(recipient.name ? { name: recipient.name } : {}),
      locale: recipient.locale,
    },
    options,
  );
}

export interface NotificationInput {
  userId: string;
  organizationId: string | null;
  accountId: string | null;
  type: string;
  params?: Record<string, string | number>;
  link?: string;
}

export async function enqueueNotificationJob(
  db: Db,
  input: NotificationInput,
  options?: EnqueueOptions,
): Promise<void> {
  await insertJob(
    db,
    "notification.create",
    {
      userId: input.userId,
      organizationId: input.organizationId,
      accountId: input.accountId,
      type: input.type,
      params: input.params ?? {},
      ...(input.link ? { link: input.link } : {}),
    },
    options,
  );
}

const ONBOARDING_STEPS = [
  { step: "welcome", delayDays: 0 },
  { step: "tips", delayDays: 3 },
  { step: "features", delayDays: 7 },
] as const;

export function onboardingKeyPrefix(userId: string): string {
  return `onboarding:${userId}:`;
}

/**
 * Enqueue the whole onboarding sequence upfront (spec 10.3) — never a chain,
 * never interrupted by deleting rows. Three dedupe keys make this safe to call
 * twice (the engine's verified-guard is not atomic with its UPDATE).
 */
export async function startOnboardingJobs(db: Db, userId: string): Promise<void> {
  const now = Date.now();
  for (const s of ONBOARDING_STEPS) {
    await insertJob(
      db,
      "onboarding.step",
      { userId, step: s.step },
      {
        runAt: new Date(now + s.delayDays * 86_400_000),
        dedupeKey: `${onboardingKeyPrefix(userId)}${s.step}`,
      },
    );
  }
}
