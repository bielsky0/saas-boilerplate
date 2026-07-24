import { eq } from "drizzle-orm";

import type { ConnectAccountStatus } from "@/lib/adapters/billing";
import { organization } from "@/lib/db/schema";
import type { TenantDb } from "@/lib/db/tenant";
import { createLogger } from "@/lib/logger";

const log = createLogger("billing:connect");

/**
 * Stripe Connect-supported countries for Standard accounts (ISO 3166-1 alpha-2).
 * Sourced from https://stripe.com/docs/connect/supported-countries
 * Stripe rarely changes this list; updates are one commit when they do.
 */
export const SUPPORTED_CONNECT_COUNTRIES = [
  "AT", "AU", "BE", "BG", "CA", "CH", "CY", "CZ", "DE", "DK", "EE", "ES",
  "FI", "FR", "GB", "GR", "HK", "HR", "HU", "IE", "IT", "JP", "LT", "LU",
  "LV", "MT", "MY", "NL", "NO", "NZ", "PL", "PT", "RO", "SE", "SG", "SI",
  "SK", "US",
] as const;

export type SupportedCountry = (typeof SUPPORTED_CONNECT_COUNTRIES)[number];

export function isSupportedCountry(value: string): value is SupportedCountry {
  return (SUPPORTED_CONNECT_COUNTRIES as readonly string[]).includes(value);
}

/**
 * Read the Connect account status for an organization.
 */
export async function getOrgConnectStatus(tx: TenantDb, orgId: string) {
  const [row] = await tx
    .select({
      country: organization.country,
      stripeConnectAccountId: organization.stripeConnectAccountId,
      stripeConnectStatus: organization.stripeConnectStatus,
      stripeConnectChargesEnabled: organization.stripeConnectChargesEnabled,
      stripeConnectPayoutsEnabled: organization.stripeConnectPayoutsEnabled,
      stripeConnectConnectedAt: organization.stripeConnectConnectedAt,
    })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  return row ?? null;
}

/**
 * Update the Connect account ID after successful onboarding link creation.
 * Called once, before the webhook confirms the account.
 */
export async function setConnectAccountId(
  tx: TenantDb,
  orgId: string,
  accountId: string,
): Promise<void> {
  await tx
    .update(organization)
    .set({
      stripeConnectAccountId: accountId,
      stripeConnectStatus: "onboarding_incomplete",
      updatedAt: new Date(),
    })
    .where(eq(organization.id, orgId));
}

/**
 * Update Connect status fields from a webhook event.
 * This is the ONLY way status should change — never from a redirect.
 */
export async function updateConnectStatus(
  tx: TenantDb,
  orgId: string,
  status: ConnectAccountStatus,
  chargesEnabled: boolean,
  payoutsEnabled: boolean,
): Promise<void> {
  // Common fields for every status update.
  const base = {
    stripeConnectStatus: status,
    stripeConnectChargesEnabled: chargesEnabled,
    stripeConnectPayoutsEnabled: payoutsEnabled,
    updatedAt: new Date(),
  };

  if (status === "active") {
    await tx
      .update(organization)
      .set({ ...base, stripeConnectConnectedAt: new Date() })
      .where(eq(organization.id, orgId));
    return;
  }

  if (status === "not_connected") {
    await tx
      .update(organization)
      .set({
        stripeConnectStatus: status,
        stripeConnectChargesEnabled: false,
        stripeConnectPayoutsEnabled: false,
        stripeConnectAccountId: null,
        stripeConnectConnectedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(organization.id, orgId));
    return;
  }

  // onboarding_incomplete, restricted, disabled: update status + booleans only.
  await tx
    .update(organization)
    .set(base)
    .where(eq(organization.id, orgId));
}

/**
 * Save the organization's country for Stripe Connect.
 * Called when user picks a country during the Connect onboarding flow.
 */
export async function setOrgCountry(
  tx: TenantDb,
  orgId: string,
  country: string,
): Promise<void> {
  await tx
    .update(organization)
    .set({ country, updatedAt: new Date() })
    .where(eq(organization.id, orgId));
}
