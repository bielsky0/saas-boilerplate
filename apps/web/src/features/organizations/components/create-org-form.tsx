"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Button, FormField, FormMessage, Input } from "@/components/ui";
import { useRouter } from "@/lib/i18n/navigation";
import { isLocale } from "@/lib/i18n/config";
import { createOrganization } from "../client";

/**
 * Create-organization form (spec 3.2, faza 2.2). The slug is optional — Nest
 * derives and de-duplicates it from the name when omitted. On success the
 * client navigates to the new org; failures stay inline.
 */
export function CreateOrgForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t = useTranslations("organizations");
  const locale = useLocale();
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const name = String(formData.get("name") ?? "");
      const slugRaw = String(formData.get("slug") ?? "").trim();
      const result = await createOrganization(
        slugRaw ? { name, slug: slugRaw } : { name },
        isLocale(locale) ? locale : undefined,
      );
      if (result.ok) {
        router.push(`/orgs/${result.data.slug}`);
        return;
      }
      setError(result.code === "NOT_FOUND" ? t("errors.generic") : t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label={t("fields.orgName")} htmlFor="name">
        <Input id="name" name="name" required autoComplete="organization" />
      </FormField>
      <FormField label={t("fields.slugOptional")} htmlFor="slug">
        <Input id="slug" name="slug" placeholder={t("fields.slugPlaceholder")} />
      </FormField>

      {error ? <FormMessage>{error}</FormMessage> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("create.submitting") : t("create.submit")}
      </Button>
    </form>
  );
}
