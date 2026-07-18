import { type APIRequestContext, type Page } from "@playwright/test";
import { expect, test } from "./rate-limit-fixtures";

import { loginViaUi, registerViaApi, seedOrg, TEST_PASSWORD, uniqueEmail } from "./helpers";

/**
 * Spec §21 — Storage acceptance criteria, exercised against real MinIO:
 *   1. a PRIVATE file's bare object URL is denied; a PUBLIC file's is served.
 *   2. an oversized / disallowed-type upload is rejected BEFORE anything is stored.
 *   3. a file owned by org A is invisible from org B (tenant isolation, §21.3),
 *      returned as 404 by the owner-scoped data layer — the analogue of the Faza 1
 *      isolation test.
 */

// A 1×1 PNG — small, valid, and an allowed content type.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_BYTES = Buffer.from(PNG_BASE64, "base64");

type Presigned = {
  fileId: string;
  upload: { url: string; fields: Record<string, string> };
};

/** Presign → POST to the bucket → confirm. Returns the file id + bare object URL. */
async function uploadPng(
  request: APIRequestContext,
  slug: string,
  visibility: "public" | "private",
): Promise<{ fileId: string; bareUrl: string }> {
  const presignRes = await request.post("/api/storage/presign", {
    data: {
      slug,
      filename: "pixel.png",
      contentType: "image/png",
      size: PNG_BYTES.length,
      visibility,
    },
  });
  expect(presignRes.status(), await presignRes.text()).toBe(201);
  const { fileId, upload } = (await presignRes.json()) as Presigned;

  // Direct-to-bucket multipart POST: policy fields first, the file LAST.
  const bucketRes = await request.post(upload.url, {
    multipart: {
      ...upload.fields,
      file: { name: "pixel.png", mimeType: "image/png", buffer: PNG_BYTES },
    },
  });
  expect(bucketRes.status(), await bucketRes.text()).toBeLessThan(300);

  const confirmRes = await request.post("/api/storage/confirm", { data: { slug, fileId } });
  expect(confirmRes.ok()).toBeTruthy();

  return { fileId, bareUrl: `${upload.url}/${upload.fields.key}` };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await loginViaUi(page, email, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");
}

test("a private file's bare URL is denied; a public file's is served", async ({ page }) => {
  const owner = uniqueEmail("owner");
  await registerViaApi(page.request, owner);
  const slug = await seedOrg(page.request, { ownerEmail: owner, name: "Storage Co" });
  await login(page, owner);

  const priv = await uploadPng(page.request, slug, "private");
  const pub = await uploadPng(page.request, slug, "public");

  // Bare object URL, unsigned: private denied, public served (spec 21.3).
  const privBare = await page.request.get(priv.bareUrl);
  expect(privBare.status()).toBeGreaterThanOrEqual(400);
  const pubBare = await page.request.get(pub.bareUrl);
  expect(pubBare.status()).toBe(200);

  // The read endpoint hands back a URL that actually works for the private file.
  const readRes = await page.request.get(
    `/api/storage/file/${priv.fileId}?slug=${encodeURIComponent(slug)}`,
  );
  expect(readRes.ok()).toBeTruthy();
  const { url } = (await readRes.json()) as { url: string };
  const signed = await page.request.get(url);
  expect(signed.status()).toBe(200);
});

test("an oversized or disallowed-type upload is rejected before storage", async ({ page }) => {
  const owner = uniqueEmail("owner");
  await registerViaApi(page.request, owner);
  const slug = await seedOrg(page.request, { ownerEmail: owner, name: "Reject Co" });
  await login(page, owner);

  // Disallowed MIME type.
  const badType = await page.request.post("/api/storage/presign", {
    data: {
      slug,
      filename: "evil.exe",
      contentType: "application/x-msdownload",
      size: 10,
      visibility: "private",
    },
  });
  expect(badType.status()).toBe(422);
  expect((await badType.json()).upload).toBeUndefined();

  // Oversized declaration (> MAX_UPLOAD_BYTES = 10 MiB).
  const tooBig = await page.request.post("/api/storage/presign", {
    data: {
      slug,
      filename: "huge.png",
      contentType: "image/png",
      size: 50 * 1024 * 1024,
      visibility: "private",
    },
  });
  expect(tooBig.status()).toBe(422);
  expect((await tooBig.json()).upload).toBeUndefined();
});

test("a file owned by org A is invisible from org B (tenant isolation)", async ({ page }) => {
  // One user in TWO orgs — the file is org A's; org B is a valid context for the
  // same user, so a 404 here proves the DATA LAYER scopes by owner, not that the
  // user simply lacks access to org B.
  const user = uniqueEmail("multi");
  await registerViaApi(page.request, user);
  const slugA = await seedOrg(page.request, { ownerEmail: user, name: "Org A" });
  const slugB = await seedOrg(page.request, { ownerEmail: user, name: "Org B" });
  await login(page, user);

  const { fileId } = await uploadPng(page.request, slugA, "private");

  // Same file id, org A context → visible.
  const inA = await page.request.get(
    `/api/storage/file/${fileId}?slug=${encodeURIComponent(slugA)}`,
  );
  expect(inA.status()).toBe(200);

  // Same file id, org B context → 404 (owner-scoped miss, not 403).
  const inB = await page.request.get(
    `/api/storage/file/${fileId}?slug=${encodeURIComponent(slugB)}`,
  );
  expect(inB.status()).toBe(404);
});
