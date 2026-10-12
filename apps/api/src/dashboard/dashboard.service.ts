import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { billingPayment, subscription, toPaged, type Db } from "@repo/db";
import { DB } from "../db/db.module";
import { validationFailed } from "../common/http";
import type { RequestSession } from "../auth/auth-engine";
import { getOrCreatePersonalAccount } from "../tenancy/access";

/**
 * Personal revenue dashboard (etap 4, faza 3) — aggregates over the caller's
 * OWN personal account, never cross-tenant.
 *
 * Scope rule: every query below filters by the `accountId` resolved from the
 * session (`getOrCreatePersonalAccount`, same as billing's personal branch).
 * A business-wide overview would leak other tenants' figures to a plain user,
 * so there is deliberately no org-scoped variant here — org numbers live
 * behind org membership checks, not on this surface.
 *
 * Money rules (same as the admin revenue view):
 * - amounts are minor units, summed exactly, never floats;
 * - currencies are NEVER summed across each other: series and totals use the
 *   dominant currency (highest paid sum), other currencies are ignored rather
 *   than converted without an FX rate;
 * - empty account answers zeros/empty arrays, never 404.
 */

export const DASHBOARD_PAGE_SIZE = 10;

const transactionsQuerySchema = z.object({
  status: z.enum(["all", "paid", "failed", "refunded"]).catch("all"),
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
});

export interface DashboardTransactionRow {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
  reason: string | null;
  createdAt: Date;
}

export interface DashboardSummary {
  currency: string;
  revenue: { totalMinor: number; previousMinor: number; deltaPct: number | null };
  subscriptions: { active: number; trialing: number; pastDue: number; canceled: number };
  payments: { paid: number; failed: number; refunded: number };
  monthlyRevenue: { month: string; minor: number }[];
  weeklyRevenue: { weekStart: string; minor: number }[];
  planBreakdown: { planId: string | null; count: number; minor: number }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last `months` month keys (UTC), oldest first — gaps stay zero downstream. */
function fillMonths(months: number, now: Date): string[] {
  const keys: string[] = [];
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = months - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1))));
  }
  return keys;
}

/** Last `weeks` Monday dates (UTC, ISO day), oldest first. */
function fillWeeks(weeks: number, now: Date): string[] {
  const keys: string[] = [];
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS);
  for (let i = weeks - 1; i >= 0; i--) {
    keys.push(new Date(monday.getTime() - i * 7 * DAY_MS).toISOString().slice(0, 10));
  }
  return keys;
}

