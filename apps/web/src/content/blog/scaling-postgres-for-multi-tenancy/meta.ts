import { defineBlogMeta } from "@/features/content/schema";

/*
 * A draft, and also the fixture that proves drafts stay invisible: it is
 * registered like any other post, but `listBlogPosts()` filters it out of the
 * index, the sitemap and the search index, and `/blog/scaling-postgres-for-
 * multi-tenancy` answers 404 in production. e2e/seo-sitemap.spec.ts asserts
 * exactly that, so deleting this file weakens the suite.
 */
export default defineBlogMeta({
  title: "Scaling Postgres for multi-tenancy",
  description: "Row-level security, partitioning, and when a shared schema stops paying off.",
  status: "draft",
  publishedAt: "2026-08-01",
  author: "team",
  tags: ["architecture", "database"],
});
