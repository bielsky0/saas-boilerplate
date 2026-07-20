import { type APIRequestContext } from "@playwright/test";
import { tenantUrl } from "./host-fixtures";
import { expect, test } from "./rate-limit-fixtures";

import { loginToAcademy, registerViaApi, seedOrg, TEST_PASSWORD, uniqueEmail } from "./helpers";

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

/**
 * Presign → POST to the bucket → confirm. Returns the file id + bare object URL.
 *
 * `subdomain` selects the OWNER by choosing which host to call (F4.6): an academy
 * host stores under that academy, the apex under the caller's personal account.
 * Omit it for the personal case. There is no tenant field in any of these bodies
 * any more — that is the point of the change.
 */
async function uploadPng(
  request: APIRequestContext,
  visibility: "public" | "private",
  subdomain?: string,
): Promise<{ fileId: string; bareUrl: string }> {
  const at = (path: string) => (subdomain ? tenantUrl(subdomain, path) : path);
  const presignRes = await request.post(at("/api/storage/presign"), {
    data: {
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

  const confirmRes = await request.post(at("/api/storage/confirm"), { data: { fileId } });
  expect(confirmRes.ok()).toBeTruthy();

  return { fileId, bareUrl: `${upload.url}/${upload.fields.key}` };
}

test("a private file's bare URL is denied; a public file's is served", async ({ page }) => {
  const owner = uniqueEmail("owner");
  await registerViaApi(page.request, owner);
  const { subdomain } = await seedOrg(page.request, { ownerEmail: owner, name: "Storage Co" });
  await loginToAcademy(page, subdomain, owner, TEST_PASSWORD);

  const priv = await uploadPng(page.request, "private", subdomain);
  const pub = await uploadPng(page.request, "public", subdomain);

  // Bare object URL, unsigned: private denied, public served (spec 21.3).
  const privBare = await page.request.get(priv.bareUrl);
  expect(privBare.status()).toBeGreaterThanOrEqual(400);
  const pubBare = await page.request.get(pub.bareUrl);
  expect(pubBare.status()).toBe(200);

  // The read endpoint hands back a URL that actually works for the private file.
  const readRes = await page.request.get(tenantUrl(subdomain, `/api/storage/file/${priv.fileId}`));
  expect(readRes.ok()).toBeTruthy();
  const { url } = (await readRes.json()) as { url: string };
  const signed = await page.request.get(url);
  expect(signed.status()).toBe(200);
});

test("an oversized or disallowed-type upload is rejected before storage", async ({ page }) => {
  const owner = uniqueEmail("owner");
  await registerViaApi(page.request, owner);
  const { subdomain } = await seedOrg(page.request, { ownerEmail: owner, name: "Reject Co" });
  await loginToAcademy(page, subdomain, owner, TEST_PASSWORD);

  // Disallowed MIME type.
  const badType = await page.request.post(tenantUrl(subdomain, "/api/storage/presign"), {
    data: {
      filename: "evil.exe",
      contentType: "application/x-msdownload",
      size: 10,
      visibility: "private",
    },
  });
  expect(badType.status()).toBe(422);
  expect((await badType.json()).upload).toBeUndefined();

  // Oversized declaration (> MAX_UPLOAD_BYTES = 10 MiB).
  const tooBig = await page.request.post(tenantUrl(subdomain, "/api/storage/presign"), {
    data: {
      filename: "huge.png",
      contentType: "image/png",
      size: 50 * 1024 * 1024,
      visibility: "private",
    },
  });
  expect(tooBig.status()).toBe(422);
  expect((await tooBig.json()).upload).toBeUndefined();
});

test("a file owned by academy A is invisible from academy B (tenant isolation)", async ({
  page,
}) => {
  /*
   * One user in TWO academies — the file is A's, and B is a perfectly valid
   * context for the same person, so a 404 proves the DATA LAYER scopes by owner
   * rather than the user merely lacking access to B.
   *
   * THE CONTEXT IS THE HOST NOW (F4.6), not a `?slug=` parameter. That is the
   * substance of the change rather than its cosmetics: the caller used to name
   * the tenant it wanted the file from, and this test used to prove the server
   * checked that name. It can no longer name one at all.
   */
  const user = uniqueEmail("multi");
  await registerViaApi(page.request, user);
  const { subdomain: subA } = await seedOrg(page.request, { ownerEmail: user, name: "Org A" });
  const { subdomain: subB } = await seedOrg(page.request, { ownerEmail: user, name: "Org B" });

  // Each academy is its own authentication (§2.19 exception #5).
  await loginToAcademy(page, subA, user, TEST_PASSWORD);
  const { fileId } = await uploadPng(page.request, "private", subA);

  // Same file id, academy A's host → visible.
  const inA = await page.request.get(tenantUrl(subA, `/api/storage/file/${fileId}`));
  expect(inA.status()).toBe(200);

  // Same file id, academy B's host → 404 (owner-scoped miss, not 403).
  await loginToAcademy(page, subB, user, TEST_PASSWORD);
  const inB = await page.request.get(tenantUrl(subB, `/api/storage/file/${fileId}`));
  expect(inB.status()).toBe(404);
});
