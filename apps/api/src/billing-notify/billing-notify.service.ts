import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { membership, organization, personalAccount, subscription, user, type Db } from "@repo/db";
import type { Locale } from "@repo/i18n-core";
import { DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { API_CONFIG } from "../db/db.module";
import { EmailsService } from "../emails/emails.service";
import { toEmailLocale } from "../emails/translator";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Billing notifications (spec 10.2) — the Nest twin of web's
 * `features/billing/notify.ts` + the two data helpers it needs from
 * `features/billing/data.ts`.
 *
 * Runs as a job, never inside the webhook transaction. It fans out: it
 * resolves recipients and enqueues one `email.send` CHILD each, rather than
 * sending N mails itself. If it sent them directly, a failure on recipient 2
 * would retry the whole job and re-mail recipient 1 — children retry
 * independently. Resolving recipients here (rather than at enqueue time) is
 * also more correct: an Owner added between the event and the send gets the
 * mail, and one removed in that window does not.
 *
 * SCOPE NOTE: this module is notify-only. Checkout/portal/webhook move in
 * faza 2.5 (with `@repo/billing` for plans); the plan-name map below is the
 * minimal display lookup the confirmation mail needs until then.
 */

/** Statuses where announcing "your subscription is active" is still true. */
const LIVE_STATUSES = ["active", "trialing"];

const notifySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("payment-failed"),
    organizationId: z.string().nullable(),
    accountId: z.string().nullable(),
    eventId: z.string(),
    amount: z.number(),
    currency: z.string(),
  }),
  z.object({
    kind: z.literal("subscription-confirmed"),
    organizationId: z.string().nullable(),
    accountId: z.string().nullable(),
    eventId: z.string(),
    providerSubscriptionId: z.string(),
  }),
]);

/**
 * Display names for the confirmation mail (spec 5.2). Minimal on purpose:
 * the full plan table (prices, limits, entitlements) moves to `@repo/billing`
 * in faza 2.5 — this only answers "what do we call it in a sentence?".
 */
const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

function planName(planId: string | null): string {
  return (planId && PLAN_NAMES[planId]) || "your new";
}

export interface Mailbox {
  userId: string;
  email: string;
  name: string | null;
  /** Per-mailbox, not per-org: owners of one org may read different languages. */
  locale: Locale;
}

export interface BillingRecipients {
  ownerName: string;
  orgSlug: string | null;
  mailboxes: Mailbox[];
}

@Injectable()
export class BillingNotifyService {
  private readonly log = new Logger("BillingNotifyService");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly emails: EmailsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Where the recipient goes to act on this. Becomes the provider-hosted
   * portal link when spec 5.5 lands — only this function changes.
   */
  private manageUrl(orgSlug: string | null): string {
    const base = this.config.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
    return orgSlug ? `${base}/orgs/${orgSlug}/settings` : `${base}/dashboard`;
  }

