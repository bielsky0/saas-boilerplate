"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@/components/ui";

/** One file as rendered in the demo list (server passes these props). */
export type FileRow = {
  id: string;
  originalName: string;
  visibility: "public" | "private";
};

/**
 * Demo file list (spec 21.3). "Open" resolves a usable URL through the read
 * endpoint (a fresh presigned GET for private files); "Delete" soft-deletes and
 * refreshes. Delete is shown only when the caller has `storage.delete` — cosmetic
 * gating over the server's real check (§4.2).
 */
export function FileList({ files, canDelete }: { files: FileRow[]; canDelete: boolean }) {
  const t = useTranslations("storage");
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function open(id: string): Promise<void> {
    const res = await fetch(`/api/storage/file/${id}`);
    if (!res.ok) {
      toast.error(t("errors.open"));
      return;
    }
    const { url } = (await res.json()) as { url: string };
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function remove(id: string): Promise<void> {
    setPendingId(id);
    try {
      const res = await fetch(`/api/storage/file/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(t("errors.delete"));
        return;
      }
      toast.success(t("deleted"));
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (files.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.name")}</TableHead>
          <TableHead>{t("columns.visibility")}</TableHead>
          <TableHead className="text-right">{t("columns.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((f) => (
          <TableRow key={f.id}>
            <TableCell className="font-medium">{f.originalName}</TableCell>
            <TableCell>
              <Badge variant="outline">{t(`visibility.${f.visibility}`)}</Badge>
            </TableCell>
            <TableCell className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => open(f.id)}>
                {t("open")}
              </Button>
              {canDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pendingId === f.id}
                  onClick={() => remove(f.id)}
                >
                  {t("delete")}
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
