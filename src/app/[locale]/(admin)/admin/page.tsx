import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/features/admin/context";

/**
 * Admin panel entry (spec 6.2). Guards first, then sends on to the users list —
 * the guard runs BEFORE the redirect so an unauthorized caller gets a 403 here
 * rather than being bounced to a page that then 403s.
 */
export default async function AdminIndexPage() {
  await requireSuperAdmin();
  redirect("/admin/users");
}
