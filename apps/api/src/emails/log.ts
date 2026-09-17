import type {
  EmailAdapter,
  Recipient,
  SendOptions,
  TemplateData,
  TemplateName,
} from "@repo/contracts";
import { renderTemplate, type TemplateLinks } from "./templates";

/**
 * Dev/CI email adapter (spec 10.1) — the Nest twin of web's
 * `src/lib/adapters/email/log.ts`.
 *
 * Instead of sending, it renders the template and records it in an in-process
 * outbox, and prints the message (including any action link) to the server
 * console. The outbox is what the E2E suite reads via `/v1/dev/emails` — the
 * send and the dev route run in the same API process, so a module-level array
 * is visible to both. Cached on `globalThis` so a watcher restart does not
 * drop captured messages.
 */

export interface SentEmail {
  template: TemplateName;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extracted verification/action link when the template carries one. */
  url?: string;
  /** Recorded so tests can assert List-Unsubscribe presence/absence (spec 10.3). */
  headers?: Record<string, string>;
  sentAt: string;
}

const globalForOutbox = globalThis as unknown as {
  emailOutbox: SentEmail[] | undefined;
  emailFailures: Map<string, number> | undefined;
};

const outbox: SentEmail[] = (globalForOutbox.emailOutbox ??= []);

/**
 * Pending forced failures, per address.
 *
 * Keyed on the ADDRESS rather than a global switch: the suite boots ONE
 * server, so a global flag would break every concurrently-running test. Each
 * test mints a unique address, so the blast radius is exactly one test.
 */
const failures: Map<string, number> = (globalForOutbox.emailFailures ??= new Map());

/** Latest-first snapshot of sent emails, optionally filtered by recipient. */
export function getOutbox(to?: string): SentEmail[] {
  const all = [...outbox].reverse();
  return to ? all.filter((m) => m.to.toLowerCase() === to.toLowerCase()) : all;
}

/**
 * Test seam (spec 14.1): make the next `times` sends to `address` throw, as a
 * provider outage would, so the queue's retry/backoff is observable in CI.
 * Lives in the log adapter — the dev/CI-only implementation — and is
 * therefore unreachable when EMAIL_PROVIDER=resend.
 */
export function failFor(address: string, times: number): void {
  const key = address.toLowerCase();
  if (times <= 0) failures.delete(key);
  else failures.set(key, times);
}

/** Test helper: how many forced failures remain for an address. */
export function pendingFailures(address: string): number {
  return failures.get(address.toLowerCase()) ?? 0;
}

export function createLogEmailAdapter(links: TemplateLinks): EmailAdapter {
  return {
    async send(
      template: TemplateName,
      data: TemplateData,
      recipient: Recipient,
      options?: SendOptions,
    ): Promise<void> {
      const key = recipient.to.toLowerCase();
      const remaining = failures.get(key) ?? 0;
      if (remaining > 0) {
        // Decrement BEFORE throwing, so `failFor(to, 1)` fails exactly once
        // and the retry succeeds — the shape the retry test asserts.
        if (remaining === 1) failures.delete(key);
        else failures.set(key, remaining - 1);
        throw new Error(`[email:log] simulated provider failure for ${recipient.to}`);
      }

      const rendered = await renderTemplate(template, data, recipient.locale, links);
      const url = typeof data["url"] === "string" ? data["url"] : undefined;
      outbox.push({
        template,
        to: recipient.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        url,
        headers: options?.headers,
        sentAt: new Date().toISOString(),
      });
      console.log(
        `\n[email:log] to=${recipient.to} template=${template} subject="${rendered.subject}"` +
          (url ? `\n[email:log] link=${url}\n` : "\n"),
      );
    },
  };
}
