import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ErrorDemo } from "@/features/demo/misc/error-demo";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("demo"))("pages.error") };
}

/**
 * 404 demo page (etap 5, faza 5.1). Gallery piece — NOT the app's real
 * 404 handling (`forbidden.tsx` + Next default stay as they are).
 */
export default function ErrorDemoPage() {
  return <ErrorDemo />;
}