@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Db) {}

  private async personalAccountId(session: RequestSession): Promise<string> {
    return (await getOrCreatePersonalAccount(this.db, session.user.id)).id;
  }

  async getSummary(session: RequestSession, now = new Date()): Promise<DashboardSummary> {
    const accountId = await this.personalAccountId(session);

    const payments = await this.db
      .select({
        status: billingPayment.status,
        currency: billingPayment.currency,
        amount: billingPayment.amount,
        providerSubscriptionId: billingPayment.providerSubscriptionId,
        createdAt: billingPayment.createdAt,
      })
      .from(billingPayment)
      .where(eq(billingPayment.accountId, accountId));

    // Dominant currency = highest paid sum. Empties fall back to USD so the
    // DTO always names a currency for formatting.
    const paidByCurrency = new Map<string, number>();
    for (const p of payments) {
      if (p.status === "paid")
        paidByCurrency.set(p.currency, (paidByCurrency.get(p.currency) ?? 0) + p.amount);
    }
    const currency = [...paidByCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";

    const inCurrency = payments.filter((p) => p.currency === currency);
    const windowStart = new Date(now.getTime() - 30 * DAY_MS);
    const prevStart = new Date(now.getTime() - 60 * DAY_MS);
    const paidSum = (list: typeof inCurrency) =>
      list.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
    const totalMinor = paidSum(inCurrency.filter((p) => p.createdAt >= windowStart));
    const previousMinor = paidSum(
      inCurrency.filter((p) => p.createdAt >= prevStart && p.createdAt < windowStart),
    );

    const subs = await this.db
      .select({
        status: subscription.status,
        planId: subscription.planId,
        providerSubscriptionId: subscription.providerSubscriptionId,
      })
      .from(subscription)
      .where(eq(subscription.accountId, accountId));
    const countStatus = (s: string) => subs.filter((row) => row.status === s).length;

    const paidRows = inCurrency.filter((p) => p.status === "paid");
    const monthlyRevenue = fillMonths(6, now).map((month) => ({
      month,
      minor: paidRows
        .filter((p) => monthKey(p.createdAt) === month)
        .reduce((sum, p) => sum + p.amount, 0),
    }));
    const weeklyRevenue = fillWeeks(12, now).map((weekStart) => {
      const start = new Date(`${weekStart}T00:00:00.000Z`).getTime();
      return {
        weekStart,
        minor: paidRows
          .filter((p) => {
            const t = p.createdAt.getTime();
            return t >= start && t < start + 7 * DAY_MS;
          })
          .reduce((sum, p) => sum + p.amount, 0),
      };
    });

    // Plan breakdown: subscription counts per plan + paid sums correlated by
    // provider subscription id — the exact join key the schema documents
    // (rows are keyed per provider object, never merged across invoice/charge).
    const paidByProviderSub = new Map<string, number>();
    for (const p of paidRows) {
      if (p.providerSubscriptionId) {
        paidByProviderSub.set(
          p.providerSubscriptionId,
          (paidByProviderSub.get(p.providerSubscriptionId) ?? 0) + p.amount,
        );
      }
    }
    const plans = new Map<string | null, { count: number; minor: number }>();
    for (const s of subs) {
      const entry = plans.get(s.planId) ?? { count: 0, minor: 0 };
      entry.count += 1;
      if (s.providerSubscriptionId)
        entry.minor += paidByProviderSub.get(s.providerSubscriptionId) ?? 0;
      plans.set(s.planId, entry);
    }

    return {
      currency,
      revenue: {
        totalMinor,
        previousMinor,
        deltaPct: previousMinor === 0 ? null : ((totalMinor - previousMinor) / previousMinor) * 100,
      },
      subscriptions: {
        active: countStatus("active"),
        trialing: countStatus("trialing"),
        pastDue: countStatus("past_due"),
        canceled: countStatus("canceled"),
      },
      payments: {
        paid: payments.filter((p) => p.status === "paid").length,
        failed: payments.filter((p) => p.status === "failed").length,
        refunded: payments.filter((p) => p.status === "refunded").length,
      },
      monthlyRevenue,
      weeklyRevenue,
      planBreakdown: [...plans.entries()].map(([planId, v]) => ({ planId, ...v })),
    };
  }

  async listTransactions(
    session: RequestSession,
    query: unknown,
  ): Promise<{ rows: DashboardTransactionRow[]; page: number; hasNext: boolean }> {
    const q = transactionsQuerySchema.parse(query);
    const accountId = await this.personalAccountId(session);

    const filters = [eq(billingPayment.accountId, accountId)];
    if (q.status !== "all") filters.push(eq(billingPayment.status, q.status));

    const rows = await this.db
      .select({
        id: billingPayment.id,
        amountMinor: billingPayment.amount,
        currency: billingPayment.currency,
        status: billingPayment.status,
        reason: billingPayment.reason,
        createdAt: billingPayment.createdAt,
      })
      .from(billingPayment)
      .where(and(...filters))
      .orderBy(desc(billingPayment.createdAt))
      .limit(DASHBOARD_PAGE_SIZE + 1)
      .offset(q.page * DASHBOARD_PAGE_SIZE);

    return toPaged(rows, q.page, DASHBOARD_PAGE_SIZE);
  }
}

export function parseTransactionsQuery(query: unknown) {
  const parsed = transactionsQuerySchema.safeParse(query);
  if (!parsed.success) validationFailed(parsed.error);
  return parsed.data;
}
