import { Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { idParam } from "@repo/validation";
import { forwardedHeaders } from "../common/headers";
import { validationFailed } from "../common/http";
import { Session, SessionGuard, type AuthenticatedRequest } from "../auth/session.guard";
import type { RequestSession } from "../auth/auth-engine";
import { AdminService, type RequestInfo } from "./admin.service";
import { SuperAdminGuard } from "./super-admin.guard";

/**
 * Super-admin endpoints (spec 6, faza 2.6) — the panel, served by Nest.
 *
 * Reads are cross-tenant by design (§6.2 carve-out); `SuperAdminGuard` is the
 * boundary, applied at the controller level so no handler can forget it. The
 * two exceptions are deliberate and documented in the guard: `stop`
 * (the caller is the impersonated non-admin) carries `SessionGuard` alone.
 *
 * Cookie-swapping routes (`impersonate`, `stop`) relay the engine's
 * `Set-Cookie` onto the response (the `nextCookies` replacement — same helper
 * as the auth controller). The WEB relay (`POST /api/admin/impersonate*`)
 * copies these through to the browser; a direct browser→Nest call works too,
 * but cross-origin deployments (Vercel web + VPS API) cannot rely on
 * third-party cookies, so the same-origin relay is the supported path.
 */

const idParamsSchema = z.object({ id: idParam });

function requestInfo(req: Request): RequestInfo {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  const userAgent = req.headers["user-agent"];
  return {
    // Evidence, not a control (see organizations/audit.ts): leftmost is
    // correct HERE, where it is stored.
    ipAddress: first?.trim() || null,
    userAgent: typeof userAgent === "string" ? userAgent : null,
  };
}

/** Relay the engine's `Set-Cookie` onto the Express response. Never merged:
 * one `Set-Cookie` per header, or the browser keeps only one session. */
function relaySetCookies(res: Response, setCookies: string[]): void {
  if (setCookies.length > 0) res.setHeader("set-cookie", setCookies);
}

function targetId(params: Record<string, unknown>): string {
  const parsed = idParamsSchema.safeParse(params);
  if (!parsed.success) validationFailed(parsed.error);
  return parsed.data.id;
}

/**
 * Guards are per-handler, not class-level: every handler below carries
 * `SuperAdminGuard` EXCEPT `stop`, and a class-level decorator would combine
 * with (not yield to) the method-level one — silently 403ing the one caller
 * who must get through.
 */
const AdminGuards = UseGuards(SessionGuard, SuperAdminGuard);

@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("v1/admin/users")
  @AdminGuards
  async listUsers(@Query() query: Record<string, unknown>) {
    return this.admin.listUsers(query);
  }

  @Get("v1/admin/users/:id")
  @AdminGuards
  async getUser(@Param() params: Record<string, unknown>) {
    const userId = targetId(params);
    const [detail, solelyOwnedOrgs] = await Promise.all([
      this.admin.getUserDetail(userId),
      this.admin.listSolelyOwnedOrgs(userId),
    ]);
    return { ...detail, solelyOwnedOrgs };
  }

  @Get("v1/admin/organizations")
  @AdminGuards
  async listOrganizations(@Query() query: Record<string, unknown>) {
    return this.admin.listOrganizations(query);
  }

  @Get("v1/admin/organizations/:id")
  @AdminGuards
  async getOrganization(@Param() params: Record<string, unknown>) {
    return this.admin.getOrganizationDetail(targetId(params));
  }

  @Get("v1/admin/audit")
  @AdminGuards
  async listAudit(@Query() query: Record<string, unknown>) {
    return this.admin.listAuditEntries(query);
  }

  @Post("v1/admin/users/:id/impersonate")
  @AdminGuards
  async impersonate(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const { body, setCookies } = await this.admin.impersonate(
      session,
      forwardedHeaders(req),
      targetId(params),
      req.body,
      requestInfo(req),
    );
    relaySetCookies(res, setCookies);
    return body;
  }

  @Post("v1/admin/users/:id/suspend")
  @HttpCode(200)
  @AdminGuards
  async suspend(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<{ ok: true }> {
    return this.admin.suspend(
      session,
      forwardedHeaders(req),
      targetId(params),
      req.body,
      requestInfo(req),
    );
  }

  @Post("v1/admin/users/:id/unsuspend")
  @HttpCode(200)
  @AdminGuards
  async unsuspend(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<{ ok: true }> {
    return this.admin.unsuspend(session, forwardedHeaders(req), targetId(params), requestInfo(req));
  }

  @Post("v1/admin/users/:id/delete")
  @HttpCode(200)
  @AdminGuards
  async deleteUser(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<{ ok: true }> {
    return this.admin.deleteUser(
      session,
      forwardedHeaders(req),
      targetId(params),
      requestInfo(req),
    );
  }

  @Post("v1/admin/organizations/:id/delete")
  @HttpCode(200)
  @AdminGuards
  async deleteOrganization(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<{ ok: true }> {
    return this.admin.deleteOrganization(session, targetId(params), requestInfo(req));
  }

  @Post("v1/admin/users/:id/super-admin")
  @HttpCode(200)
  @AdminGuards
  async setSuperAdmin(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<{ ok: true }> {
    return this.admin.setSuperAdmin(
      session,
      forwardedHeaders(req),
      targetId(params),
      req.body,
      requestInfo(req),
    );
  }

  /**
   * Leave admin mode. `SessionGuard` ALONE — see the guard's header for why
   * `SuperAdminGuard` must not run here. After the swap there is deliberately
   * NO session read: the response cookies are the new truth, and re-reading
   * would resolve the just-destroyed session.
   */
  @Post("v1/admin/impersonate/stop")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async stopImpersonating(
    @Session() session: RequestSession,
    @Req() req: AuthenticatedRequest & Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true; signedOut: boolean }> {
    const { body, setCookies } = await this.admin.stopImpersonating(
      session,
      forwardedHeaders(req),
      requestInfo(req),
    );
    relaySetCookies(res, setCookies);
    return body;
  }
}
