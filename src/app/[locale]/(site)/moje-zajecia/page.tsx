import { getLocale, getTranslations } from "next-intl/server";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { CancelMyBookingButton } from "@/features/bookings/components/cancel-my-booking-button";
import { getActiveBookingsForClient } from "@/features/bookings/data";
import { resolveClientSession } from "@/features/client-auth/session";
import { requireServedOrganization } from "@/features/organizations/served-org";
import { withTenant } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

export default async function MyBookingsPage() {
  const org = await requireServedOrganization();
  const locale = await getLocale();
  const t = await getTranslations("enrollment");

  const principal = await resolveClientSession(org.id);
  if (!principal || !principal.isVerified) {
    return <p>{t("errors.verifyFirst")}</p>;
  }

  const bookings = await withTenant(org.id, (tx) =>
    getActiveBookingsForClient(tx, org.id, principal.clientId),
  );

  const formatWhen = new Intl.DateTimeFormat(locale, {
    timeZone: org.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("myBookings")}</h1>

      {bookings.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noBookings")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.session")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((row) => {
              const isPast = row.sessionStartTime < new Date();
              return (
                <TableRow key={row.bookingId}>
                  <TableCell>
                    <div className="font-medium">{row.groupTypeName}</div>
                    <div className="text-muted-foreground text-sm">
                      {formatWhen.format(row.sessionStartTime)}
                    </div>
                  </TableCell>
                  <TableCell>{row.paymentStatus}</TableCell>
                  <TableCell className="text-right">
                    {!isPast ? (
                      <CancelMyBookingButton bookingId={row.bookingId} />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
