import type { JobWriter } from "@/lib/adapters/jobs";
import type { Recipient, TemplateName, TemplateProps } from "@/lib/adapters/email";
import { enqueueJob } from "@/features/jobs/enqueue";
import { categoryFor } from "./categories";
import { isSuppressed } from "./data";

/**
 * The ONE way feature code sends email (spec 10, 12).
 *
 * Nothing outside `./handler.ts` may call `email.send` directly. Every message in
 * the app is a queued job, which is what buys retry with backoff (§12.2),
 * send-time suppression (§10.3), and List-Unsubscribe headers in ONE place rather
 * than at each of the eight trigger sites.
 */

/**
 * `unsubscribeUrl` is omitted from what the caller supplies: only the handler can
 * build it, because only it knows the address at send time and holds the signing
 * secret. `Omit` is a no-op for transactional templates, which have no such prop.
 */
export type EnqueueEmailData<N extends TemplateName> = Omit<TemplateProps[N], "unsubscribeUrl">;

export interface EnqueueEmailOptions {
  /**
   * Makes the send exactly-once for a given cause. Strongly recommended for
   * anything whose trigger can fire twice — see the callers in features/billing
   * and features/onboarding.
   */
  dedupeKey?: string;
  /** Schedule the send for later (the §10.3 sequence). */
  runAt?: Date;
}

/**
 * Queue an email.
 *
 * Pass a transaction as `writer` to make the send atomic with a business write:
 * if the transaction rolls back, the email is un-sent, because it was never more
 * than a row. That is the property `features/billing/webhooks.ts` depends on.
 */
export async function enqueueEmail<N extends TemplateName>(
  writer: JobWriter,
  template: N,
  data: EnqueueEmailData<N>,
  recipient: Recipient,
  options?: EnqueueEmailOptions,
): Promise<void> {
  const category = categoryFor(template);

  // An OPTIMIZATION, not the guarantee: it keeps junk rows out of the queue for
  // an already-unsubscribed address. The check that actually matters runs in the
  // handler at send time — a job scheduled today for day 7 cannot possibly know
  // about an unsubscribe that happens on day 2. If this check is ever wrong or
  // skipped, nothing breaks.
  if (category !== "transactional" && (await isSuppressed(recipient.to, category))) {
    return;
  }

  await enqueueJob(
    writer,
    "email.send",
    {
      template,
      data: data as Record<string, unknown>,
      to: recipient.to,
      ...(recipient.name ? { name: recipient.name } : {}),
      // Captured NOW, because now is the last moment anyone knows. The drain that
      // renders this has no request to ask, and for a §10.3 step it runs a week
      // from here. See JobPayloads["email.send"].
      locale: recipient.locale,
    },
    options,
  );
}
