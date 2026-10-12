"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@repo/api-client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  Button,
  FormField,
  FormMessage,
  Input,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
  toast,
} from "@/components/ui";
import { useSendMail } from "../hooks/use-mail";

const composeSchema = (m: { toRequired: string; subjectRequired: string; bodyRequired: string }) =>
  z.object({
    to: z.string().trim().min(1, m.toRequired),
    subject: z.string().trim().min(1, m.subjectRequired).max(200),
    body: z.string().trim().min(1, m.bodyRequired).max(20_000),
  });

type ComposeValues = { to: string; subject: string; body: string };

function parseRecipients(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Compose / forward sheet (etap 5, faza 5.4). RHF over the shared send
 * endpoint; "Save draft" posts the same payload with `draft: true`. Unknown
 * recipients come back as a 422 with `issues.to` and map onto the field.
 */
export function ComposeSheet({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: { to?: string; subject?: string; body?: string };
}) {
  const t = useTranslations("mail");
  const tv = useTranslations("mail.validation");
  const send = useSendMail();

  const schema = useMemo(
    () =>
      composeSchema({
        toRequired: tv("toRequired"),
        subjectRequired: tv("subjectRequired"),
        bodyRequired: tv("bodyRequired"),
      }),
    [tv],
  );

  const form = useForm<ComposeValues>({
    resolver: zodResolver(schema),
    defaultValues: { to: "", subject: "", body: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      to: initial?.to ?? "",
      subject: initial?.subject ?? "",
      body: initial?.body ?? "",
    });
  }, [open, initial, form]);

  async function submit(draft: boolean) {
    const values = form.getValues();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      await form.trigger();
      return;
    }
    try {
      await send.mutateAsync({
        to: parseRecipients(values.to),
        subject: values.subject.trim(),
        body: values.body.trim(),
        draft,
      });
      toast.success(draft ? t("toast.draftSaved") : t("toast.sent"));
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.issues) {
        const issues = error.issues as Record<string, string[]>;
        if (issues.to) {
          form.setError("to", {
            message: tv("unknownRecipient", { emails: issues.to.join(", ") }),
          });
          return;
        }
      }
      form.setError("root", { message: tv("generic") });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("composeTitle")}</SheetTitle>
        </SheetHeader>
        <form
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(false);
          }}
          noValidate
        >
          <Controller
            name="to"
            control={form.control}
            render={({ field, fieldState }) => (
              <FormField
                label={t("fields.to")}
                htmlFor="mail-to"
                error={fieldState.error ? [fieldState.error.message ?? tv("generic")] : undefined}
              >
                <Input
                  {...field}
                  id="mail-to"
                  autoComplete="off"
                  placeholder={t("fields.toPlaceholder")}
                />
              </FormField>
            )}
          />
          <Controller
            name="subject"
            control={form.control}
            render={({ field, fieldState }) => (
              <FormField
                label={t("fields.subject")}
                htmlFor="mail-subject"
                error={fieldState.error ? [fieldState.error.message ?? tv("generic")] : undefined}
              >
                <Input {...field} id="mail-subject" autoComplete="off" />
              </FormField>
            )}
          />
          <Controller
            name="body"
            control={form.control}
            render={({ field, fieldState }) => (
              <FormField
                label={t("fields.body")}
                htmlFor="mail-body"
                error={fieldState.error ? [fieldState.error.message ?? tv("generic")] : undefined}
              >
                <Textarea {...field} id="mail-body" rows={10} className="min-h-40" />
              </FormField>
            )}
          />
          {form.formState.errors.root ? (
            <FormMessage>{form.formState.errors.root.message}</FormMessage>
          ) : null}
          <SheetFooter className="mt-auto flex-row justify-end gap-2 px-0">
            <Button
              type="button"
              variant="outline"
              disabled={send.isPending}
              onClick={() => void submit(true)}
            >
              {t("saveDraft")}
            </Button>
            <Button type="submit" disabled={send.isPending}>
              {send.isPending ? t("sending") : t("send")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
