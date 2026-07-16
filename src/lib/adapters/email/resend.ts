import { Resend } from "resend";

import { env } from "@/lib/env/server";
import type { EmailAdapter, Recipient, SendOptions, TemplateData, TemplateName } from "./contract";
import { renderTemplate } from "./templates";

/**
 * Resend email adapter (spec 10.1) — the ONLY file importing the `resend` SDK.
 * Selected via `EMAIL_PROVIDER=resend`. Constructed lazily by the factory so a
 * missing key only fails when this provider is actually chosen.
 */
export function createResendEmailAdapter(): EmailAdapter {
  if (!env.RESEND_API_KEY) {
    throw new Error(
      "EMAIL_PROVIDER=resend requires RESEND_API_KEY. Set it or use EMAIL_PROVIDER=log.",
    );
  }
  const resend = new Resend(env.RESEND_API_KEY);

  return {
    async send(
      template: TemplateName,
      data: TemplateData,
      recipient: Recipient,
      options?: SendOptions,
    ): Promise<void> {
      const rendered = await renderTemplate(template, data);
      const { error } = await resend.emails.send({
        from: env.EMAIL_FROM,
        to: recipient.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(options?.headers ? { headers: options.headers } : {}),
      });
      // Throwing is deliberate and load-bearing: it is how the job queue learns to
      // retry with backoff (spec 12.2). Do not soften this into a logged warning —
      // that turns a transient outage into permanent silent loss.
      if (error) {
        throw new Error(`Resend failed to send "${template}" to ${recipient.to}: ${error.message}`);
      }
    },
  };
}
