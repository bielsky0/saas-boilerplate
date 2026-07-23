import { getLocale, getTranslations } from "next-intl/server";

import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { Link } from "@/lib/i18n/navigation";
import { requireOrgPermission } from "@/features/organizations/context";
import { listLocations } from "@/features/locations/data";
import { listUpcomingSessions } from "@/features/schedule/data";
import { SessionEditForm } from "@/features/schedule/components/session-edit-form";
import { withTenant } from "@/lib/db/tenant";

/**
 * The staff schedule (langlion §2.12, US-22.5).
 *
 * Upcoming sessions with an optional location filter — the second of the two jobs
 * a location has (the first being telling parents where to go).
 *
 * THE FILTER IS A LINK, NOT A CLIENT COMPONENT. It lives in the query string, so
 * a filtered schedule is a URL an admin can bookmark or send to a colleague, and
 * the page keeps working with JavaScript disabled. Reaching for `useState` here
 * would cost both properties and buy nothing.
 *
 * Times render in the ACADEMY's zone, not the reader's. An admin in another
 * country planning a Warsaw academy's season needs to see the hour the class
 * actually starts locally; US-1.2/AC2's per-viewer conversion is about the
 * client-facing pages, not this one.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location: locationFilter } = await searchParams;
  const { org } = await requireOrgPermission("sessions.manage");
  const [t, locale] = await Promise.all([getTranslations("schedule"), getLocale()]);

  const { sessions, locations } = await withTenant(org.id, async (tx) => ({
    sessions: await listUpcomingSessions(tx, org.id, { locationId: locationFilter }),
    locations: await listLocations(tx, org.id),
  }));

  const formatWhen = new Intl.DateTimeFormat(locale, {
    timeZone: org.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  /**
   * An instant rendered as `YYYY-MM-DDTHH:mm` in the ACADEMY's zone, which is the
   * only format `<input type="datetime-local">` accepts.
   *
   * The control has no zone of its own, so whatever string it is given is what
   * the admin sees and edits. Handing it a UTC instant would show a Warsaw
   * academy's 17:00 class as 16:00 to anyone whose browser is not in Warsaw — and
   * they would "fix" it into being genuinely wrong. `en-CA` gives the ISO-shaped
   * date; the parts are reassembled because `sv-SE` and friends differ on the
   * separator.
   */
  const toLocalInput = (instant: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: org.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(instant);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("subtitle")} · {org.timezone}
        </p>
      </div>

      {locations.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-2" aria-label={t("filter.location")}>
          <Button asChild size="sm" variant={locationFilter ? "outline" : "secondary"}>
            <Link href={`/dashboard/schedule`}>{t("filter.all")}</Link>
          </Button>
          {locations.map((row) => (
            <Button
              key={row.id}
              asChild
              size="sm"
              variant={locationFilter === row.id ? "secondary" : "outline"}
            >
              <Link href={`/dashboard/schedule?location=${row.id}`}>{row.name}</Link>
            </Button>
          ))}
        </nav>
      ) : null}

      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.when")}</TableHead>
              <TableHead>{t("table.groupType")}</TableHead>
              <TableHead>{t("table.trainer")}</TableHead>
              <TableHead>{t("table.location")}</TableHead>
              <TableHead>{t("table.capacity")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  {formatWhen.format(row.startTime)}
                </TableCell>
                <TableCell>{row.groupTypeName}</TableCell>
                <TableCell>{row.trainerName || row.trainerEmail || t("noTrainer")}</TableCell>
                <TableCell>{row.locationName ?? t("noLocation")}</TableCell>
                <TableCell className="tabular-nums">{row.capacity}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={row.status === "cancelled" ? "warning" : "outline"}>
                      {t(row.status === "cancelled" ? "status.cancelled" : "status.scheduled")}
                    </Badge>
                    {/*
                      Visible because it changes what a later pattern edit will do
                      to this row: a bulk update skips it (§3.4/AC8). An admin
                      wondering why one week did not move needs this on screen,
                      not in the audit trail.
                    */}
                    {row.isManuallyAdjusted ? (
                      <Badge variant="outline">{t("manuallyAdjusted")}</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right align-top">
                  <div className="flex flex-col items-end gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/sessions/${row.id}`}>{t("roster")}</Link>
                    </Button>
                    <SessionEditForm
                      sessionId={row.id}
                      startLocal={toLocalInput(row.startTime)}
                      endLocal={toLocalInput(row.endTime)}
                      locationId={row.locationId}
                      capacity={row.capacity}
                      locations={locations}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
