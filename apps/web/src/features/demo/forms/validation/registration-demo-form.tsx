"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CheckCheckIcon } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Report-issue demo form (etap 5, faza 5.1). Same fields as AdminCN's
 * registration demo, rebuilt on our primitives (Radix Select, plain field
 * wrappers) with translated Zod v4 messages. Submit ends in a toast —
 * layout/validation demo, not a flow.
 */

const ISSUES = ["damaged", "got-different", "not-like", "other"] as const;
const DEPARTMENTS = ["sales", "billing", "returns", "technical"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const HELP_OPTIONS = ["replace", "refund", "support"] as const;

const ContactUsFormDemo = () => {
  const t = useTranslations("demo");

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t("validation.report.nameMin")),
        phone: z
          .string()
          .min(1, t("validation.report.phoneRequired"))
          .regex(/^\+?[0-9()\-\s]{8,20}$/, t("validation.report.phoneInvalid")),
        company: z.string().min(2, t("validation.report.companyMin")),
        email: z
          .string()
          .min(1, t("validation.report.emailRequired"))
          .email(t("validation.report.emailInvalid")),
        orderId: z.string().min(3, t("validation.report.orderRequired")),
        issue: z.string().min(1, t("validation.report.selectIssue")),
        department: z.string().min(1, t("validation.report.selectDepartment")),
        priority: z.string().min(1, t("validation.report.selectPriority")),
        selectedOption: z.enum(HELP_OPTIONS, t("validation.report.selectOption")),
        message: z.string().min(50, t("validation.report.messageMin")),
      }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      phone: "",
      company: "",
      email: "",
      orderId: "",
      issue: "",
      department: "",
      priority: "",
      selectedOption: undefined,
      message: "",
    },
  });

  function onSubmit() {
    toast.custom(() => (
      <Alert className="sm:w-122 *:[svg]:row-span-1 border-green-600 text-green-600 dark:border-green-400 dark:text-green-400">
        <CheckCheckIcon />
        <AlertTitle>{t("validation.report.submitted")}</AlertTitle>
      </Alert>
    ));
  }

  const textField = (
    name: keyof FormValues,
    label: string,
    extra?: Partial<React.ComponentProps<typeof Input>>,
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
          <Input {...field} id={field.name} aria-invalid={fieldState.invalid} {...extra} />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );

  const selectField = (
    name: "issue" | "department" | "priority",
    label: string,
    placeholder: string,
    options: readonly string[],
    optionLabel: (value: string) => string,
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Select name={field.name} value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={name} className="w-full" aria-invalid={fieldState.invalid}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {optionLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );

  const issueLabels: Record<string, string> = {
    damaged: t("validation.report.issues.damaged"),
    "got-different": t("validation.report.issues.got-different"),
    "not-like": t("validation.report.issues.not-like"),
    other: t("validation.report.issues.other"),
  };
  const departmentLabels: Record<string, string> = {
    sales: t("validation.report.departments.sales"),
    billing: t("validation.report.departments.billing"),
    returns: t("validation.report.departments.returns"),
    technical: t("validation.report.departments.technical"),
  };
  const priorityLabels: Record<string, string> = {
    low: t("validation.report.priorities.low"),
    medium: t("validation.report.priorities.medium"),
    high: t("validation.report.priorities.high"),
    urgent: t("validation.report.priorities.urgent"),
  };
  const helpLabels: Record<string, string> = {
    replace: t("validation.report.help.replace"),
    refund: t("validation.report.help.refund"),
    support: t("validation.report.help.support"),
  };

  return (
    <Card className="w-full shadow-none">
      <CardHeader>
        <CardTitle>{t("validation.report.title")}</CardTitle>
        <CardDescription>{t("validation.report.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid w-full grid-cols-1 gap-6 md:grid-cols-2"
        >
          {textField("name", t("validation.report.fields.name"), {
            placeholder: t("validation.report.placeholders.name"),
            autoComplete: "name",
          })}
          {textField("phone", t("validation.report.fields.phone"), {
            placeholder: t("validation.report.placeholders.phone"),
            type: "tel",
            autoComplete: "tel",
          })}
          {textField("company", t("validation.report.fields.company"), {
            placeholder: t("validation.report.placeholders.company"),
            autoComplete: "organization",
          })}
          {textField("email", t("validation.report.fields.email"), {
            placeholder: t("validation.report.placeholders.email"),
            type: "email",
            autoComplete: "email",
          })}
          {textField("orderId", t("validation.report.fields.orderId"), {
            placeholder: t("validation.report.placeholders.orderId"),
          })}
          {selectField(
            "issue",
            t("validation.report.fields.issue"),
            t("validation.report.placeholders.issue"),
            ISSUES,
            (v) => issueLabels[v] ?? v,
          )}
          {selectField(
            "department",
            t("validation.report.fields.department"),
            t("validation.report.placeholders.department"),
            DEPARTMENTS,
            (v) => departmentLabels[v] ?? v,
          )}
          {selectField(
            "priority",
            t("validation.report.fields.priority"),
            t("validation.report.placeholders.priority"),
            PRIORITIES,
            (v) => priorityLabels[v] ?? v,
          )}

          <Controller
            name="selectedOption"
            control={form.control}
            render={({ field, fieldState }) => (
              <FieldSet className="md:col-span-2">
                <FieldLegend variant="label">{t("validation.report.helpTitle")}</FieldLegend>
                <RadioGroup
                  name={field.name}
                  value={field.value ?? ""}
                  onValueChange={field.onChange}
                >
                  {HELP_OPTIONS.map((option) => (
                    <Field key={option} orientation="horizontal" data-invalid={fieldState.invalid}>
                      <RadioGroupItem
                        value={option}
                        id={`want-${option}`}
                        aria-invalid={fieldState.invalid}
                      />
                      <FieldLabel htmlFor={`want-${option}`} className="font-normal">
                        {helpLabels[option]}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </FieldSet>
            )}
          />

          <Controller
            name="message"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="md:col-span-2">
                <FieldLabel htmlFor={field.name}>
                  {t("validation.report.fields.message")}
                </FieldLabel>
                <Textarea
                  {...field}
                  id={field.name}
                  aria-invalid={fieldState.invalid}
                  placeholder={t("validation.report.placeholders.message")}
                  className="min-h-30 resize-none"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <Button type="submit" className="md:col-span-2 md:w-fit">
            {t("validation.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ContactUsFormDemo;
