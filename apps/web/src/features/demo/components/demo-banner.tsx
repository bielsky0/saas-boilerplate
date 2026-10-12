import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Demo banner (etap 5, faza 5.1). Rendered atop every demo route whose figures
 * are hardcoded constants — the ONE documented exception to the "zero fake-db"
 * rule. If it isn't on screen, the data on screen is live.
 */
export function DemoBanner() {
  const t = useTranslations("demo");
  return (
    <Alert variant="warning">
      <AlertTitle>{t("banner.title")}</AlertTitle>
      <AlertDescription>{t("banner.body")}</AlertDescription>
    </Alert>
  );
}
