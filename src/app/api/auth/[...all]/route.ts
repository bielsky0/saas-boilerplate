import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/adapters/auth";

/**
 * Better Auth catch-all endpoint (spec 2). Serves the engine's HTTP surface —
 * for this phase the email-verification link (`GET /api/auth/verify-email`) and
 * the internal endpoints the server-side API uses. Sign-up/sign-in/sign-out are
 * driven through server actions + the adapter, not called from the browser.
 *
 * This path must stay in the middleware public allowlist.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
