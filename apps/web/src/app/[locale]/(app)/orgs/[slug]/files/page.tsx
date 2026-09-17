import { getTranslations } from "next-intl/server";

import { ApiError } from "@repo/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { hasPermission } from "@/features/rbac";
import { requireOrgAccess } from "@/features/organizations/context";
import { api } from "@/lib/api";
import { FileList } from "@/features/storage/components/file-list";
import { FileUpload } from "@/features/storage/components/file-upload";

/**
 * Organization files (spec 21 demo surface). Access via `requireOrgAccess`
 * (403/404 for non-members/unknown slugs); the list is read from Nest
 * (`GET /v1/storage/files`, faza 2.4) — the page renders, it never touches
 * the database. The upload control renders only with `storage.upload`
 * (cosmetic — the API re-checks).
 */
export default async function OrgFilesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { role } = await requireOrgAccess(slug);
  const t = await getTranslations("storage");

  let files: { id: string; originalName: string; visibility: "public" | "private" }[] = [];
  try {
    const data = await api().get<{ items: typeof files }>(
      `/v1/storage/files?slug=${encodeURIComponent(slug)}`,
    );
    files = data.items;
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 404)) {
      throw error;
    }
    // Unauthenticated (or a vanished org mid-render) reads as an empty list
    // rather than failing the page — the guard above already redirected
    // anonymous visitors.
  }

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
