import { hasPermission } from "@/features/rbac";
import { requireOrgPermission } from "@/features/organizations/context";
import { DeleteOrgButton, OrgSettingsForm } from "@/features/organizations/components/org-settings";

/**
 * Organization settings (spec 3.2). Guarded by `organization.update`, so a Member
 * hitting this route directly gets a real 403 (`forbidden`) — enforcement is on
 * the backend, independent of the hidden nav link (spec 4.2). Delete is further
 * gated to Owners.
 */
export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { org, role } = await requireOrgPermission(slug, "organization.update");
  const canDelete = hasPermission(role, "organization.delete");

  return (
    <div className="flex max-w-md flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{org.name}</p>
      </div>

      <OrgSettingsForm slug={slug} name={org.name} />

      {canDelete ? (
        <section className="flex flex-col gap-2 border-t border-black/10 pt-6 dark:border-white/10">
          <h2 className="text-sm font-medium text-red-700 dark:text-red-400">Danger zone</h2>
          <p className="text-xs text-black/60 dark:text-white/60">
            Deleting an organization removes access for all members.
          </p>
          <DeleteOrgButton slug={slug} />
        </section>
      ) : null}
    </div>
  );
}
