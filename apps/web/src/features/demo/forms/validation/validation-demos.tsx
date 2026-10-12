"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Validation-modes demo (etap 5, faza 5.1). Same 4 RHF modes as AdminCN, one
 * card each + comparison table. `alert()` submits replaced with toasts;
 * messages translated. Keys are all literal (next-intl rejects dynamic keys)
 * — the mode union only selects pre-built records.
 */

const MODES = ["onChange", "onBlur", "onSubmit", "onTouched"] as const;
type Mode = (typeof MODES)[number];

function ModeCard({ mode }: { mode: Mode }) {
  const t = useTranslations("demo");

  const schema = useMemo(
    () =>
      z.object({
        value: z
          .string()
          .min(5, t("validation.modes.messages.minLength"))
          .max(20, t("validation.modes.messages.maxLength")),
      }),
    [t],
  );
  const form = useForm<{ value: string }>({
    resolver: zodResolver(schema),
    mode,
    defaultValues: { value: "" },
  });

  const titles: Record<Mode, string> = {
    onChange: t("validation.modes.onChange.title"),
    onBlur: t("validation.modes.onBlur.title"),
    onSubmit: t("validation.modes.onSubmit.title"),
    onTouched: t("validation.modes.onTouched.title"),
  };
  const hints: Record<Mode, string> = {
    onChange: t("validation.modes.onChange.hint"),
    onBlur: t("validation.modes.onBlur.hint"),
    onSubmit: t("validation.modes.onSubmit.hint"),
    onTouched: t("validation.modes.onTouched.hint"),
  };
  const descriptions: Record<Mode, ReactNode> = {
    onChange: t.rich("validation.modes.onChange.description", {
      strong: (chunks) => <strong>{chunks}</strong>,
    }),
    onBlur: t.rich("validation.modes.onBlur.description", {
      strong: (chunks) => <strong>{chunks}</strong>,
    }),
    onSubmit: t.rich("validation.modes.onSubmit.description", {
      strong: (chunks) => <strong>{chunks}</strong>,
    }),
    onTouched: t.rich("validation.modes.onTouched.description", {
      strong: (chunks) => <strong>{chunks}</strong>,
    }),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{titles[mode]}</CardTitle>
        <CardDescription>{hints[mode]}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(() => {
            toast.success(t("validation.submitted"));
            form.reset();
          })}
          className="space-y-4"
        >
          <Controller
            name="value"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${mode}-demo-input`}>{t("validation.demoInput")}</FieldLabel>
                <Input
                  {...field}
                  id={`${mode}-demo-input`}
                  aria-invalid={fieldState.invalid}
                  placeholder={t("validation.typeHere")}
                />
                <FieldDescription>{descriptions[mode]}</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              {t("validation.submit")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => form.reset()}>
              {t("validation.reset")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const ValidationModesDemo = () => {
  const t = useTranslations("demo");

  const whens: Record<Mode, string> = {
    onChange: t("validation.table.onChange.when"),
    onBlur: t("validation.table.onBlur.when"),
    onSubmit: t("validation.table.onSubmit.when"),
    onTouched: t("validation.table.onTouched.when"),
  };
  const bestFors: Record<Mode, string> = {
    onChange: t("validation.table.onChange.bestFor"),
    onBlur: t("validation.table.onBlur.bestFor"),
    onSubmit: t("validation.table.onSubmit.bestFor"),
    onTouched: t("validation.table.onTouched.bestFor"),
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("validation.modesTitle")}</h2>
        <p className="text-muted-foreground">{t("validation.modesSubtitle")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {MODES.map((mode) => (
          <ModeCard key={mode} mode={mode} />
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-4 text-left font-semibold">{t("validation.table.mode")}</th>
              <th className="p-4 text-left font-semibold">{t("validation.table.when")}</th>
              <th className="p-4 text-left font-semibold">{t("validation.table.bestFor")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {MODES.map((mode) => (
              <tr key={mode} className="hover:bg-muted/20 transition-colors">
                <td className="p-4 font-medium">{mode}</td>
                <td className="p-4">{whens[mode]}</td>
                <td className="p-4">{bestFors[mode]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ValidationModesDemo;
