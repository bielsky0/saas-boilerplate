import { Resend } from "resend";

import type {
  EmailAdapter,
  Recipient,
  SendOptions,
  TemplateData,
  TemplateName,
} from "@repo/contracts";
import { renderTemplate, type TemplateLinks } from "./templates";

/**
 * Resend email adapter (spec 10.1) — the Nest twin of web's
 * `src/lib/adapters/email/resend.ts`. The ONLY file importing the `resend`
 * SDK. Selected via `EMAIL_PROVIDER=resend`.
 */
export function createResendEmailAdapter(
  apiKey: string | undefined,
  from: string,
  links: TemplateLinks,
): EmailAdapter {
  if (!apiKey) {
    throw new Error(
      "EMAIL_PROVIDER=resend requires RESEND_API_KEY. Set it or use EMAIL_PROVIDER=log.",
    );
  }
  const resend = new Resend(apiKey);

  return {
    async send(
      template: TemplateName,
      data: TemplateData,
      recipient: Recipient,
      options?: SendOptions,
    ): Promise<void> {
      const rendered = await renderTemplate(template, data, recipient.locale, links);
      const { error } = await resend.emails.send({
        from,
        to: recipient.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(options?.headers ? { headers: options.headers } : {}),
      });
      // Throwing is deliberate and load-bearing: it is how the job queue
      // learns to retry with backoff (spec 12.2). Do not soften this into a
      // logged warning — that turns a transient outage into permanent silent
      // loss.
      if (error) {
        throw new Error(`Resend failed to send "${template}" to ${recipient.to}: ${error.message}`);
      }
    },
  };
}
