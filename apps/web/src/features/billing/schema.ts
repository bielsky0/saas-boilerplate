import { z } from "zod";

import { optionalSlugParam } from "@/lib/validation/primitives";
import { PLAN_IDS } from "./plans";

/**
 * Billing request schemas (spec 22.2 — validation before business logic).
 *
 * Shared vocabulary with storage: `slug` present → organization context, absent →
 * the caller's personal account. Reusing `optionalSlugParam` rather than a local
 * `z.string()` is what keeps "" and junk from reaching the owner resolver.
 */

/**
 * `plan` is constrained to the configured plan ids, so an unknown plan is a 422
 * at the boundary rather than a null deref deeper in. Whether the plan is
 * actually PURCHASABLE (has a price id in this environment) is a separate
 * question answered by `purchasablePlan` — a valid id with no price is a 404, not
 * a malformed request.
 */
export const checkoutInputSchema = z.object({
  slug: optionalSlugParam,
  plan: z.enum(PLAN_IDS),
});

export const portalInputSchema = z.object({
  slug: optionalSlugParam,
});

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
export type PortalInput = z.infer<typeof portalInputSchema>;
