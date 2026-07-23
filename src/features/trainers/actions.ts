"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { resolveActor } from "@/features/admin/audit";
import { requireOrgPermission } from "@/features/organizations/context";
import { withTenant } from "@/lib/db/tenant";
import type { FormState } from "@/lib/validation";
import { TrainerHasFutureSessionsError, TrainerNotFoundError, deactivateTrainer } from "./deactivate";

/**
 * Trainer server actions (langlion §2.11, EPIK 20/21, Faza 8).
 *
 * Offboarding is the core operation; substitution and mass reassign live in
 * `features/schedule/` because they mutate `class_session`, not membership.
 */

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Deactivate a trainer (offboarding). Gated by `trainers.offboard`.
 *
 * Hard-blocked if future sessions exist (US-21.1/AC1). The UI should pre-check
 * blockers via `listFutureSessionsForTrainer` and display them before the admin
 * attempts deactivation.
 */
export async function deactivateTrainerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const trainerUserId = str(formData.get("trainerUserId"));
  const ctx = await requireOrgPermission("trainers.offboard");
  const t = await getTranslations("staffPanel");

  const actor = await resolveActor(ctx.session);

  try {
    await withTenant(ctx.org.id, (tx) =>
      deactivateTrainer(tx, {
        organizationId: ctx.org.id,
        trainerUserId,
        actor,
      }),
    );

    revalidatePath(`/dashboard/trainers`);
    return { success: t("trainerDeactivated", { defaultValue: "Trainer deactivated." }) };
  } catch (e) {
    if (e instanceof TrainerNotFoundError) return { error: t("errors.generic") };
    if (e instanceof TrainerHasFutureSessionsError) {
      return { error: t("errors.trainerHasFutureSessions", { defaultValue: "Trainer has future sessions." }) };
    }
    throw e;
  }
}
