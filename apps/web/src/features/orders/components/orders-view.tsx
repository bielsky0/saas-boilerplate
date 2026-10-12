"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  CalendarX2Icon,
  DollarSignIcon,
  ReceiptTextIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  TruckIcon,
  UsersIcon,
} from "lucide-react";

import { Alert } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardSummary } from "../hooks/use-dashboard-summary";
import ProductInsightsCard from "./product-insights";
import SalesMetricsCard from "./sales-metrics";
import StatisticsCard from "./statistics-card";
import TotalEarningCard from "./total-earning";
import { TransactionsTable } from "./transactions-table";

/**
 * Orders dashboard view (etap 4, faza 3). Client composition over the Nest
 * summary DTO: statistics, earning, sales metrics with charts, and the
 * transactions table. Layout mirrors AdminCN's orders page; every figure
 * comes from `useDashboardSummary` / `useTransactions` — no constants.
 */
export function OrdersView({ userName, userEmail }: { userName: string; userEmail: string }) {
  const t = useTranslations("dashboard.orders");
  const locale = useLocale();
  const { data, isLoading, isError } = useDashboardSummary();

  const formatMoney = (minor: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-6 lg:grid-cols-3"
        aria-busy="true"
        aria-label={t("loading")}
      >
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="col-span-2 h-32 sm:col-span-1" />
        ))}
        <Skeleton className="col-span-full h-96" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Alert role="alert" variant="warning" data-testid="orders-error">
        {t("error")}
      </Alert>
    );
  }

  const money = (minor: number) => formatMoney(minor, data.currency);
  const delta = data.revenue.deltaPct;
  const deltaLine =
    delta === null
      ? t("stats.noBaseline")
      : t("stats.vsPrevious", { pct: `${delta >= 0 ? "+" : ""}${Math.round(delta * 10) / 10}%` });
  const totalPayments = data.payments.paid + data.payments.failed + data.payments.refunded;
  const successRate =
    totalPayments === 0 ? 0 : Math.round((data.payments.paid / totalPayments) * 100);

  const statistics = [
    {
      icon: <TruckIcon className="size-4" />,
      value: money(data.revenue.totalMinor),
      title: t("stats.revenue"),
      changeLine: deltaLine,
    },
    {
      icon: <TriangleAlertIcon className="size-4" />,
      value: String(data.subscriptions.active),
      title: t("stats.activeSubs"),
      changeLine: t("stats.trialing", { count: data.subscriptions.trialing }),
    },
    {
      icon: <CalendarX2Icon className="size-4" />,
      value: String(data.payments.paid),
      title: t("stats.paidPayments"),
      changeLine: t("stats.failed", { count: data.payments.failed }),
    },
  ];

  const metrics = [
    {
      icon: <TrendingUpIcon className="size-5" />,
      title: t("metrics.successRate"),
      value: `${successRate}%`,
    },
    {
      icon: <DollarSignIcon className="size-5" />,
      title: t("metrics.totalRevenue"),
      value: money(data.revenue.totalMinor),
    },
    {
      icon: <UsersIcon className="size-5" />,
      title: t("metrics.activeSubs"),
      value: String(data.subscriptions.active),
    },
    {
      icon: <ReceiptTextIcon className="size-5" />,
      title: t("metrics.payments"),
      value: String(totalPayments),
    },
  ];

  const pieFills = [
    "var(--primary)",
    "color-mix(in oklab, var(--primary) 60%, transparent)",
    "color-mix(in oklab, var(--primary) 20%, transparent)",
  ];
  const revenueSegments = data.planBreakdown.map((plan, i) => ({
    name: plan.planId ?? t("metrics.unmappedPlan"),
    value: plan.minor,
    fill: pieFills[i % pieFills.length] ?? pieFills[0]!,
  }));

  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    if (y === undefined || m === undefined) return key;
    return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
  };

  const maxPlanMinor = Math.max(1, ...data.planBreakdown.map((p) => p.minor));

  return (
    <div className="grid grid-cols-2 gap-6 lg:grid-cols-3" data-testid="orders-view">
      <div className="col-span-full grid gap-6 sm:grid-cols-3 md:max-lg:grid-cols-1">
        {statistics.map((card) => (
          <StatisticsCard
            key={card.title}
            icon={card.icon}
            title={card.title}
            value={card.value}
            changeLine={card.changeLine}
          />
        ))}
      </div>

      <div className="grid gap-6 max-xl:col-span-full lg:max-xl:grid-cols-2">
        <ProductInsightsCard
          className="justify-between gap-3 *:data-[slot=card-content]:space-y-5"
          subtitle={t("insights.subtitle", {
            from: monthLabel(data.monthlyRevenue[0]?.month ?? ""),
            to: monthLabel(data.monthlyRevenue[data.monthlyRevenue.length - 1]?.month ?? ""),
          })}
          primary={{
            title: t("insights.monthly"),
            value: money(data.monthlyRevenue.reduce((s, b) => s + b.minor, 0)),
            series: {
              label: t("insights.monthly"),
              color: "var(--primary)",
              data: data.monthlyRevenue.map((b) => ({
                label: monthLabel(b.month),
                value: b.minor,
              })),
            },
          }}
          secondary={{
            title: t("insights.weekly"),
            value: money(data.weeklyRevenue.reduce((s, b) => s + b.minor, 0)),
            series: {
              label: t("insights.weekly"),
              color: "color-mix(in oklab, var(--primary) 30%, transparent)",
              data: data.weeklyRevenue.map((b) => ({
                label: b.weekStart.slice(5),
                value: b.minor,
              })),
            },
          }}
        />

        <TotalEarningCard
          title={t("earning.title")}
          earning={money(data.revenue.totalMinor)}
          trend={delta !== null && delta < 0 ? "down" : "up"}
          percentage={delta === null ? 0 : Math.abs(Math.round(delta * 10) / 10)}
          comparisonText={t("earning.comparison")}
          earningData={data.planBreakdown.map((plan) => ({
            platform: plan.planId ?? t("metrics.unmappedPlan"),
            technologies: t("earning.subscriptions", { count: plan.count }),
            earnings: money(plan.minor),
            progressPercentage: Math.round((plan.minor / maxPlanMinor) * 100),
          }))}
          className="justify-between gap-5 sm:min-w-0"
        />
      </div>

      <SalesMetricsCard
        className="col-span-full *:data-[slot=card-content]:space-y-6 xl:col-span-2"
        companyName={userName}
        companyEmail={userEmail}
        metrics={metrics}
        revenueTotal={money(data.revenue.totalMinor)}
        revenuePct={successRate}
        revenueSegments={revenueSegments}
        salesPlanPct={successRate}
        salesBars={data.weeklyRevenue.map((b) => b.minor)}
      />

      <Card className="col-span-full w-full py-0">
        <TransactionsTable customerName={userName} customerEmail={userEmail} />
      </Card>
    </div>
  );
}
