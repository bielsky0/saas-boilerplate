/**
 * Email adapter (spec 1.2, 10.1 — pluggable transactional email).
 *
 * Second reference adapter alongside `src/lib/adapters/auth`. Feature code
 * imports the singleton `email` and the contract types; it never imports a
 * provider SDK. The concrete provider is chosen at startup by `EMAIL_PROVIDER`
 * (log/dev vs Resend). Templates + plain-text fallbacks live in `./templates`.
 */

import { env } from "@/lib/env/server";
import type { EmailAdapter } from "./contract";
import { logEmailAdapter } from "./log";
import { createResendEmailAdapter } from "./resend";

function createEmailAdapter(): EmailAdapter {
  switch (env.EMAIL_PROVIDER) {
    case "resend":
      return createResendEmailAdapter();
    case "log":
    default:
      return logEmailAdapter;
  }
}

export const email: EmailAdapter = createEmailAdapter();

export type { EmailAdapter, Recipient, TemplateName, TemplateData } from "./contract";
export { getOutbox, clearOutbox } from "./log";
export type { SentEmail } from "./log";
