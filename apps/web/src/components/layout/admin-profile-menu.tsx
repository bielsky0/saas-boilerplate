"use client";

import { SettingsIcon, UserIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/lib/i18n/navigation";

/**
 * Session-backed profile menu (etap 4, faza 2). Layout ported from AdminCN's
 * `ProfileDropdown`, but the hardcoded STATIC_USER (John Doe) is replaced by
 * the real session passed from the server layout. Avatar is initials-only —
 * our user model has no avatar URL. No sign-out item here: the standalone
 * `SignOutButton` stays in the header (existing E2E depends on it).
 */
export function AdminProfileMenu({ user }: { user: { name: string | null; email: string } }) {
  const displayName = user.name ?? user.email;
  const initials = displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            // Stable prefix: the suffix is name-or-email, whichever the
            // session carries — tests and AT match on the prefix.
            aria-label={`Profile: ${displayName}`}
            className="relative rounded-full hover:bg-transparent"
          />
        }
      >
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="ring-card absolute bottom-0 right-0 block size-2 rounded-full bg-green-600 ring-2" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-4 px-2 py-2.5 font-normal">
            <div className="relative">
              <Avatar className="size-10">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="ring-card absolute bottom-0 right-0 block size-2 rounded-full bg-green-600 ring-2" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-start">
              <span className="text-foreground w-full truncate text-base font-semibold">
                {displayName}
              </span>
              <span className="text-muted-foreground w-full truncate text-sm">{user.email}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/dashboard" />}>
            <UserIcon />
            <span>My Account</span>
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings/notifications" />}>
            <SettingsIcon />
            <span>Settings</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
