import { Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
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
 * boundary, applied per-handler so no handler can forget it.
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

function targetId(params: Record<string, unknown>): string {
  const parsed = idParamsSchema.safeParse(params);
  if (!parsed.success) validationFailed(parsed.error);
  return parsed.data.id;
}

/**
 * Guards are per-handler, not class-level: every handler below carries
 * `SuperAdminGuard`. A class-level decorator would combine with (not yield
 * to) a method-level one, so per-handler is the explicit shape.
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
}
