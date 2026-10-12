"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormMessage, Input, toast } from "@/components/ui";
import { useConnections, useToggleConnection } from "../hooks/use-connections";

/**
 * Connections tab (etap 5, faza 5.2). Add by email (neutral for unknown
 * addresses — anti-enumeration, like invitations) + list with remove.
 * Symmetric, immediate, no pending states — the model has none either.
 */
export function ConnectionsTab() {
  const t = useTranslations("connections");
  const { data, isLoading, isError } = useConnections();
  const { connect, disconnect } = useToggleConnection();
  const [error, setError] = useState<string | null>(null);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    try {
      const result = await connect.mutateAsync(email);
      if (result.ok) {
        toast.success(t(result.connected ? "added" : "addedNeutral"));
        event.currentTarget.reset();
        return;
      }
      setError(t("genericError"));
    } catch {
      setError(t("genericError"));
    }
  }

  async function onRemove(id: string) {
    await disconnect.mutateAsync(id);
  }

  const initialsOf = (name: string | null, email: string) =>
    (name ?? email)
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={onAdd}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            noValidate
          >
            <div className="flex-1">
              <FormField label={t("emailLabel")} htmlFor="connection-email">
                <Input
                  id="connection-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="off"
                />
              </FormField>
            </div>
            <Button type="submit" disabled={connect.isPending}>
              {connect.isPending ? t("adding") : t("add")}
            </Button>
          </form>
          {error ? <FormMessage className="mt-2">{error}</FormMessage> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("listTitle", { count: data?.items.length ?? 0 })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">{t("loading")}</p>
          ) : isError ? (
            <p className="text-muted-foreground text-sm" role="alert">
              {t("error")}
            </p>
          ) : (data?.items.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data?.items.map((connection) => (
                <li
                  key={connection.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="text-xs">
                        {initialsOf(connection.name, connection.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {connection.name ?? connection.email}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {connection.email}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disconnect.isPending}
                    onClick={() => void onRemove(connection.id)}
                  >
                    {t("remove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
