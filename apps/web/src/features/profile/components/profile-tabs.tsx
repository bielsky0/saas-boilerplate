"use client";

import { useTranslations } from "next-intl";
import { parseAsString, useQueryState } from "nuqs";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { ProfileView } from "@/features/profile/components/profile-view";
import { useProfile } from "@/features/profile/hooks/use-profile";
import { ConnectionsTab } from "@/features/connections/components/connections-tab";

/**
 * Profile tabs (etap 5, faza 5.2) — `?view=profile|connections`, same pattern
 * as the settings tabs. Profile tab shows the session view card + the name
 * form; connections tab manages the user graph.
 */
export function ProfileTabs() {
  const t = useTranslations("profile");
  const { data: user } = useProfile();
  const [view, setView] = useQueryState(
    "view",
    parseAsString.withDefault("profile").withOptions({
      history: "push",
      shallow: true,
      clearOnDefault: true,
    }),
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {user ? <ProfileView user={user} /> : null}
      <Tabs value={view} onValueChange={(value) => void setView(value)}>
        <div className="overflow-x-auto sm:overflow-visible">
          <TabsList
            variant="line"
            className="h-fit! w-max min-w-full flex-nowrap justify-start gap-0 rounded-none border-b p-0 sm:w-full sm:flex-wrap"
          >
            <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger>
            <TabsTrigger value="connections">{t("tabs.connections")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="profile">
          <ProfileForm />
        </TabsContent>
        <TabsContent value="connections">
          <ConnectionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
