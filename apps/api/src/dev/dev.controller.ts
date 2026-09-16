import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { z } from "zod";

import { schema, type Db } from "@repo/db";
import type { RateLimitAdapter } from "@repo/contracts";
import { API_CONFIG, DB } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { notFound, validationFailed } from "../common/http";
import { forwardedHeaders } from "../auth/auth.controller";
import { AUTH_ENGINE, engineErrorCode, type AuthEngine } from "../auth/auth-engine";
import {
  requestLocaleFromHeaders,
  runWithRequestLocale,
  stampLocaleIfUnset,
} from "../auth/auth-enqueue";
import { RATE_LIMIT_MEMORY, RATE_LIMIT_POSTGRES } from "../rate-limit/rate-limit.module";
import { OrganizationsService } from "../organizations/organizations.service";

/**
 * Test-only seams (spec 14.1) — the Nest twin of web's `/api/dev/*` routes.
 * 404 in production, same contracts as the web versions they replace (the E2E
 * suite calls them through thin web proxies, unchanged).
 */

const rateLimitBodySchema = z.object({
  provider: z.enum(["memory", "postgres"]),
  key: z.string().min(1),
  limit: z.number().int().positive(),
  windowMs: z.number().int().positive(),
  /** How many times to `consume`. 0 means peek only. */
  times: z.number().int().min(0).max(50).default(1),
  /** Reset the key before counting, so a rerun starts clean. */
  reset: z.boolean().default(false),
  /** Run `prune()` afterwards and report the count. */
  prune: z.boolean().default(false),
});

@Controller("v1/dev")
export class DevController {
  constructor(
    @Inject(AUTH_ENGINE) private readonly engine: AuthEngine,
    @Inject(DB) private readonly db: Db,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(RATE_LIMIT_MEMORY) private readonly memory: RateLimitAdapter,
    @Inject(RATE_LIMIT_POSTGRES) private readonly postgres: RateLimitAdapter,
    private readonly orgs: OrganizationsService,
  ) {}

  private assertDev(): void {
    if (this.config.NODE_ENV === "production") notFound();
  }

  /**
   * Create an email/password account through the same engine path the sign-up
   * controller uses, so E2E can seed deterministically without driving UI.
   */
  @Post("seed-user")
  async seedUser(@Req() req: Request) {
    this.assertDev();
    const { email, password, name } = (req.body ?? {}) as {
      email?: string;
      password?: string;
      name?: string;
    };
    if (!email || !password) {
      throw new HttpException({ error: "email and password are required" }, HttpStatus.BAD_REQUEST);
    }
    const headers = forwardedHeaders(req);
    try {
      // The seeder's locale rides ALS into the email hooks (same as sign-up).
      const result = await runWithRequestLocale(requestLocaleFromHeaders(headers), () =>
        this.engine.api.signUpEmail({
          headers,
          body: {
            email,
            password,
            name: name ?? "E2E User",
            callbackURL: `${this.config.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/dashboard`,
          },
          returnHeaders: true,
        }),
      );
      // Same genuine-creation stamp as the sign-up controller (the seeder's
      // `app-locale` cookie is the only locale signal on this path). The drain
      // kick lives in the engine's email hook.
      await stampLocaleIfUnset(this.db, result.response.user.id, requestLocaleFromHeaders(headers));
      return { ok: true };
    } catch (error) {
      const code = engineErrorCode(error);
      // Anti-enumerating like the real sign-up: duplicates resolve as success.
      if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        return { ok: true };
      }
      throw new HttpException({ ok: false, code: code ?? "UNKNOWN" }, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Look up a seeded user's id — `seed-user` cannot return it (anti-enumerating
   * by design), and onboarding dedupe keys are scoped by user id.
   */
  @Get("user")
  async user(@Query() query: Record<string, unknown>) {
    this.assertDev();
    const email = query["email"];
    if (typeof email !== "string" || email === "") {
      throw new HttpException({ error: "`email` is required" }, HttpStatus.BAD_REQUEST);
    }
    const [row] = await this.db
      .select({ id: schema.user.id, emailVerified: schema.user.emailVerified })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);
    if (!row) notFound();
    return row;
  }

  /**
   * Seed an organization owned by an existing seeded user — the Nest twin of
   * web's `/api/dev/seed-org` (faza 2.2). Same contract (`{ownerEmail, name?,
   * slug?, members?}` → `{ok, slug, orgId}`), so the E2E suite calls it
   * through the thin web proxy unchanged.
   */
  @Post("seed-org")
  async seedOrg(@Req() req: Request) {
    this.assertDev();
    return this.orgs.seedOrg((req.body ?? {}) as Parameters<OrganizationsService["seedOrg"]>[0]);
  }

  /**
   * Drive either rate-limit store directly — the suite boots on `memory`, so
   * without this the postgres upsert would have no coverage. Bypasses the
   * tier table on purpose: it tests the STORE, not the policy.
   */
  @Post("rate-limit")
  async rateLimit(@Req() req: Request) {
    this.assertDev();
    const parsed = rateLimitBodySchema.safeParse(req.body);
    if (!parsed.success) validationFailed(parsed.error, "Invalid input");

    const { provider, key, limit, windowMs, times, reset, prune } = parsed.data;
    const adapter = provider === "postgres" ? this.postgres : this.memory;
    const rule = { limit, windowMs };

    if (reset) await adapter.reset(key);

    // Sequential, not parallel: the assertions are about the ORDER of
    // decisions (allowed, allowed, …, blocked).
    const decisions = [];
    for (let i = 0; i < times; i += 1) {
      decisions.push(await adapter.consume(key, rule));
    }

    const peeked = await adapter.peek(key, rule);
    const pruned = prune ? await adapter.prune() : null;

    return { decisions, peeked, pruned };
  }
}
