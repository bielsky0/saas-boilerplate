import { z } from "zod";

import type { NamespaceTranslator } from "@/lib/i18n";

/**
 * Booking validation (langlion §1.2, §2.3, EPIK 4/5/6).
 */

type ValidationTranslator = NamespaceTranslator<"bookings.validation">;

/**
 * Wire vocabulary — the runtime form of the union declared on the column.
 *
 * Everything except `cancelled` occupies a seat (§2.3). `no_show` is included in
 * that on purpose: the child was booked, the seat was consumed, and marking the
 * absence carries no automatic consequence (US-16.2).
 */
export const paymentStatus = z.enum([
  "payment_pending",
  "booked_offline",
  "confirmed",
  "cancelled",
  "no_show",
]);

/** How the parent chose to pay, which decides the booking's starting status (§4). */
export const paymentMethod = z.enum(["online", "on_site"]);

/**
 * The frozen price on a booking (Zasada nadrzędna #1, §2.14, US-4.6).
 *
 * Amount in MINOR UNITS as an integer — grosze, never złote, matching what Stripe
 * expects so there is no conversion layer to round wrongly. The currency travels
 * with it rather than being looked up at read time: if an academy ever changes
 * `organization.currency`, historical prices must not silently re-denominate
 * (US-24.2/AC1). That is the whole reason this is a jsonb object and not a bare
 * integer column.
 */
export const priceSnapshot = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
});

/**
 * The public enrollment submission (F5, US-4.1/US-4.4).
 *
 * `participant` is a discriminated union rather than a bare `athleteId`, because a
 * parent enrolling their first child has no athlete to reference yet — the child
 * is created inside the booking transaction (decision E). A recognised parent
 * picks an existing one. The `new` branch borrows `createAthleteSchema`'s rules by
 * composition rather than restating the min/max.
 */
export function createBookingSchema(t: ValidationTranslator) {
  return z.object({
    groupTypeSlug: z.string().min(1),
    sessionId: z.string().min(1),
    paymentMethod,
    participant: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("existing"), athleteId: z.string().min(1, t("athleteRequired")) }),
      z.object({
        kind: z.literal("new"),
        name: z.string().trim().min(2, t("athleteNameMin")).max(160),
        age: z.coerce.number().int().min(1).max(120).optional(),
      }),
    ]),
  });
}

export type PriceSnapshot = z.infer<typeof priceSnapshot>;
export type CreateBookingValues = z.infer<ReturnType<typeof createBookingSchema>>;
