import { getTranslations } from "next-intl/server";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { listClients } from "@/features/clients/data";
import { GrantCreditsForm } from "@/features/credits/components/grant-credits-form";
import { listCreditsForClient, listCreditTypes } from "@/features/credits/data";
import { requireOrgPermission } from "@/features/organizations/context";
import { athlete } from "@/lib/db/schema";
import { withTenant } from "@/lib/db/tenant";
import { eq, and, isNull } from "drizzle-orm";

/**
 * Credits (langlion §2.4, EPIK 7 — the admin half).
 *
 * Gated by `requireOrgPermission` on the whole route rather than per control:
 * there is nothing on this page a staff member without `credits.manual_grant`
 * should read. The ledger below shows who was given what and why, which is
 * management information about money, not a participant list.
 *
 * WHAT THIS PAGE IS NOT. It is not the parent's wallet (US-7.6, F13) and not a
 * booking surface (F5). F4 builds the engine; this is the one place in it that
 * needs a human to make a decision, so it is the one place that gets a screen.
 */
export default async function CreditsPage() {
  const { org } = await requireOrgPermission("credits.manual_grant");
  const t = await getTranslations("credits");

  const { clients, creditTypes, athletes, ledger } = await withTenant(org.id, async (tx) => {
    const [clients, creditTypes] = await Promise.all([
      listClients(tx, org.id),
      listCreditTypes(tx, org.id),
    ]);

    const athletes = await tx
      .select({
        id: athlete.id,
        name: athlete.name,
        parentClientId: athlete.parentClientId,
      })
      .from(athlete)
      .where(and(eq(athlete.organizationId, org.id), isNull(athlete.deletedAt)))
      .orderBy(athlete.name);

    // One query per parent rather than one grouped query: this page exists for an
    // academy with a handful of clients making occasional goodwill gestures, and
    // the readable version is the right default until a real dataset says
    // otherwise. Revisit when the wallet (F13) needs the same data at scale.
    const ledger = await Promise.all(
      clients.map(async (parent) => ({
        client: parent,
        credits: await listCreditsForClient(tx, org.id, parent.id),
      })),
    );

    return { clients, creditTypes, athletes, ledger };
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("form.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {clients.length === 0 || creditTypes.length === 0 ? (
            // Not an error state: a new academy has neither parents nor credit
            // types yet, and a grant form over two empty pickers would be a
            // control that cannot succeed.
            <p className="text-muted-foreground text-sm">{t("form.prerequisites")}</p>
          ) : (
            <GrantCreditsForm
              clients={clients.map((row) => ({
                id: row.id,
                email: row.email,
                isVerified: row.isVerified,
              }))}
              creditTypes={creditTypes.map((row) => ({ id: row.id, name: row.name }))}
              athletes={athletes}
            />
          )}
        </CardContent>
      </Card>

      {ledger.every((entry) => entry.credits.length === 0) ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.client")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.source")}</TableHead>
              <TableHead>{t("table.validUntil")}</TableHead>
              <TableHead>{t("table.reason")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.flatMap((entry) =>
              entry.credits.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{entry.client.email}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "available" ? "success" : "outline"}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.source}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {/*
                      Rendered in the ACADEMY's zone, not the reader's. A credit
                      expiring "31 Jan" for an admin in Warsaw must not read
                      "30 Jan" for one travelling — the deadline belongs to the
                      academy (US-1.2/AC3), and `validUntil` is the exclusive
                      boundary, so the last valid day is the one before it.
                    */}
                    {new Intl.DateTimeFormat("en", {
                      timeZone: org.timezone,
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(row.validUntil.getTime() - 1))}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.reason ?? "—"}</TableCell>
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
