"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Button, ConfirmDialog, FormField, FormMessage, Input, toast } from "@/components/ui";
import { useRouter } from "@/lib/i18n/navigation";
import { isLocale } from "@/lib/i18n/config";
import { deleteOrganization, leaveOrganization, updateOrganization } from "../client";

/** Edit org name + slug (spec §3.2, faza 2.2). Nest re-checks `organization.update`. */
export function OrgSettingsForm({ slug, name }: { slug: string; name: string }) {
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
      const nextName = String(formData.get("name") ?? "");
      const nextSlugRaw = String(formData.get("newSlug") ?? "").trim();
      const result = await updateOrganization(
        slug,
        nextSlugRaw && nextSlugRaw !== slug
          ? { name: nextName, newSlug: nextSlugRaw }
          : { name: nextName },
        isLocale(locale) ? locale : undefined,
      );
      if (result.ok) {
        toast.success(t("success.organizationUpdated"));
        // The audit write is server-side; the redirect equivalent navigates
        // when the slug moved, refreshes otherwise.
        if (result.data.slug !== slug) {
          router.push(`/orgs/${result.data.slug}/settings`);
        } else {
          router.refresh();
        }
        return;
      }
      setError(result.code === "SLUG_TAKEN" ? t("errors.slugTaken") : t("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label={t("fields.orgName")} htmlFor="org-name">
        <Input id="org-name" name="name" defaultValue={name} required />
      </FormField>
      <FormField label={t("fields.slug")} htmlFor="org-slug">
        <Input id="org-slug" name="newSlug" defaultValue={slug} />
      </FormField>

      {error ? <FormMessage>{error}</FormMessage> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("settings.saving") : t("settings.save")}
        </Button>
      </div>
    </form>
  );
}

/** Soft-delete the org (spec §11.3, faza 2.2). Nest re-checks `organization.delete`. */
export function DeleteOrgButton({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t = useTranslations("organizations.settings");
  const te = useTranslations("organizations");
  const router = useRouter();

  async function onConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await deleteOrganization(slug);
      if (result.ok) {
        router.push("/dashboard");
        return;
      }
      setError(te("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="destructive" disabled={pending}>
              {pending ? t("deleting") : t("delete")}
            </Button>
          }
          title={t("confirmDeleteTitle")}
          description={t("confirmDeleteBody")}
          confirmLabel={t("confirmDeleteAction")}
          onConfirm={onConfirm}
          disabled={pending}
        />
      </div>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </div>
  );
}

/** Leave the org (spec §3.4, faza 2.2). Blocked for the sole owner (409). */
export function LeaveOrgButton({ slug }: { slug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t = useTranslations("organizations.settings");
  const te = useTranslations("organizations");
  const router = useRouter();

  async function onConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await leaveOrganization(slug);
      if (result.ok) {
        router.push("/dashboard");
        return;
      }
      setError(result.code === "LAST_OWNER" ? te("errors.lastOwnerLeave") : te("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline" disabled={pending}>
              {pending ? t("leaving") : t("leave")}
            </Button>
          }
          title={t("confirmLeaveTitle")}
          description={t("confirmLeaveBody")}
          confirmLabel={t("confirmLeaveAction")}
          onConfirm={onConfirm}
          disabled={pending}
        />
      </div>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </div>
  );
}
