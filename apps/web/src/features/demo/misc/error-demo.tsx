"use client";

import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/i18n/navigation";

/**
 * 404 demo page (etap 5, faza 5.1). Look ported from AdminCN's error page
 * (giant "4🤔4" included). A demo route — NOT the app's real 404 handling.
 * Link keeps its link role (`Link + buttonVariants`, never `Button + render`).
 */
export function ErrorDemo() {
  const t = useTranslations("demo");

  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-9 p-6">
      <h1 className="text-9xl font-bold">4&#129396;4</h1>
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-muted-foreground text-xl sm:text-2xl">{t("errorPage.body")}</p>
        <Link href="/dashboard" className={buttonVariants({ className: "rounded-full" })}>
          {t("errorPage.back")}
        </Link>
      </div>
    </div>
  );
}
