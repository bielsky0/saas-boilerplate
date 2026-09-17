import "reflect-metadata";

import path from "node:path";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import dotenv from "dotenv";
import type { Request, Response } from "express";

// Load `apps/api/.env` (local dev only — production injects real env vars,
// and a missing file is silently ignored). The path is anchored to the
// compiled file, not the process cwd, so `pnpm --filter api start` from the
// repo root and `node dist/main` from any directory behave identically.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { AppModule } from "./app.module";
import { AUTH_ENGINE, type AuthEngine } from "./auth/auth-engine";
import { API_CONFIG, DbModule } from "./db/db.module";
import type { ApiConfig } from "./common/config";

/**
 * API bootstrap (Express adapter — the NestJS default).
 *
 * `rawBody: true` is load-bearing for the future billing webhook: Stripe's
 * signature covers the exact request bytes, so the route must read the raw
 * buffer (`request.text()` equivalent) instead of a re-serialized body.
 */

/**
 * Engine HTTP paths served directly by Nest (faza 2.1) — an ALLOWLIST, never
 * a blocklist. These are the emailed-link hops (validate-then-redirect GETs)
 * plus the legacy forget-password POST the E2E suite drives through the web
 * `[...all]` proxy, plus the OAuth 2.0 / MCP dance (faza 2.7: authorize,
 * token, dynamic registration, consent, discovery — all reached through the
 * same web proxy). Everything else under `/api/auth/*` — sign-in/up posts,
 * `get-session`, and the whole `/admin/*` plugin surface — answers 404: the
 * versioned `/v1/*` contract (with its rate limiting) is the only way in for
 * those, and the admin plugin stays reachable solely through the audited
 * `AdminService` (faza 2.6), never over HTTP.
 */
function isAllowedEnginePath(method: string, path: string): boolean {
  if (method === "GET" && path === "/verify-email") return true;
  if (method === "GET" && /^\/reset-password\/[^/]+$/.test(path)) return true;
  if (method === "POST" && path === "/request-password-reset") return true;
  // OAuth 2.0 / MCP (spec 26): the web login bridge resumes here, the consent
  // form POSTs here, and MCP clients register + exchange codes here.
  if (method === "GET" && path === "/mcp/authorize") return true;
  if (method === "POST" && path === "/mcp/register") return true;
  if (method === "POST" && path === "/mcp/token") return true;
  if (method === "GET" && path === "/mcp/get-session") return true;
  if (method === "POST" && path === "/oauth2/consent") return true;
  if (
    method === "GET" &&
    (path === "/.well-known/oauth-authorization-server" ||
      path === "/.well-known/oauth-protected-resource")
  ) {
    return true;
  }
  return false;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.select(DbModule).get<ApiConfig>(API_CONFIG);

  // The browser calls `/v1/*` directly (fetch + `credentials: "include"`),
  // so the API must accept the web origin with credentials. One explicit
  // origin, never `*` — credentials forbid it. `x-app-locale` is the one
  // custom header the forms send (the page's locale for signup stamping);
  // `authorization` carries the OAuth 2.0 bearer token MCP clients send
  // (spec 26 — a safelisted header, never reflected);
  // `x-e2e-rate-limit-bucket` is the E2E suite's per-test isolation header
  // (Playwright attaches it to EVERY context request, including fetch — a
  // preflight that rejects it fails the request with no other signal).
  // The bucket header is meaningless outside non-production: the key
  // derivation ignores it there, so allowing it costs nothing in prod — but
  // it is still listed explicitly rather than reflected, so the next custom
  // header is a deliberate addition, not an accident.
  app.enableCors({
    origin: [config.NEXT_PUBLIC_APP_URL],
    credentials: true,
    allowedHeaders: [
      "authorization",
      "content-type",
      "x-app-locale",
      ...(config.NODE_ENV === "production" ? [] : ["x-e2e-rate-limit-bucket"]),
    ],
  });

  // Mount the engine's own HTTP surface for the allowlisted hops above. The
  // web `app/api/auth/[...all]` route reverse-proxies here, so emailed links
  // and legacy engine paths keep working with no web-side engine left.
  const engine = app.get<AuthEngine>(AUTH_ENGINE);
  const server = app.getHttpAdapter().getInstance();
  server.use("/api/auth", (req: Request, res: Response, next: () => void) => {
    if (!isAllowedEnginePath(req.method, req.path)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  });
  server.use("/api/auth", toNodeHandler(engine));

  await app.listen(config.PORT);
  Logger.log(`API listening on :${config.PORT} (${config.NODE_ENV})`, "Bootstrap");
}

void bootstrap();
