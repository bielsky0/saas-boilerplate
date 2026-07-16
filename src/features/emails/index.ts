/**
 * Emails feature module (spec 10 — the email system).
 *
 * Owns everything policy-shaped about email: which templates may be opted out of
 * (`categories`), the opt-out ledger and its signed links (`suppression`, `data`),
 * and the single door feature code sends through (`send`). Rendering and delivery
 * belong to the adapter in `src/lib/adapters/email`, which stays dumb transport.
 *
 * THE RULE: feature code calls `enqueueEmail`, never `email.send`. Every message is
 * a queued job, and `./handler` is the one place that delivers — which is what
 * keeps retry (§12.2), send-time suppression (§10.3) and List-Unsubscribe headers
 * in one file each instead of at every trigger site.
 */

export { enqueueEmail } from "./send";
export type { EnqueueEmailData, EnqueueEmailOptions } from "./send";
export { emailSendHandler } from "./handler";
export {
  SUPPRESSIBLE_CATEGORIES,
  TEMPLATE_CATEGORY,
  categoryFor,
  isSuppressibleCategory,
} from "./categories";
export type { EmailCategory, SuppressibleCategory } from "./categories";
export {
  unsubscribeHeaders,
  unsubscribeUrl,
  unsubscribePostUrl,
  verifyUnsubscribeToken,
} from "./suppression";
export type { UnsubscribeToken } from "./suppression";
export { isSuppressed, suppress } from "./data";
export { unsubscribeAction } from "./actions";
export type { UnsubscribeState } from "./actions";
export { UnsubscribeForm } from "./components/unsubscribe-form";
