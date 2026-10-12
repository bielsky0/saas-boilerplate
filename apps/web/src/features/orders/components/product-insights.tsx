"use client";

// Third-party Imports
import { Bar, BarChart } from "recharts";
import { useTranslations } from "next-intl";

// Component Imports
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";

/**
 * Product insight card (etap 4, faza 3). Layout ported from AdminCN's
 * `widget-product-insights`; both series are props (monthly + weekly revenue
 * cuts). The stock product photo (`/images/widgets/image-7.webp`) is gone —
 * no binary assets cross over (faza 0); the header is title + subtitle only.
 */
export type InsightSeries = {
  label: string;
  color: string;
  data: { label: string; value: number }[];
};

const ProductInsightsCard = ({
  subtitle,
  primary,
  secondary,
  className,
}: {
  subtitle: string;
  primary: { title: string; value: string; series: InsightSeries };
  secondary: { title: string; value: string; series: InsightSeries };
  className?: string;
}) => {
  const t = useTranslations("dashboard.orders");

  // ChartContainer derives `--color-<dataKey>` from the config KEY, so the key
  // must equal the Bar's dataKey ("value") — the human label rides along.
  const configFor = (series: InsightSeries): ChartConfig => ({
    value: { label: series.label, color: series.color },
  });

  const renderRow = (item: typeof primary) => (
    <div className="flex items-center justify-between gap-1">
      <div className="flex flex-col gap-1">
        <span className="text-xs">{item.title}</span>
        <span className="text-2xl font-semibold">{item.value}</span>
      </div>
      <ChartContainer config={configFor(item.series)} className="min-h-13 max-w-18">
        <BarChart accessibilityLayer data={item.series.data} barSize={8}>
          <Bar dataKey="value" fill="var(--color-value)" radius={2} />
        </BarChart>
      </ChartContainer>
    </div>
  );

  return (
    <Card className={className}>
      <CardHeader className="flex justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">{t("insights.title")}</span>
          <span className="text-muted-foreground text-sm">{subtitle}</span>
        </div>
      </CardHeader>
      <CardContent>
        <Separator />
      </CardContent>
      <CardContent className="space-y-4">
        {renderRow(primary)}
        {renderRow(secondary)}
      </CardContent>
    </Card>
  );
};

export default ProductInsightsCard;
