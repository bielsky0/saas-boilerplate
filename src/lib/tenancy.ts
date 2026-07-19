import { env } from "@/lib/env/server";

/**
 * Multi-tenancy mode (spec 1.4) — the single read point for MULTI_TENANCY_MODE.
 *
 * The flag is COSMETIC BY CONTRACT: it decides what the UI offers, never what the
 * data model supports. Every business row keeps its organization_id XOR account_id
 * owner (§1.3) in all three modes, every DAL query is byte-identical, and no mode
 * change writes or migrates a single row. Switching back on simply uncovers UI
 * that was already there.
 *
 * In "disabled" the sole tenant context is the personal account — which already
 * exists for every user (created by the auth adapter's user.create hook) and is
 * already a first-class owner everywhere. That is why this mode costs nothing:
 * it removes the ORG layer, not the tenant layer.
 *
 * ⚠️ Keep this module free of DB/Drizzle imports so it stays importable from
 * src/proxy.ts if route-level enforcement ever needs to move to the edge.
 */
export type TenancyMode = typeof env.MULTI_TENANCY_MODE;

/** Read once at module load (spec 1.4: "czytana raz przy starcie aplikacji"). */
export const TENANCY_MODE: TenancyMode = env.MULTI_TENANCY_MODE;

/**
 * Do org routes and org server actions function at all? False only in "disabled".
 *
 * Paired with `orgsExposed` rather than switching on TENANCY_MODE at each call
 * site: every surface answers one of exactly two questions — "does this exist?"
 * and "do we push it?" — and "optional" is precisely the row where those two
 * answers differ. Naming them makes the three-mode table checkable from grep.
 */
export const orgsEnabled = TENANCY_MODE !== "disabled";

/** Are orgs advertised in the MAIN flow (dashboard CTA, "New organization" item)? */
export const orgsExposed = TENANCY_MODE === "required";
