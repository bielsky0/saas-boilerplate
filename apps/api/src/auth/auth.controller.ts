import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { AUTH_ENGINE, getFullSessionFromHeaders, type AuthEngine } from "./auth-engine";
import { unauthorized } from "../common/http";
import { AuthService } from "./auth.service";

/**
 * Auth endpoints (spec 2.1) — the full email/password surface over REST.
 *
 * The browser calls these directly (`credentials: "include"`, CORS), so the
 * session cookie is set by the API response and read back on every later
 * request — no server-action relay in between. Validation runs before the
 * engine (spec 22.2); error codes stay neutral for anti-enumeration (the web
 * form renders the single `auth.errors.invalidCredentials` key for every
 * credential failure).
 */

/** Inbound headers the engine is allowed to see (allowlist, not a pipe). */
const FORWARDED_HEADERS = [
  "cookie",
  "authorization",
  "origin",
  "referer",
  "user-agent",
  "accept-language",
  "x-app-locale",
  "x-forwarded-for",
  "x-real-ip",
  "x-e2e-rate-limit-bucket",
] as const;

export function forwardedHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = req.headers[name];
    if (typeof value === "string" && value !== "") headers.set(name, value);
  }
  return headers;
}

/** Relay the engine's `Set-Cookie` onto the Express response (the
 * `nextCookies` replacement — spec 2.1 risks). */
function relaySetCookies(res: Response, setCookies: string[]): void {
  if (setCookies.length > 0) res.setHeader("set-cookie", setCookies);
}

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_ENGINE) private readonly engine: AuthEngine,
  ) {}

  @Post("v1/auth/sign-up")
  async signUp(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const { body, setCookies } = await this.auth.signUp(req.body, forwardedHeaders(req));
    relaySetCookies(res, setCookies);
    return body;
  }

  @Post("v1/auth/sign-in")
  async signIn(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true; locale: string | null }> {
    const { body, setCookies } = await this.auth.signIn(req.body, forwardedHeaders(req));
    relaySetCookies(res, setCookies);
    return body;
  }

  @Post("v1/auth/sign-out")
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const { body, setCookies } = await this.auth.signOut(forwardedHeaders(req));
    relaySetCookies(res, setCookies);
    return body;
  }

  @Post("v1/auth/password-reset/request")
  async requestPasswordReset(@Req() req: Request): Promise<{ ok: true }> {
    const { body } = await this.auth.requestPasswordReset(req.body, forwardedHeaders(req));
    return body;
  }

  @Post("v1/auth/password-reset/confirm")
  async confirmPasswordReset(@Req() req: Request): Promise<{ ok: true }> {
    const { body } = await this.auth.confirmPasswordReset(req.body, forwardedHeaders(req));
    return body;
  }

  @Get("v1/auth/verify-email")
  verifyEmail(@Query() query: Record<string, unknown>, @Res() res: Response): void {
    const token = query["token"];
    if (typeof token !== "string" || token === "") {
      throw new BadRequestException({ error: "Invalid request" });
    }
    res.redirect(302, this.auth.verifyEngineUrl(token, query["callbackUrl"]));
  }

  @Get("v1/session")
  async session(@Req() req: Request) {
    const session = await getFullSessionFromHeaders(this.engine, forwardedHeaders(req));
    if (!session) unauthorized();
    return session;
  }
}
