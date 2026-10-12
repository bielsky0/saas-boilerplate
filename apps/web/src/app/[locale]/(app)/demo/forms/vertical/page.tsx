import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { VerticalFormDemos } from "@/features/demo/forms/vertical";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("demo"))("pages.vertical") };
}

/**
 * Vertical form-layout demos (etap 5, faza 5.1). Layout gallery — submits
 * go nowhere by design.
 */
export default function VerticalFormsPage() {
  return <VerticalFormDemos />;
}
