"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";

import { resolveActor } from "@/features/admin/audit";
import { requireOrgPermission } from "@/features/organizations/context";
import { withTenant } from "@/lib/db/tenant";
import type { Locale } from "@/lib/i18n";
import type { FormState } from "@/lib/validation";
import {
  AddProgressNoteInput,
  addProgressNote,
  BookingNotFoundError,
  EnterGradeInput,
  enterGrade,
  ForeignSessionError,
  GradeFieldNotFoundError,
} from "./enter";
import { createGradeField } from "./manage";
import { addProgressNoteSchema, createGradeFieldSchema, enterGradeSchema } from "./schema";

/**
 * E-dziennik server actions (langlion §2.33, EPIK 35, v16, Faza 6).
 *
 * Same conventions as `features/bookings/staff-actions.ts`: `requireOrgPermission`
 * first, `resolveActor` before the transaction opens, audit + email in the same
 * `tx` as the write.
 */

export async function createGradeFieldAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrgPermission("grade_fields.manage");
  const [t, tv] = await Promise.all([
    getTranslations("grades"),
    getTranslations("grades.validation"),
  ]);

  const scope = str(formData.get("scope"));
  const parsed = createGradeFieldSchema(tv).safeParse({
    name: str(formData.get("name")),
    fieldType: str(formData.get("fieldType")),
    scope,
    groupTypeId: scope === "group_type" ? str(formData.get("groupTypeId")) : undefined,
    sessionId: scope === "session" ? str(formData.get("sessionId")) : undefined,
    minValue: str(formData.get("minValue")) || undefined,
    maxValue: str(formData.get("maxValue")) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);

  await withTenant(ctx.org.id, (tx) =>
    createGradeField(tx, {
      organizationId: ctx.org.id,
      name: parsed.data.name,
      fieldType: parsed.data.fieldType,
      groupTypeId: parsed.data.groupTypeId ?? null,
      sessionId: parsed.data.sessionId ?? null,
      minValue: parsed.data.minValue ?? null,
      maxValue: parsed.data.maxValue ?? null,
      actor,
    }),
  );

  // Session-scoped: exactly one roster page shows this field. Group-type-scoped
  // fields can affect many session pages, not worth enumerating here — the page
  // is already fully dynamic (requireOrgAccess reads cookies), so the next visit
  // sees it regardless; this only saves a client-router-cache round trip.
  if (parsed.data.sessionId) {
    revalidatePath(`/dashboard/sessions/${parsed.data.sessionId}`);
  }
  return { success: t("fieldCreated") };
}

export async function enterGradeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOrgPermission("grades.enter");
  const [t, tv, locale] = await Promise.all([
    getTranslations("grades"),
    getTranslations("grades.validation"),
    getLocale(),
  ]);

  const parsed = enterGradeSchema(tv).safeParse({
    gradeFieldId: str(formData.get("gradeFieldId")),
    bookingId: str(formData.get("bookingId")),
    value: str(formData.get("value")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);
  const input: Omit<EnterGradeInput, "gradeFieldId" | "bookingId" | "value"> = {
    organizationId: ctx.org.id,
    organizationName: ctx.org.name,
    enteredByUserId: ctx.session.user.id,
    callerRole: ctx.role,
    actor,
    locale: locale as Locale,
  };

  let sessionId: string;
  try {
    ({ sessionId } = await withTenant(ctx.org.id, (tx) =>
      enterGrade(tx, {
        ...input,
        gradeFieldId: parsed.data.gradeFieldId,
        bookingId: parsed.data.bookingId,
        value: parsed.data.value,
      }),
    ));
  } catch (error) {
    if (error instanceof GradeFieldNotFoundError) return { error: t("errors.fieldNotFound") };
    if (error instanceof BookingNotFoundError) return { error: t("errors.bookingNotFound") };
    if (error instanceof ForeignSessionError) return { error: t("errors.foreignSession") };
    throw error;
  }

  revalidatePath(`/dashboard/sessions/${sessionId}`);
  return { success: t("gradeEntered") };
}

export async function addProgressNoteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrgPermission("grades.enter");
  const [t, tv, locale] = await Promise.all([
    getTranslations("grades"),
    getTranslations("grades.validation"),
    getLocale(),
  ]);

  const parsed = addProgressNoteSchema(tv).safeParse({
    bookingId: str(formData.get("bookingId")),
    content: str(formData.get("content")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);
  const input: Omit<AddProgressNoteInput, "bookingId" | "content"> = {
    organizationId: ctx.org.id,
    organizationName: ctx.org.name,
    enteredByUserId: ctx.session.user.id,
    callerRole: ctx.role,
    actor,
    locale: locale as Locale,
  };

  let sessionId: string;
  try {
    ({ sessionId } = await withTenant(ctx.org.id, (tx) =>
      addProgressNote(tx, {
        ...input,
        bookingId: parsed.data.bookingId,
        content: parsed.data.content,
      }),
    ));
  } catch (error) {
    if (error instanceof BookingNotFoundError) return { error: t("errors.bookingNotFound") };
    if (error instanceof ForeignSessionError) return { error: t("errors.foreignSession") };
    throw error;
  }

  revalidatePath(`/dashboard/sessions/${sessionId}`);
  return { success: t("noteAdded") };
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
