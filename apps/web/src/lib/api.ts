import { headers } from "next/headers";
import { cache } from "react";

import { createApiClient, type ApiClient } from "@repo/api-client";
import { env } from "./env/server";

/**
 * Server-side NestJS API client (spec 1.2 — the web app calls the API over
 * HTTP, never the database, for ported modules).
 *
 * The session-cookie forward lives here, in exactly one place: `fetch` from
 * the server carries no cookies, so the incoming request's `Cookie` header is
 * copied explicitly — without it Nest resolves every call to anonymous.
 * Wrapped in `cache()` so one render forwards one header, not one per call.
 */
export const api = cache((): ApiClient => {
  return createApiClient({
    baseUrl: env.API_BASE_URL,
    getCookie: async () => (await headers()).get("cookie") ?? undefined,
  });
});
