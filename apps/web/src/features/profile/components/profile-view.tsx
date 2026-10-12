"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import type { ProfileUser } from "../types";

/**
 * Own profile view card (etap 5, faza 5.2). Layout echoes AdminCN's
 * user-profile header (cover block, big avatar, name line) minus everything
 * without a source: no cover photo, no avatar upload, no job/location/joined
 * rows (STATIC_USER-era fields), no follow button. Initials avatar, session
 * name and email — the whole truth, nothing invented.
 */
export function ProfileView({ user }: { user: ProfileUser }) {
  const displayName = user.name ?? user.email;
  const initials = displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <Card className="py-0 pb-6">
      <div className="bg-muted h-44 overflow-hidden rounded-t-xl" aria-hidden />
      <CardContent>
        <div className="flex items-end gap-4 pb-1 max-md:flex-col max-md:items-center md:flex-nowrap md:gap-6">
          <Avatar className="ring-card z-3 -mt-12 size-28 rounded-md ring-4 after:rounded-[inherit] md:-mt-14">
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-2 text-center md:text-left">
            <h2 className="text-2xl font-medium">{displayName}</h2>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
