"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { changed, recordAudit, resolveActor, withImpersonation } from "@/features/admin/audit";
import { requireOrgPermission } from "@/features/organizations/context";
import { location } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import type { FormState } from "@/lib/validation";
import { createLocationSchema } from "./schema";
import { LocationNotFoundError, deactivateLocation } from "./deactivate";

/**
 * Location server actions (langlion §2.12, EPIK 22 — admin half).
 *
 * Same shape as the boilerplate's organization actions and deliberately so:
 * `requireOrgPermission` first (spec §4.2 — the backend is the boundary, the UI's
 * hiding is cosmetic), then one transaction that carries both the write and its
 * `recordAudit` row, so a rollback takes the log entry with it.
 *
 * `resolveActor` is awaited BEFORE the transaction opens. It may itself query
 * when the session is impersonated, and a query inside the transaction would
 * take a SECOND pooled connection while the first is held — the deadlock
 * documented in `features/admin/audit.ts`.
 *
 * DEACTIVATION IS NOT HERE. It belongs to F8 along with the rest of the
 * soft-delete work, and it is the one deactivation in the domain that only WARNS
 * rather than blocks (decyzja #6 in the spec's §7) — a location is informational,
 * not a dependency of the booking engine. Implementing half of that rule here,
 * without the future-session listing that gives the warning its content, would
 * ship a confirm dialog that confirms nothing.
 */

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function createLocationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrgPermission("locations.manage");
  const [t, tv] = await Promise.all([
    getTranslations("locations"),
    getTranslations("locations.validation"),
  ]);

  const parsed = createLocationSchema(tv).safeParse({
    name: str(formData.get("name")),
    address: str(formData.get("address")) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);

  await withTenant(ctx.org.id, async (tx) => {
    const [row] = await tx
      .insert(location)
      .values({
        organizationId: ctx.org.id,
        name: parsed.data.name,
        address: parsed.data.address ?? null,
      })
      .returning({ id: location.id });

    await recordAudit(tx, {
      actor,
      organizationId: ctx.org.id,
      action: "location.create",
      targetType: "location",
      targetId: row!.id,
      targetLabel: parsed.data.name,
    });
  });

  revalidatePath(`/dashboard/locations`);
  return { success: t("created") };
}

export async function updateLocationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const locationId = str(formData.get("locationId"));
  const ctx = await requireOrgPermission("locations.manage");
  const [t, tv] = await Promise.all([
    getTranslations("locations"),
    getTranslations("locations.validation"),
  ]);

  const parsed = createLocationSchema(tv).safeParse({
    name: str(formData.get("name")),
    address: str(formData.get("address")) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("errors.generic") };
  }

  const actor = await resolveActor(ctx.session);

  const found = await withTenant(ctx.org.id, async (tx) => {
    // Read inside the transaction, with `tx`: this row is about to be mutated, so
    // moving the read out would read a version the update then races with. The
    // explicit `organizationId` predicate is what uses the index; RLS is the
    // second line behind it, not a replacement (US-1.1/AC1).
    const [before] = await tx
      .select()
      .from(location)
      .where(
        and(
          eq(location.id, locationId),
          eq(location.organizationId, ctx.org.id),
          isNull(location.deletedAt),
        ),
      )
      .limit(1);
    if (!before) return false;

    const after = { name: parsed.data.name, address: parsed.data.address ?? null };
    await tx
      .update(location)
      .set({ ...after, updatedAt: new Date() })
      .where(and(eq(location.id, locationId), eq(location.organizationId, ctx.org.id)));

    await recordAudit(tx, {
      actor,
      organizationId: ctx.org.id,
      action: "location.update",
      targetType: "location",
      targetId: locationId,
      targetLabel: after.name,
      // §6.4's "old value → new value", nested under `metadata` exactly as the
      // membership actions do it — `changed()` returns undefined when nothing
      // actually differs, so a no-op save logs the event without a fake diff.
      metadata: withImpersonation(ctx.session, {
        changes: changed(before, after, ["name", "address"]),
      }),
    });
    return true;
  });

  if (!found) return { error: t("errors.notFound") };

  revalidatePath(`/dashboard/locations`);
  return { success: t("updated") };
}

export async function deactivateLocationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const locationId = str(formData.get("locationId"));
  const ctx = await requireOrgPermission("locations.manage");
  const t = await getTranslations("locations");

  const actor = await resolveActor(ctx.session);

  try {
    const result = await withTenant(ctx.org.id, (tx) =>
      deactivateLocation(tx, {
        organizationId: ctx.org.id,
        locationId,
        actor,
      }),
    );

    revalidatePath(`/dashboard/locations`);
    if (result.affectedSessions > 0) {
      return { success: t("deactivated") + " (" + t("deactivateWarning", { count: result.affectedSessions }) + ")" };
    }
    return { success: t("deactivated") };
  } catch (e) {
    if (e instanceof LocationNotFoundError) return { error: t("errors.notFound") };
    throw e;
  }
}
