import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { HorizontalFormDemos } from "@/features/demo/forms/horizontal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("demo"))("pages.horizontal") };
}

/**
 * Horizontal form-layout demos (etap 5, faza 5.1). Layout gallery — submits
 * go nowhere by design.
 */
export default function HorizontalFormsPage() {
  return <HorizontalFormDemos />;
}
