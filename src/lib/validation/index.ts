/**
 * The validation layer (spec 22.2).
 *
 * Validation in this app is a NAMED LAYER, not a habit: every input that crosses
 * the trust boundary — a form post, a JSON body, a query string, a server action
 * argument — passes a zod schema before any business logic or authorization side
 * effect runs. This module owns the shared parts of that: the result shape
 * (`./state`), the HTTP envelope (`./http`), and the wire vocabulary
 * (`./primitives`). The RULES stay in each feature's `schema.ts`.
 *
 * See "Add a validated endpoint or action" in docs/ARCHITECTURE.md for the
 * pattern, and the deferral bullet beside it for what is not covered yet.
 *
 * ⚠️ `./http` is deliberately NOT re-exported here. It imports `next/server`,
 * and this barrel is imported by client form components for `FormState`. Same
 * rule as `features/organizations/index.ts`: the barrel carries only isomorphic
 * pieces, server-only modules are imported by path (`@/lib/validation/http`).
 */
export { type FormState, invalid } from "./state";
export {
  SLUG_PATTERN,
  SLUG_MIN,
  SLUG_MAX,
  slugParam,
  optionalSlugParam,
  idParam,
  SUBDOMAIN_PATTERN,
  SUBDOMAIN_MIN,
  SUBDOMAIN_MAX,
  RESERVED_SUBDOMAINS,
  subdomainParam,
} from "./primitives";
