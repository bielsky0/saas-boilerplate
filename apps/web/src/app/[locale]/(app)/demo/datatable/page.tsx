import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { DemoBanner } from "@/features/demo/components/demo-banner";
import { DatatableDemos } from "@/features/demo/datatables/datatable-demos";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("demo"))("pages.datatable") };
}

/**
 * Data-table demos (etap 5, faza 5.1). Gallery of TanStack Table patterns
 * over hardcoded sample rows — `DemoBanner` says so on screen.
 */
export default function DatatableDemoPage() {
  return (
    <div className="flex flex-col gap-6">
      <DemoBanner />
      <DatatableDemos />
    </div>
  );
}
