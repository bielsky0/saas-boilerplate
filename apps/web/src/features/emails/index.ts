/**
 * Emails feature module (spec 10 — the email system).
 *
 * Faza 2.8: sending, rendering and delivery moved to Nest (`apps/api/src/
 * emails`, `onboarding`, `jobs` — one delivery path, retry, suppression and
 * List-Unsubscribe in one place each). What stays here is the UNSUBSCRIBE
 * surface the web still owns: the opt-out vocabulary (`categories`), the
 * signed page links and their verification (`suppression`), and the form
 * posting directly to the main API (`components/unsubscribe-form`).
 */

export {
  SUPPRESSIBLE_CATEGORIES,
  TEMPLATE_CATEGORY,
  categoryFor,
  isSuppressibleCategory,
} from "./categories";
export type { EmailCategory, SuppressibleCategory } from "./categories";
export { unsubscribeUrl, verifyUnsubscribeToken } from "./suppression";
