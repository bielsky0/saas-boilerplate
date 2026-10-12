import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MailApp } from "@/features/mail/components/mail-app";
import { requireSession } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.admin"))("items.mail") };
}

/**
 * Internal mail (etap 5, faza 5.4). RSC guard + title; the three-pane client
 * component talks to the user-scoped `/v1/mail/*` endpoints. Messages go
 * between platform users only — the boilerplate has no inbound MX.
 */
export default async function MailPage() {
  await requireSession("/apps/mail");

  return <MailApp />;
}
