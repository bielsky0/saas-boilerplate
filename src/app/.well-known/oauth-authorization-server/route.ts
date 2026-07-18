import { oAuthDiscoveryMetadata } from "better-auth/plugins";

import { auth } from "@/lib/adapters/auth";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414), spec 26 — AI Agent.
 *
 * MCP clients probe this at the ORIGIN ROOT to discover the authorize/token/
 * register endpoints. The `mcp` plugin only mounts the same document under
 * `/api/auth/`, so this thin root-level handler re-exposes it where clients look.
 *
 * Reachable without a session by design (it is pre-authentication discovery). It
 * needs no proxy exemption: the guard's matcher skips any path containing a dot,
 * and `.well-known` has one — so this file is served directly.
 */
export const GET = oAuthDiscoveryMetadata(auth);