  async handleNotify(payload: unknown): Promise<void> {
    const p = notifySchema.parse(payload);

    if (p.kind === "subscription-confirmed") {
      /**
       * THE WATERMARK GUARD. The webhook drops a stale `created` that arrives
       * after an `updated`, but the enqueue sits OUTSIDE that upsert and fires
       * regardless. Without this re-read, an out-of-order delivery would mail
       * "your subscription is active" about an already-cancelled one.
       * Re-reading the CURRENT row is what makes the guard authoritative.
       */
      const sub = await this.getSubscriptionByProviderId(p.providerSubscriptionId);
      if (!sub || !LIVE_STATUSES.includes(sub.status)) {
        this.log.log(
          `skip subscription-confirmed event=${p.eventId} reason=${sub ? `status=${sub.status}` : "subscription-missing"}`,
        );
        return;
      }

      const { ownerName, orgSlug, mailboxes } = await this.resolveBillingRecipients(
        p.organizationId,
        p.accountId,
      );
      for (const box of mailboxes) {
        await this.emails.enqueueEmail(
          this.db,
          "subscription-confirmed",
          {
            orgName: ownerName,
            planName: planName(sub.planId),
            manageUrl: this.manageUrl(orgSlug),
          },
          { to: box.email, ...(box.name ? { name: box.name } : {}), locale: box.locale },
          // Per-CHILD key, including the address: a re-claimed re-run of the
          // fan-out must not re-mail anyone who already received it.
          { dedupeKey: `email:${p.kind}:${p.eventId}:${box.email.toLowerCase()}` },
        );
        // The SECOND channel (spec 23) — its own job, independent of the
        // email above. Per-recipient dedupe on the same basis.
        await this.notifications.enqueueNotification(
          this.db,
          {
            userId: box.userId,
            organizationId: p.organizationId,
            accountId: p.accountId,
            type: "subscription-confirmed",
            params: { orgName: ownerName, planName: planName(sub.planId) },
            link: this.manageUrl(orgSlug),
          },
          { dedupeKey: `notif:${p.kind}:${p.eventId}:${box.userId}` },
        );
      }
      return;
    }

    const { ownerName, orgSlug, mailboxes } = await this.resolveBillingRecipients(
      p.organizationId,
      p.accountId,
    );
    if (mailboxes.length === 0) {
      // Nobody left to tell (every Owner soft-deleted, or the org itself).
      // Not a failure: retrying cannot conjure a recipient.
      this.log.warn(`no recipients for payment-failed event=${p.eventId}`);
      return;
    }
    for (const box of mailboxes) {
      await this.emails.enqueueEmail(
        this.db,
        "payment-failed",
        {
          orgName: ownerName,
          amount: p.amount,
          currency: p.currency,
          manageUrl: this.manageUrl(orgSlug),
        },
        { to: box.email, ...(box.name ? { name: box.name } : {}), locale: box.locale },
        { dedupeKey: `email:${p.kind}:${p.eventId}:${box.email.toLowerCase()}` },
      );
      await this.notifications.enqueueNotification(
        this.db,
        {
          userId: box.userId,
          organizationId: p.organizationId,
          accountId: p.accountId,
          type: "payment-failed",
          params: { orgName: ownerName, amount: p.amount, currency: p.currency },
          link: this.manageUrl(orgSlug),
        },
        { dedupeKey: `notif:${p.kind}:${p.eventId}:${box.userId}` },
      );
    }
  }

  /** One subscription by its provider id — the freshness check. */
  async getSubscriptionByProviderId(providerSubscriptionId: string) {
    const [row] = await this.db
      .select()
      .from(subscription)
      .where(eq(subscription.providerSubscriptionId, providerSubscriptionId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Resolve a billing owner to the people who should hear about it (spec
   * 10.2): ALL ACTIVE OWNERS of an org (not whoever ran checkout), or the
   * personal account's user. Soft-deleted users/orgs excluded — nobody there
   * can act on the mail.
   */
  async resolveBillingRecipients(
    organizationId: string | null,
    accountId: string | null,
  ): Promise<BillingRecipients> {
    if (organizationId) {
      const rows = await this.db
        .select({
          userId: user.id,
          email: user.email,
          name: user.name,
          locale: user.locale,
          orgName: organization.name,
          orgSlug: organization.slug,
        })
        .from(membership)
        .innerJoin(user, eq(user.id, membership.userId))
        .innerJoin(organization, eq(organization.id, membership.organizationId))
        .where(
          and(
            eq(membership.organizationId, organizationId),
            eq(membership.role, "owner"),
            eq(membership.status, "active"),
            isNull(user.deletedAt),
            isNull(organization.deletedAt),
          ),
        );

      return {
        ownerName: rows[0]?.orgName ?? "your organization",
        orgSlug: rows[0]?.orgSlug ?? null,
        mailboxes: rows.map((r) => ({
          userId: r.userId,
          email: r.email,
          name: r.name,
          locale: toEmailLocale(r.locale),
        })),
      };
    }

    if (accountId) {
      const rows = await this.db
        .select({ userId: user.id, email: user.email, name: user.name, locale: user.locale })
        .from(personalAccount)
        .innerJoin(user, eq(user.id, personalAccount.userId))
        .where(
          and(
            eq(personalAccount.id, accountId),
            isNull(user.deletedAt),
            isNull(personalAccount.deletedAt),
          ),
        );

      return {
        ownerName: rows[0]?.name ?? "your account",
        orgSlug: null,
        mailboxes: rows.map((r) => ({
          userId: r.userId,
          email: r.email,
          name: r.name,
          locale: toEmailLocale(r.locale),
        })),
      };
    }

    return { ownerName: "your account", orgSlug: null, mailboxes: [] };
  }
}
