import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { hasPermission } from "@/features/rbac";
import { requireOrgAccess } from "@/features/organizations/context";
import { listFilesForOwner } from "@/features/storage/data";
import { withOwner } from "@/lib/db/tenant";
import { FileList } from "@/features/storage/components/file-list";
import { FileUpload } from "@/features/storage/components/file-upload";

/**
 * Organization files (spec 21 demo surface). Access via `requireOrgAccess`
 * (403/404 for non-members/unknown slugs); the list is read server-side through
 * the owner-scoped data layer, so org A never sees org B's files. The upload
 * control renders only with `storage.upload` (cosmetic — the API re-checks).
 */
export default async function OrgFilesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { org, role } = await requireOrgAccess(slug);
  const t = await getTranslations("storage");

  const owner = { kind: "organization", organizationId: org.id } as const;
  const rows = await withOwner(owner, (tx) => listFilesForOwner(tx, owner));
  const files = rows.map((f) => ({
    id: f.id,
    originalName: f.originalName,
    visibility: f.visibility,
  }));

  const canUpload = hasPermission(role, "storage.upload");
  const canDelete = hasPermission(role, "storage.delete");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      {canUpload ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("uploadTitle")}</CardTitle>
            <CardDescription>{t("uploadHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload slug={slug} />
          </CardContent>
        </Card>
      ) : null}

      <FileList slug={slug} files={files} canDelete={canDelete} />
    </div>
  );
}
