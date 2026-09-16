import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth";

/**
 * OAuth login bridge (spec 26 — AI Agent).
 *
 * `mcp({ loginPage: "/oauth/login" })` sends an unauthenticated authorize request
 * HERE, carrying the OAuth query. This page owns one decision and holds no UI:
 *
 *   - already signed in → hand straight back to the engine's authorize endpoint,
 *     which now sees a session and moves on to consent;
 *   - not signed in → go to the real /login, asking it to return to THIS page
 *     (a page path, so the locale prefix the sign-in flow adds is harmless) with
 *     the OAuth query intact; on return the session branch resumes the flow.
 *
 * Why a bridge instead of pointing `loginPage` at /login directly: sign-in in this
 * app is a server action calling `auth.api.signInEmail`, not the engine's HTTP
 * sign-in endpoint, so the mcp plugin's own post-login resume hook never fires.
 * The bridge makes the resume explicit and leaves the sign-in path untouched.
 */
export default async function OAuthLoginBridge({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) query.set(key, value[0]);
  }

  // Nothing to resume without a client — a stray visit, not an OAuth handoff.
  if (!query.has("client_id")) redirect("/dashboard");

  const session = await getServerSession();
  if (!session) {
    const returnTo = `/oauth/login?${query.toString()}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  }

  redirect(`/api/auth/mcp/authorize?${query.toString()}`);
}
