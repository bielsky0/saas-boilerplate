import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Spec §8.2, §9.1 — sitemap.xml lists every published post and updates itself as
 * content is published.
 *
 * These specs touch no database and need no session, so the suite's usual
 * unique-data rule (uniqueEmail(), unique slugs) does not apply here. Content is
 * the boilerplate's own example posts, which are stable fixtures by design.
 */

const BLOG_DIR = path.join(process.cwd(), "src/content/blog");

/** Every URL in the sitemap, as root-relative paths. */
async function sitemapPaths(baseURL: string, xml: string): Promise<string[]> {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!.replace(baseURL, "") || "/");
}

test("sitemap.xml is served as XML and lists the public pages", async ({ request, baseURL }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("xml");

  const paths = await sitemapPaths(baseURL!, await res.text());

  expect(paths).toContain("/");
  expect(paths).toContain("/blog");
  expect(paths).toContain("/docs");
  expect(paths).toContain("/changelog");

  // Public but unindexable: reachable without a session, deliberately not listed.
  expect(paths).not.toContain("/login");
  expect(paths).not.toContain("/signup");
});

/**
 * The one failure the registry design cannot catch at compile time: creating a
 * post's files and forgetting to add the line to src/content/blog/index.ts.
 * Nothing imports the orphan, so nothing errors — it is simply invisible. Here,
 * fs is available and cheap, so the test is what notices.
 */
test("every published post directory appears in the sitemap", async ({ request, baseURL }) => {
  const paths = await sitemapPaths(baseURL!, await (await request.get("/sitemap.xml")).text());
  const slugs = readdirSync(BLOG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  expect(slugs.length).toBeGreaterThan(0);

  for (const slug of slugs) {
    const meta = readFileSync(path.join(BLOG_DIR, slug, "meta.ts"), "utf8");
    const status = /status:\s*"(draft|published)"/.exec(meta)?.[1];

    /*
     * Fail loudly rather than skip. If status stops being a literal (moved to a
     * variable, renamed), this regex silently misses and every assertion below
     * would vacuously pass — the test would go green precisely when it stopped
     * testing anything.
     */
    if (!status) {
      throw new Error(
        `Could not read status from ${slug}/meta.ts. If the meta shape changed, update this test — do not let it pass vacuously.`,
      );
    }

    if (status === "published") {
      expect(
        paths,
        `published post "${slug}" is missing from the sitemap — is it in src/content/blog/index.ts?`,
      ).toContain(`/blog/${slug}`);
    } else {
      expect(paths, `draft "${slug}" must never reach the sitemap`).not.toContain(`/blog/${slug}`);
    }
  }
});

test("a draft is not published: absent from the index and 404 at its URL", async ({
  page,
  request,
}) => {
  const draft = "scaling-postgres-for-multi-tenancy";

  expect((await request.get(`/blog/${draft}`)).status()).toBe(404);

  await page.goto("/blog");
  await expect(page.getByRole("link", { name: "Scaling Postgres for multi-tenancy" })).toHaveCount(
    0,
  );
});

test("no URL in the sitemap is broken", async ({ request, baseURL }) => {
  const paths = await sitemapPaths(baseURL!, await (await request.get("/sitemap.xml")).text());

  for (const p of paths) {
    expect(
      (await request.get(p)).status(),
      `${p} is listed in the sitemap but does not resolve`,
    ).toBe(200);
  }
});

test("robots.txt points at the sitemap and disallows the unindexable pages", async ({
  request,
}) => {
  const body = await (await request.get("/robots.txt")).text();

  expect(body).toContain("Sitemap: ");
  expect(body).toContain("/sitemap.xml");
  expect(body).toContain("Disallow: /login");
  // The route guard already hides these; naming them here would only advertise them.
  expect(body).not.toContain("/admin");
  expect(body).not.toContain("/dashboard");
});
