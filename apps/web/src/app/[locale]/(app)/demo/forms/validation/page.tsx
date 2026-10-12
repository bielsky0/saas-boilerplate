import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { FormValidationDemos } from "@/features/demo/forms/validation";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("demo"))("pages.validation") };
}

/**
 * Form-validation demos (etap 5, faza 5.1). RHF modes + a full validated
 * form; submits end in toasts by design.
 */
export default function ValidationFormsPage() {
  return <FormValidationDemos />;
}
