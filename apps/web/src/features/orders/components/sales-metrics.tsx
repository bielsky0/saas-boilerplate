"use client";

// Third-party Imports
import { Bar, BarChart, Label, Pie, PieChart } from "recharts";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

// Component Imports
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

/**
 * Sales metrics card (etap 4, faza 3). Layout ported from AdminCN's
 * `chart-sales-metrics`; every number/series is a prop from the Nest summary
 * DTO — the hardcoded "Sandy' Company", fixed 54%/56% and inline series are
 * gone.
 */
export type MetricTile = { icon: ReactNode; title: string; value: string };
export type RevenueSegment = { name: string; value: number; fill: string };

const SalesMetricsCard = ({
  companyName,
  companyEmail,
  metrics,
  revenueTotal,
  revenuePct,
  revenueSegments,
  salesPlanPct,
  salesBars,
  className,
}: {
  companyName: string;
  companyEmail: string;
  metrics: MetricTile[];
  revenueTotal: string;
  revenuePct: number;
  revenueSegments: RevenueSegment[];
  salesPlanPct: number;
  salesBars: number[];
  className?: string;
}) => {
  const t = useTranslations("dashboard.orders");

  const salesChartData = salesBars.map((sales) => ({ sales }));
  const salesChartConfig = { sales: { label: t("salesMetrics.sales") } } satisfies ChartConfig;

  const revenueChartConfig = Object.fromEntries(
    revenueSegments.map((s) => [s.name, { label: s.name, color: s.fill }]),
  ) as ChartConfig;

  return (
    <Card className={className}>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="flex flex-col justify-between gap-7 lg:col-span-3">
            <span className="text-lg font-semibold">{t("salesMetrics.title")}</span>
            <div className="flex items-center gap-3">
              <Avatar className="size-10.5 rounded-lg">
                <AvatarFallback className="bg-primary/10 text-primary rounded-lg">
                  {companyName.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5">
                <span className="text-xl font-medium">{companyName}</span>
                <span className="text-muted-foreground text-sm">{companyEmail}</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {metrics.map((metric, index) => (
                <Card key={index} className="ring-foreground/10 py-2 shadow-none ring-1">
                  <CardContent className="flex items-center gap-3 px-4">
                    <Avatar className="rounded-sm after:border-0">
                      <AvatarFallback className="bg-primary/10 text-primary shrink-0 rounded-sm">
                        {metric.icon}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground text-sm font-medium">
                        {metric.title}
                      </span>
                      <span className="text-lg font-medium">{metric.value}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          <Card className="ring-foreground/10 justify-between gap-4 shadow-none ring-1 lg:col-span-2">
            <CardHeader className="gap-1">
              <CardTitle className="text-lg font-semibold">
                {t("salesMetrics.revenueGoal")}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <ChartContainer config={revenueChartConfig} className="h-38.5 w-full">
                <PieChart margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={revenueSegments}
                    dataKey="value"
                    nameKey="name"
                    startAngle={300}
                    endAngle={660}
                    innerRadius={58}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) - 12}
                                className="fill-card-foreground text-lg font-medium"
                              >
                                {revenueTotal}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 19}
                                className="fill-muted-foreground text-sm"
                              >
                                {t("salesMetrics.totalProfit")}
                              </tspan>
                            </text>
                          );
                        }
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="flex items-center justify-between">
                <span className="text-xl">{t("salesMetrics.planCompleted")}</span>
                <span className="text-2xl font-medium">{revenuePct}%</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
      <CardContent>
        <Card className="ring-foreground/10 shadow-none ring-1">
          <CardContent className="grid gap-4 lg:grid-cols-5">
            <div className="flex flex-col justify-center gap-6">
              <span className="text-lg font-semibold">{t("salesMetrics.salesPlan")}</span>
              <span className="max-lg:5xl text-6xl">{salesPlanPct}%</span>
              <span className="text-muted-foreground text-sm">
                {t("salesMetrics.salesPlanHint")}
              </span>
            </div>
            <div className="flex flex-col gap-6 text-lg md:col-span-4">
              <span className="font-medium">{t("salesMetrics.cohortTitle")}</span>
              <span className="text-muted-foreground text-wrap">
                {t("salesMetrics.cohortBody")}
              </span>
              <ChartContainer config={salesChartConfig} className="h-7.75 w-full">
                <BarChart
                  accessibilityLayer
                  data={salesChartData}
                  margin={{
                    left: 0,
                    right: 0,
                  }}
                  maxBarSize={16}
                >
                  <Bar
                    dataKey="sales"
                    fill="var(--primary)"
                    background={{
                      fill: "color-mix(in oklab, var(--primary) 10%, transparent)",
                      radius: 12,
                    }}
                    radius={12}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
};

export default SalesMetricsCard;
