/**
 * Dashboard DTO mirrors (etap 4, faza 3).
 *
 * Source of truth: `apps/api/src/dashboard/dashboard.service.ts`
 * (`DashboardSummary`, `DashboardTransactionRow`) + `openapi.yaml` tag
 * `dashboard`. Mirrored here (not imported) because the web app must never
 * import from `apps/api` — the only coupling is the HTTP contract.
 * Amounts are minor units; divide by 100 with the DTO currency when rendering.
 */
export interface DashboardSummary {
  currency: string;
  revenue: { totalMinor: number; previousMinor: number; deltaPct: number | null };
  subscriptions: { active: number; trialing: number; pastDue: number; canceled: number };
  payments: { paid: number; failed: number; refunded: number };
  monthlyRevenue: { month: string; minor: number }[];
  weeklyRevenue: { weekStart: string; minor: number }[];
  planBreakdown: { planId: string | null; count: number; minor: number }[];
}

export type TransactionStatus = "paid" | "failed" | "refunded";

export interface DashboardTransaction {
  id: string;
  amountMinor: number;
  currency: string;
  status: TransactionStatus;
  reason: string | null;
  createdAt: string;
}

export interface TransactionsPage {
  rows: DashboardTransaction[];
  page: number;
  hasNext: boolean;
}
