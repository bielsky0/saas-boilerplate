import { getTranslations } from "next-intl/server";

import {
  Badge,
  Button,
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
import { Link } from "@/lib/i18n/navigation";
import { requireOrgPermission } from "@/features/organizations/context";
import { listGroupTypes } from "@/features/groups/data";
import { listLocations } from "@/features/locations/data";
import { GroupTypeForm } from "@/features/groups/components/group-type-form";
import { withTenant } from "@/lib/db/tenant";

/**
 * Group types (langlion EPIK 2) — the academy's offers.
 *
 * Reads both tables in ONE transaction rather than two `withTenant` calls: each
 * would take its own pooled connection to render one page, and both need the
 * tenant GUC. Sequential inside one transaction is two round-trips on one
 * connection (the pattern established in members/page.tsx).
 */
export default async function GroupTypesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org } = await requireOrgPermission(slug, "group_types.manage");
  const t = await getTranslations("groups");

  const { groupTypes, locations } = await withTenant(org.id, async (tx) => ({
    groupTypes: await listGroupTypes(tx, org.id),
    locations: await listLocations(tx, org.id),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      {groupTypes.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.slug")}</TableHead>
              <TableHead>{t("table.engine")}</TableHead>
              <TableHead>{t("table.price")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupTypes.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {row.slug}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {t(
                      `engine.${row.engine}` as
                        "engine.schedule_first" | "engine.availability_first" | "engine.slot_first",
                    )}
                  </Badge>
                </TableCell>
                {/*
                  Minor units shown as stored (§2.14). Formatting them as currency
                  needs `organization.currency` through Intl, which arrives with
                  the client-facing pages in F5 — showing a wrong symbol here
                  would be worse than showing the raw integer an admin typed.
                */}
                <TableCell className="tabular-nums">{row.price}</TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/orgs/${slug}/group-types/${row.id}`}>{t("manage")}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("form.createTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupTypeForm slug={slug} locations={locations} />
        </CardContent>
      </Card>
    </div>
  );
}
