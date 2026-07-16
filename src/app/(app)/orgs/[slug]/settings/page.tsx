import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { hasPermission } from "@/features/rbac";
import { requireOrgPermission } from "@/features/organizations/context";
import { DeleteOrgButton, OrgSettingsForm } from "@/features/organizations/components/org-settings";

/**
 * Organization settings (spec §3.2). Guarded by `organization.update`, so a Member
 * hitting this route directly gets a real 403 (`forbidden`) — enforcement is on
 * the backend, independent of the hidden nav link (spec §4.2). Delete is further
 * gated to Owners.
 */
export default async function OrgSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, role } = await requireOrgPermission(slug, "organization.update");
  const canDelete = hasPermission(role, "organization.delete");

  return (
    <div className="flex max-w-md flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">{org.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent>
          <OrgSettingsForm slug={slug} name={org.name} />
        </CardContent>
      </Card>

      {canDelete ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <p className="text-muted-foreground text-sm">
              Deleting an organization removes access for all members.
            </p>
          </CardHeader>
          <CardContent>
            <DeleteOrgButton slug={slug} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
