import { eq } from "drizzle-orm";

import type { ConnectEvent } from "@/lib/adapters/billing";
import { organization } from "@/lib/db/schema";
import { withSystemBypass } from "@/lib/db/system";
import { createLogger } from "@/lib/logger";
import { updateConnectStatus } from "./connect-data";

const log = createLogger("billing:connect:webhook");

export type ConnectProcessResult =
  | { status: "processed" }
  | { status: "unknown_account" };

/**
 * Find an organization by its connected Stripe account id.
 *
 * BYPASS: the account id arrives on an unauthenticated webhook from outside;
 * nothing in it names a tenant until this row maps it to one. Same pattern
 * as `findBillingCustomer` in `./cross-tenant.ts`.
 */
async function findOrgByConnectAccountId(accountId: string) {
  return withSystemBypass(
    "connect webhook — owner unknown until the acct_ id resolves",
    async (tx) => {
      const [row] = await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.stripeConnectAccountId, accountId))
        .limit(1);
      return row ?? null;
    },
  );
}

/**
 * Process one verified Connect event.
 *
 * Unlike the platform billing webhook, Connect events have no idempotency
 * marker table. account.updated is a state-sync signal, not a transactional
 * event — Stripe may send it many times. The UPDATE is idempotent by nature:
 * applying the same status twice changes nothing.
 */
export async function processConnectEvent(
  event: ConnectEvent,
): Promise<ConnectProcessResult> {
  const org = await findOrgByConnectAccountId(event.accountId);
  if (!org) {
    log.warn("ignoring Connect event for unknown account", {
      event: event.id,
      type: event.type,
      account: event.accountId,
    });
    return { status: "unknown_account" };
  }

  // Write via system bypass: the webhook has no user session, and the
  // organization's RLS policy does not apply to unauthenticated requests.
  await withSystemBypass(
    "connect webhook — no user session, RLS does not apply",
    async (tx) => {
      await updateConnectStatus(
        tx,
        org.id,
        event.status,
        event.chargesEnabled,
        event.payoutsEnabled,
      );
    },
  );

  log.info("processed Connect event", {
    event: event.id,
    type: event.type,
    account: event.accountId,
    orgId: org.id,
    status: event.status,
  });

  return { status: "processed" };
}
