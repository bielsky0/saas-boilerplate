import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { idParam, slugParam } from "@repo/validation";
import { forwardedHeaders } from "../auth/auth.controller";
import { Session, SessionGuard, type AuthenticatedRequest } from "../auth/session.guard";
import type { RequestSession } from "../auth/auth-engine";
import { validationFailed } from "../common/http";
import { OrganizationsService, type RequestInfo } from "./organizations.service";

/**
 * Organizations endpoints (spec 3, faza 2.2) — the full team-surface over REST.
 *
 * Full nouns, verbs only via HTTP methods (OpenAPI: `packages/contracts/
 * openapi.yaml` is the source of truth). The browser calls these directly
 * (`credentials: "include"`, CORS); server components use `@/lib/api` with
 * the cookie forward. Validation runs before the guard (spec 22.2); error
 * codes stay neutral (`LAST_OWNER`, `SLUG_TAKEN`, `INVALID_TOKEN`).
 */

const slugParamsSchema = z.object({ slug: slugParam });
const memberParamsSchema = z.object({ slug: slugParam, memberId: idParam });
const invitationParamsSchema = z.object({ slug: slugParam, invitationId: idParam });
const tokenParamsSchema = z.object({ token: z.string().min(1) });

function requestInfo(req: Request): RequestInfo {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  const userAgent = req.headers["user-agent"];
  return {
    // Evidence, not a control (see audit.ts): leftmost is correct HERE, where
    // it is stored — unlike the rate limiter, where it would be a bypass.
    ipAddress: first?.trim() || null,
    userAgent: typeof userAgent === "string" ? userAgent : null,
  };
}

function localeHeaders(req: Request): Headers | null {
  try {
    return forwardedHeaders(req);
  } catch {
    return null;
  }
}

@UseGuards(SessionGuard)
@Controller()
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Post("v1/organizations")
  async create(
    @Session() session: RequestSession,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<{ id: string; name: string; slug: string }> {
    return this.orgs.createOrganization(session, req.body, requestInfo(req));
  }

  @Get("v1/organizations")
  async list(@Session() session: RequestSession) {
    return this.orgs.listOrganizations(session);
  }

  @Get("v1/organizations/:slug")
  async get(@Session() session: RequestSession, @Param() params: Record<string, unknown>) {
    const parsed = slugParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    return this.orgs.getOrganization(session, parsed.data.slug);
  }

  @Patch("v1/organizations/:slug")
  async update(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ) {
    const parsed = slugParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    return this.orgs.updateOrganization(session, parsed.data.slug, req.body, requestInfo(req));
  }

  @Delete("v1/organizations/:slug")
  @HttpCode(204)
  async remove(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<void> {
    const parsed = slugParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    await this.orgs.deleteOrganization(session, parsed.data.slug, requestInfo(req));
  }

  @Get("v1/organizations/:slug/members")
  async listMembers(@Session() session: RequestSession, @Param() params: Record<string, unknown>) {
    const parsed = slugParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    return this.orgs.listMembers(session, parsed.data.slug);
  }

  @Patch("v1/organizations/:slug/members/:memberId")
  async updateMember(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ) {
    const parsed = memberParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    return this.orgs.updateMemberRole(
      session,
      parsed.data.slug,
      parsed.data.memberId,
      req.body,
      requestInfo(req),
    );
  }

  @Delete("v1/organizations/:slug/members/:memberId")
  @HttpCode(204)
  async removeMember(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<void> {
    const parsed = memberParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    await this.orgs.removeMember(session, parsed.data.slug, parsed.data.memberId, requestInfo(req));
  }

  @Delete("v1/organizations/:slug/membership")
  @HttpCode(204)
  async leave(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<void> {
    const parsed = slugParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    await this.orgs.leaveOrganization(session, parsed.data.slug, requestInfo(req));
  }

  @Post("v1/organizations/:slug/invitations")
  async invite(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ) {
    const parsed = slugParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    // The invitee's language is resolved from THEIR stored choice, else the
    // inviter's — so the request locale rides in (header, then cookie).
    const headers = localeHeaders(req);
    return this.orgs.createInvitation(
      session,
      headers,
      parsed.data.slug,
      req.body,
      requestInfo(req),
    );
  }

  @Get("v1/organizations/:slug/invitations")
  async listInvitations(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
  ) {
    const parsed = slugParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    return this.orgs.listInvitations(session, parsed.data.slug);
  }

  @Delete("v1/organizations/:slug/invitations/:invitationId")
  @HttpCode(204)
  async revoke(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<void> {
    const parsed = invitationParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    await this.orgs.revokeInvitation(
      session,
      parsed.data.slug,
      parsed.data.invitationId,
      requestInfo(req),
    );
  }

  @Post("v1/invitations/:token/accept")
  async accept(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Req() req: AuthenticatedRequest & Request,
  ): Promise<{ slug: string }> {
    const parsed = tokenParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    return this.orgs.acceptInvitation(session, parsed.data.token, requestInfo(req));
  }

  @Get("v1/organizations/:slug/audit-logs")
  async auditLogs(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = slugParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    return this.orgs.listAuditLogs(session, parsed.data.slug, query);
  }

  /**
   * Compat alias (faza 2.2): the etap-2 draft named this `/v1/orgs`. One
   * redirect, no dual implementation — deleted after one phase.
   */
  @Post("v1/orgs")
  compatCreate(@Res() res: Response): void {
    res.redirect(308, "/v1/organizations");
  }
}
