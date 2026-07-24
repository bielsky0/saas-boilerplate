import { getPlansWithDetails, getAllOrgOverrides } from "@/features/admin/plans-data";
import { requireSuperAdmin } from "@/features/admin/context";
import AdminPlansClient from "./page-client";

export default async function AdminPlansPage() {
  await requireSuperAdmin();

  const [plans, overrides] = await Promise.all([
    getPlansWithDetails(),
    getAllOrgOverrides(),
  ]);

  return <AdminPlansClient initialPlans={plans} initialOverrides={overrides} />;
}