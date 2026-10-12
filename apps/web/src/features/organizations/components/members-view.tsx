"use client";

import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatContentDate } from "@/features/content/format";
import { InviteMemberForm } from "./invite-member-form";
import { RevokeInviteButton } from "./invitation-actions";
import { useInvitations } from "../hooks/use-members";
import { MembersTable } from "./members-table/members-table";

/**
 * Org members view (etap 4, faza 4). Same three sections as the RSC page it
 * replaces (invite card, members table, pending invitations) — but the table
 * is the AdminCN users-list chrome over live Query data, and all writes go
 * through mutations with invalidation instead of `router.refresh()`.
 */
export function MembersView({
  slug,
  orgName,
  canInvite,
  canUpdateRole,
  canRemove,
  canRevoke,
}: {
  slug: string;
  orgName: string;
  canInvite: boolean;
  canUpdateRole: boolean;
  canRemove: boolean;
  canRevoke: boolean;
}) {
  const t = useTranslations("dashboard.members");
  const te = useTranslations("organizations");
  const locale = useLocale();
  const { data: pendingData } = useInvitations(slug, canRevoke);
  const pending = pendingData?.items ?? [];

  const roleLabel = (role: string) =>
    role === "owner" || role === "admin" || role === "member" ? te(`roles.${role}`) : role;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("heading")}</h1>
        <p className="text-muted-foreground text-sm">{orgName}</p>
      </div>

      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("inviteTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteMemberForm slug={slug} />
          </CardContent>
        </Card>
      ) : null}

      <MembersTable slug={slug} canUpdateRole={canUpdateRole} canRemove={canRemove} />

      {canRevoke && pending.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t("pending", { count: pending.length })}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead>{t("colRole")}</TableHead>
                <TableHead>{t("colExpires")}</TableHead>
                <TableHead className="text-right">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="truncate">{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabel(inv.role)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatContentDate(inv.expiresAt.slice(0, 10), locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <RevokeInviteButton slug={slug} invitationId={inv.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
