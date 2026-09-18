/**
 * Emails feature module (spec 10 — the email system).
 *
 * Faza 2.8: sending, rendering and delivery moved to Nest (`apps/api/src/
 * emails`, `onboarding`, `jobs` — one delivery path, retry, suppression and
 * List-Unsubscribe in one place each). What stays here is the UNSUBSCRIBE
 * surface the web still owns: the opt-out vocabulary (`categories`), the
 * signed links and their verification (`suppression`), and the form posting
 * to the thin `/api/unsubscribe` proxy (`components/unsubscribe-form`).
 */

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
