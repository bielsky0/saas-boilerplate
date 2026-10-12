"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@repo/api-client";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useRouter } from "@/lib/i18n/navigation";
import { useUpdateProfile } from "../hooks/use-update-profile";
import { profileNameSchema, type ProfileNameInput } from "../schema";
import { useProfile } from "../hooks/use-profile";

/**
 * Own display-name form (etap 4, faza 4). RHF + `zodResolver` over the shared
 * `profileNameSchema` (client mirror of the server backstop); API field
 * errors map back onto the field, success toasts and the session-backed UI
 * (header menu, switcher) refreshes through query invalidation.
 */
export function ProfileForm() {
  const t = useTranslations("profile");
  const tv = useTranslations("profile.validation");
  const router = useRouter();
  const { data: user, isLoading, isError } = useProfile();
  const update = useUpdateProfile();

  const form = useForm<ProfileNameInput>({
    resolver: zodResolver(profileNameSchema(tv)),
    defaultValues: { name: "" },
  });

  // Async server value → form. Explicit `reset` (not the `values` prop):
  // deterministic across RHF versions, no deep-compare subtleties.
  useEffect(() => {
    if (user) form.reset({ name: user.name ?? "" });
  }, [form, user]);

  async function onSubmit(input: ProfileNameInput) {
    try {
      const result = await update.mutateAsync(input);
      form.reset({ name: result.name });
      toast.success(t("saved"));
      // Re-read the server layout (requireSession + orgs) so every
      // session-derived chrome (profile menu, switcher) converges — the
      // Query invalidation alone only refreshes client readers. RSC refresh,
      // not a navigation: no history entry, no headless-shell transition.
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const issues = error.issues as Record<string, string[]> | undefined;
        form.setError("name", { message: issues?.["name"]?.[0] ?? t("validation.generic") });
        return;
      }
      form.setError("name", { message: t("validation.generic") });
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("loading")}</p>;
  }

  if (isError || !user) {
    return (
      <Alert role="alert" variant="warning">
        {t("error")}
      </Alert>
    );
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex max-w-md flex-col gap-4"
      noValidate
    >
      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <FormField
            label={t("nameLabel")}
            htmlFor="profile-name"
            error={
              fieldState.error ? [fieldState.error.message ?? t("validation.generic")] : undefined
            }
          >
            <Input
              {...field}
              id="profile-name"
              autoComplete="name"
              aria-invalid={fieldState.invalid}
              placeholder={t("namePlaceholder")}
            />
          </FormField>
        )}
      />
      <p className="text-muted-foreground text-sm">{user.email}</p>
      <div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
