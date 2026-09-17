import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { membership, personalAccount, subscription, user, type Db } from "@repo/db";
import { LIVE_STATUSES } from "@repo/billing";
import type { Locale } from "@repo/i18n-core";
import { DB } from "../db/db.module";
import { insertJob, type QueueWriter } from "../jobs/queue";
import { kickDrain } from "../jobs/runner";
import { EmailsService } from "../emails/emails.service";
import { toEmailLocale } from "../emails/translator";

/**
 * Onboarding sequence (spec 10.3) — the Nest twin of web's
 * `features/onboarding/{sequence,handler,data}.ts`.
 *
 * Day 0 welcome → day 3 tips → day 7 features, interrupted if the user
 * subscribes to a paid plan.
 *
 * ALL THREE STEPS ENQUEUED UPFRONT, never chained: a day-3 job that
 * dead-letters on a transient bug must not silently erase day 7. Upfront rows
 * are also queryable (§12.2). NEVER interrupted by deleting rows — the
 * interrupt lives in the handler's run-time guard, because a delete cannot
 * win the race against a job claimed at the same instant.
 *
 * The handler does not send: it guards, resolves the recipient, and enqueues
 * an `email.send` child (two hops, one delivery path). The parent's dedupe
 * key makes a re-claimed re-run not re-mail.
 */

export interface OnboardingStep {
  step: string;
  delayDays: number;
  template: "welcome" | "onboarding-tips" | "onboarding-features";
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { step: "welcome", delayDays: 0, template: "welcome" },
  { step: "tips", delayDays: 3, template: "onboarding-tips" },
  { step: "features", delayDays: 7, template: "onboarding-features" },
] as const;

/** The prefix every step's dedupe key shares — also the E2E fast-forward scope. */
export function onboardingKeyPrefix(userId: string): string {
  return `onboarding:${userId}:`;
}

/**
 * Statuses that mean "this user is paying" — the shared `LIVE_STATUSES`, not a
 * local copy. Deliberately NOT `ENTITLING_STATUSES`: a `past_due` tenant keeps
 * access (entitled) yet is still a customer worth onboarding, so the interrupt
 * stays narrower than the entitlement check. Same values as before, now
 * single-sourced.
 */
const PAID_STATUSES = LIVE_STATUSES;

export interface OnboardingUser {
  id: string;
  email: string;
  name: string | null;
  /** What language to write to them in (spec 16.1). Never null — renderable. */
  locale: Locale;
}

const stepPayloadSchema = z.object({
  userId: z.string().min(1),
  step: z.string().min(1),
});

@Injectable()
export class OnboardingService {
  private readonly log = new Logger("OnboardingService");

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly emails: EmailsService,
  ) {}

  /**
   * Enqueue the whole sequence at once. Three dedupe keys make this safe to
   * call twice (the engine's verified-guard is not atomic with its UPDATE, so
   * a mail-scanner prefetch can fire verification twice).
   */
  async startSequence(writer: QueueWriter, userId: string): Promise<void> {
    const now = Date.now();
    for (const s of ONBOARDING_STEPS) {
      await insertJob(
        writer,
        "onboarding.step",
        { userId, step: s.step },
        {
          runAt: new Date(now + s.delayDays * 86_400_000),
          dedupeKey: `${onboardingKeyPrefix(userId)}${s.step}`,
        },
      );
    }
    kickDrain();
  }

  /** One step: guard, resolve, enqueue the `email.send` child. */
  async handleStep(payload: unknown): Promise<void> {
    const { userId, step } = stepPayloadSchema.parse(payload);

    const definition = ONBOARDING_STEPS.find((s) => s.step === step);
    if (!definition) {
      // A step that no longer exists is deploy skew, not a transient fault.
      // Retry can never make a removed step reappear — treat as done.
      this.log.warn(`unknown step — skipping step=${step} user=${userId}`);
      return;
    }

    const recipient = await this.getOnboardingUser(userId);
    // Soft-deleted or purged (spec 11.3). A no-op is success — there is
    // nobody to mail, and no retry changes that.
    if (!recipient) return;

    // THE INTERRUPT, evaluated NOW rather than at enqueue time.
    if (await this.hasPaidSubscription(userId)) {
      this.log.log(`skip user=${userId} step=${step} reason=subscribed`);
      return;
    }

    await this.emails.enqueueEmail(
      this.db,
      definition.template,
      { name: recipient.name },
      {
        to: recipient.email,
        ...(recipient.name ? { name: recipient.name } : {}),
        // Resolved NOW, at enqueue — this handler is itself a day-3/day-7
        // job, and the child `email.send` drains later still.
        locale: recipient.locale,
      },
      { dedupeKey: `email:onboarding:${userId}:${step}` },
    );
  }

  /** The recipient, or null if the account is gone (spec 11.3 soft delete). */
  async getOnboardingUser(userId: string): Promise<OnboardingUser | null> {
    const [row] = await this.db
      .select({ id: user.id, email: user.email, name: user.name, locale: user.locale })
      .from(user)
      .where(and(eq(user.id, userId), isNull(user.deletedAt)))
      .limit(1);
    return row ? { ...row, locale: toEmailLocale(row.locale) } : null;
  }

  /**
   * The §10.3 interrupt. Counts BOTH owner contexts (spec 5.2): a subscription
   * on the user's personal account, or on any organization they actively
   * belong to. The org branch is deliberately not restricted to Owners — a
   * member of a paying team is already a paying customer, whoever holds the
   * card.
   */
  async hasPaidSubscription(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: subscription.id })
      .from(subscription)
      .leftJoin(personalAccount, eq(personalAccount.id, subscription.accountId))
      .leftJoin(
        membership,
        and(
          eq(membership.organizationId, subscription.organizationId),
          eq(membership.userId, userId),
          eq(membership.status, "active"),
        ),
      )
      .where(
        and(
          inArray(subscription.status, [...PAID_STATUSES]),
          or(eq(personalAccount.userId, userId), eq(membership.userId, userId)),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
}
