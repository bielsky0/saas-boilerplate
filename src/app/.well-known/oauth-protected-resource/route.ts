import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

import { auth } from "@/lib/adapters/auth";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728), spec 26 — AI Agent.
 *
 * The `/api/mcp` handler's `401` points its `WWW-Authenticate` header at this
 * document (`resource_metadata="…/.well-known/oauth-protected-resource"`); the MCP
 * client reads it to learn which authorization server guards the resource, then
 * begins the flow. Pre-authentication and served directly, same as the
 * authorization-server metadata sibling.
 */
export const GET = oAuthProtectedResourceMetadata(auth);
