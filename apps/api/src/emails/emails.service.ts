import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { EmailAdapter, TemplateName, TemplateProps } from "@repo/contracts";
import { emailSuppression, type Db } from "@repo/db";
import type { Locale } from "@repo/i18n-core";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { insertJob, type EnqueueOptions, type QueueWriter } from "../jobs/queue";
import { kickDrain } from "../jobs/runner";
import { categoryFor, TEMPLATE_CATEGORY, type SuppressibleCategory } from "./categories";
import { createLogEmailAdapter } from "./log";
import { createResendEmailAdapter } from "./resend";
import { unsubscribeHeaders, unsubscribeUrl, type SuppressionConfig } from "./suppression";
import { toEmailLocale } from "./translator";

/**
 * Email delivery (spec 10) — the Nest port of the web app's
 * `features/emails/{send,handler,data}.ts` + `lib/adapters/email/index.ts`.
 *
 * THE one delivery path: feature code calls `enqueueEmail`, never the
 * adapter's `send` directly. The `email.send` job handler below is the only
 * place `send` runs, which keeps retry, suppression and List-Unsubscribe in
 * one file each.
 *
 * Two checks, two moments: the enqueue-time suppression read is an
 * OPTIMIZATION (keeps junk rows out); the handler's send-time check is the
 * GUARANTEE (a day-7 job enqueued on day 0 cannot know about a day-2
 * opt-out). If the first is ever wrong or skipped, nothing breaks.
 */

/**
 * `unsubscribeUrl` is omitted from what the caller supplies: only the handler
 * can build it, because only it knows the address at send time and holds the
 * signing secret. `Omit` is a no-op for transactional templates.
 */
export type EnqueueEmailData<N extends TemplateName> = Omit<TemplateProps[N], "unsubscribeUrl">;

export interface EmailRecipient {
  to: string;
  name?: string;
  locale: Locale;
}

/**
 * jsonb round-trips are UNTYPED — whatever the enqueue-side types claimed,
 * this is what actually came back out of the database. Parse, don't trust.
 *
 * `locale` is OPTIONAL HERE, REQUIRED AT ENQUEUE: rows written by an older
 * deploy have no `locale`, and demanding one would dead-letter every in-flight
 * email on deploy. `z.string()` narrowed by `toEmailLocale`, not an enum: a
 * row written when `fr` was supported must still send after `fr` is dropped.
 */
const emailJobSchema = z.object({
  template: z.string().refine((t): t is TemplateName => t in TEMPLATE_CATEGORY, {
    message: "Unknown email template",
  }),
  data: z.record(z.string(), z.unknown()),
  to: z.email(),
  name: z.string().optional(),
  locale: z.string().optional(),
});

@Injectable()
export class EmailsService {
  private readonly log = new Logger("EmailsService");
  private adapter: EmailAdapter | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  /** Links + secrets every suppression helper needs (one place, from config). */
  suppressionConfig(): SuppressionConfig {
    return {
      unsubscribeSecret: this.config.EMAIL_UNSUBSCRIBE_SECRET,
      authSecret: this.config.BETTER_AUTH_SECRET,
      webAppUrl: this.config.NEXT_PUBLIC_APP_URL,
      apiUrl: this.config.BETTER_AUTH_URL,
    };
  }

  private transport(): EmailAdapter {
    if (!this.adapter) {
      const links = { appUrl: this.config.NEXT_PUBLIC_APP_URL };
      this.adapter =
        this.config.EMAIL_PROVIDER === "resend"
          ? createResendEmailAdapter(this.config.RESEND_API_KEY, this.config.EMAIL_FROM, links)
          : createLogEmailAdapter(links);
    }
    return this.adapter;
  }

  /**
   * Queue an email. Pass a transaction as `writer` to make the send atomic
   * with a business write: on rollback the email is un-sent, because it was
   * never more than a row.
   */
  async enqueueEmail<N extends TemplateName>(
    writer: QueueWriter,
    template: N,
    data: EnqueueEmailData<N>,
    recipient: EmailRecipient,
    options?: EnqueueOptions,
  ): Promise<void> {
    const category = categoryFor(template);
    if (category !== "transactional" && (await this.isSuppressed(recipient.to, category))) {
      return;
    }
    await insertJob(
      writer,
      "email.send",
      {
        template,
        data: data as Record<string, unknown>,
        to: recipient.to,
        ...(recipient.name ? { name: recipient.name } : {}),
        // Captured NOW, because now is the last moment anyone knows. The
        // drain that renders this has no request to ask, and for a §10.3 step
        // it runs a week from here.
        locale: recipient.locale,
      },
      options,
    );
    kickDrain();
  }

  /**
   * The `email.send` job handler — the ONLY place the adapter's `send` runs.
   * Everything policy-shaped happens here, exactly once, for every message.
   */
  async handleEmailSend(payload: unknown): Promise<void> {
    const p = emailJobSchema.parse(payload);
    const category = categoryFor(p.template);
    const locale = toEmailLocale(p.locale);

    if (category === "transactional") {
      // No suppression check and no List-Unsubscribe: this mail is not
      // optional and must never be silenced.
      await this.transport().send(p.template, p.data, {
        to: p.to,
        ...(p.name ? { name: p.name } : {}),
        locale,
      });
      return;
    }

    // THE GUARANTEE (spec 10.3): evaluated at the moment of delivery, the
    // only moment whose answer is correct.
    if (await this.isSuppressed(p.to, category)) {
      // A no-op is a SUCCESSFUL outcome, not a failure: retrying would never
      // change the answer, and dead-lettering would fill the queue with red
      // rows recording the system working correctly.
      this.log.log(`suppressed to=${p.to} template=${p.template} category=${category}`);
      return;
    }

    await this.transport().send(
      p.template,
      // Injected here rather than at enqueue: the link is derived from the
      // address and the signing secret, neither of which a caller should
      // handle, and it must not sit in `job.payload` longer than necessary.
      { ...p.data, unsubscribeUrl: unsubscribeUrl(p.to, category, this.suppressionConfig()) },
      { to: p.to, ...(p.name ? { name: p.name } : {}), locale },
      { headers: unsubscribeHeaders(p.to, category, this.suppressionConfig()) },
    );
  }

  /**
   * Is this address opted out of this category? `"all"` suppresses everything
   * suppressible — one query, both rows. Never asked about transactional mail:
   * `SuppressibleCategory` excludes it, so the question is unrepresentable.
   */
  async isSuppressed(email: string, category: SuppressibleCategory): Promise<boolean> {
    const [row] = await this.db
      .select({ id: emailSuppression.id })
      .from(emailSuppression)
      .where(
        and(
          eq(emailSuppression.email, email.toLowerCase()),
          inArray(emailSuppression.category, [category, "all"]),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * Record an opt-out. Idempotent: clicking unsubscribe twice, or a mail
   * client re-issuing the one-click POST, is not an error.
   */
  async suppress(
    email: string,
    category: SuppressibleCategory,
    reason: "unsubscribe" | "bounce" | "complaint" | "admin" = "unsubscribe",
  ): Promise<void> {
    await this.db
      .insert(emailSuppression)
      .values({ email: email.toLowerCase(), category, reason })
      .onConflictDoNothing({
        target: [emailSuppression.email, emailSuppression.category],
      });
  }
}
