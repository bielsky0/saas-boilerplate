"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import {
  Button,
  FormField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@/components/ui";
import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES } from "@/features/storage";

/**
 * Demo upload control (spec 21.2). Drives the full direct-to-bucket flow entirely
 * from the browser:
 *   1. POST /api/storage/presign — backend validates + returns a presigned POST.
 *   2. POST the file straight to the bucket (never through the app server).
 *   3. POST /api/storage/confirm — mark the row ready.
 * Then `router.refresh()` re-renders the server-side list. Client-side type/size
 * checks here are UX only; the backend + bucket policy are the real gate.
 */
export function FileUpload({ slug }: { slug: string }) {
  const t = useTranslations("storage");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [busy, setBusy] = useState(false);

  async function upload(fileToUpload: File): Promise<void> {
    // Presign — the backend re-validates; this is the real authority.
    const presignRes = await fetch("/api/storage/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        filename: fileToUpload.name,
        contentType: fileToUpload.type,
        size: fileToUpload.size,
        visibility,
      }),
    });
    if (!presignRes.ok) {
      throw new Error(t("errors.presign"));
    }
    const { fileId, upload } = (await presignRes.json()) as {
      fileId: string;
      upload: { url: string; fields: Record<string, string> };
    };

    // Direct-to-bucket POST. Fields first, file LAST (S3 POST policy requires it).
    const form = new FormData();
    for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
    form.append("file", fileToUpload);
    const putRes = await fetch(upload.url, { method: "POST", body: form });
    if (!putRes.ok) {
      throw new Error(t("errors.upload"));
    }

    // Confirm.
    const confirmRes = await fetch("/api/storage/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, fileId }),
    });
    if (!confirmRes.ok) {
      throw new Error(t("errors.confirm"));
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!ALLOWED_CONTENT_TYPES.includes(selected.type as (typeof ALLOWED_CONTENT_TYPES)[number])) {
      toast.error(t("errors.type"));
      e.target.value = "";
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      toast.error(t("errors.size"));
      e.target.value = "";
      return;
    }

    setBusy(true);
    try {
      await upload(selected);
      toast.success(t("uploaded"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.upload"));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FormField label={t("visibility.label")} htmlFor="file-visibility">
        <Select value={visibility} onValueChange={(v) => setVisibility(v as "public" | "private")}>
          <SelectTrigger id="file-visibility" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">{t("visibility.private")}</SelectItem>
            <SelectItem value="public">{t("visibility.public")}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ALLOWED_CONTENT_TYPES.join(",")}
        onChange={onFileChange}
      />
      <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? t("uploading") : t("choose")}
      </Button>
    </div>
  );
}
