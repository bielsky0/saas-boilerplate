import { Module } from "@nestjs/common";

import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { RateLimitModule } from "../rate-limit/rate-limit.module";
import { AUTH_ENGINE, createAuthEngine } from "./auth-engine";
import type { Db } from "@repo/db";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

/**
 * Auth module (faza 2.1) — the full email/password surface.
 *
 * Provides the Better Auth engine bound to the shared Drizzle client (same
 * secret, same tables, same hooks as web had — sessions minted here read
 * identically there), the flow service (validation, rate limiting,
 * code-mapping, cookie relay data), and the `/v1/auth/*` + `/v1/session`
 * controllers. Feature modules keep injecting `AUTH_ENGINE` for session
 * reads via `SessionGuard` — that path is unchanged.
 */
@Module({
  imports: [RateLimitModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_ENGINE,
      useFactory: (db: Db, config: ApiConfig) =>
        createAuthEngine(db, {
          secret: config.BETTER_AUTH_SECRET,
          baseURL: config.BETTER_AUTH_URL,
          webURL: config.NEXT_PUBLIC_APP_URL,
          trustedOrigins: [config.NEXT_PUBLIC_APP_URL],
          crossSubDomainCookies: {
            enabled: config.CROSS_SUBDOMAIN_COOKIES,
            domain: config.SESSION_COOKIE_DOMAIN,
          },
        }),
      inject: [DB, API_CONFIG],
    },
    AuthService,
  ],
  exports: [AUTH_ENGINE, AuthService],
})
export class AuthModule {}
