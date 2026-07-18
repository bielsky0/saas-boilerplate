import { requireSession } from "@/lib/auth";

import { ConsentForm } from "./consent-form";

/**
 * OAuth consent screen (spec 26 — AI Agent).
 *
 * Reached only AFTER the engine has established a session (the authorize endpoint
 * redirects here with `consent_code`, `client_id` and `scope`), so it stays behind
 * the normal route guard — `requireSession` is defence in depth, not the boundary.
 * The user's Allow/Deny is POSTed by the client form to the engine's
 * `/api/auth/oauth2/consent` endpoint, which mints (or refuses) the access token.
 */
export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

  const consentCode = first(params.consent_code);
  const clientId = first(params.client_id);
  const scopes = first(params.scope).split(" ").filter(Boolean);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <ConsentForm consentCode={consentCode} clientId={clientId} scopes={scopes} />
    </main>
  );
}
