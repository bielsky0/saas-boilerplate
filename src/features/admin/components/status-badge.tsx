import { Badge } from "@/components/ui";
import type { UserStatus } from "../data";

/**
 * Account status chip (spec 6.2). One place to map status → colour, so the users
 * list and the detail view can never disagree about what "suspended" looks like.
 */
const VARIANTS: Record<UserStatus, "success" | "warning" | "destructive"> = {
  active: "success",
  suspended: "warning",
  deleted: "destructive",
};

export function StatusBadge({ status }: { status: UserStatus }) {
  return <Badge variant={VARIANTS[status]}>{status}</Badge>;
}
