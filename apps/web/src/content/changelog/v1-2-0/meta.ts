import { defineChangelogMeta } from "@/features/content/schema";

export default defineChangelogMeta({
  title: "Emails and background jobs",
  description: "Transactional email behind an adapter, plus a retrying job queue.",
  status: "published",
  version: "1.2.0",
  releasedAt: "2026-07-15",
  kind: "minor",
});
