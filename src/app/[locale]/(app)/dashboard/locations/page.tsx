import { getTranslations } from "next-intl/server";

import {
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
import { requireOrgPermission } from "@/features/organizations/context";
import { listLocations } from "@/features/locations/data";
import {
  CreateLocationForm,
  EditLocationForm,
} from "@/features/locations/components/location-forms";
import { withTenant } from "@/lib/db/tenant";

/**
 * Locations (langlion §2.12, EPIK 22 — admin half).
 *
 * Gated by `requireOrgPermission`, not `requireOrgAccess`: unlike Members, this
 * page has nothing a viewer without `locations.manage` should read, so the whole
 * route is the boundary rather than the individual buttons.
 */
export default async function LocationsPage() {
  const { org } = await requireOrgPermission("locations.manage");
  const t = await getTranslations("locations");

  const locations = await withTenant(org.id, (tx) => listLocations(tx, org.id));

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
          <CreateLocationForm />
        </CardContent>
      </Card>

      {locations.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.address")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">{row.address ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <EditLocationForm locationId={row.id} name={row.name} address={row.address} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
