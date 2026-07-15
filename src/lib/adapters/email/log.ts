import type { EmailAdapter, Recipient, TemplateData, TemplateName } from "./contract";
import { renderTemplate } from "./templates";

/**
 * Dev/CI email adapter (spec 10.1). Instead of sending, it renders the template
 * and records it in an in-process outbox, and prints the message (including any
 * verification link) to the server console.
 *
 * The outbox is the mechanism E2E tests use to retrieve the verification link:
 * `sendVerificationEmail` and the test-only route `/api/dev/emails` run in the
 * same server process, so a module-level array is visible to both. It is cached
 * on `globalThis` so Next.js hot-reload does not drop captured messages.
 */

export interface SentEmail {
  template: TemplateName;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extracted verification/action link when the template carries one. */
  url?: string;
  sentAt: string;
}

const globalForOutbox = globalThis as unknown as { emailOutbox: SentEmail[] | undefined };

const outbox: SentEmail[] = (globalForOutbox.emailOutbox ??= []);

/** Latest-first snapshot of sent emails, optionally filtered by recipient. */
export function getOutbox(to?: string): SentEmail[] {
  const all = [...outbox].reverse();
  return to ? all.filter((m) => m.to.toLowerCase() === to.toLowerCase()) : all;
}

/** Test helper: clear captured emails. */
export function clearOutbox(): void {
  outbox.length = 0;
}

export const logEmailAdapter: EmailAdapter = {
  async send(template: TemplateName, data: TemplateData, recipient: Recipient): Promise<void> {
    const rendered = renderTemplate(template, data);
    const url = typeof data.url === "string" ? data.url : undefined;
    outbox.push({
      template,
      to: recipient.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      url,
      sentAt: new Date().toISOString(),
    });
    console.log(
      `\n[email:log] to=${recipient.to} template=${template} subject="${rendered.subject}"` +
        (url ? `\n[email:log] link=${url}\n` : "\n"),
    );
  },
};
