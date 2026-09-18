import { Controller, Get, Param } from "@nestjs/common";
import { z } from "zod";

import { validationFailed } from "../common/http";
import { OrganizationsService } from "./organizations.service";

const tokenParamsSchema = z.object({ token: z.string().min(1) });

/**
 * Public invitation lookup for the accept landing (spec 3.3, faza 2.8) — the
 * Nest twin of web's `getInvitationWithValidity` + `getOrgById`.
 *
 * Deliberately NOT in `OrganizationsController`: that controller is
 * `@UseGuards(SessionGuard)` at class level, and this read is public by
 * design (the page offers sign-in/sign-up to anonymous visitors). A second
 * one-route controller keeps the guard boundary physical instead of adding a
 * skip-guard decorator the next reader must discover.
 *
 * `valid: false` for every dead end (unknown/used/expired token, missing org,
 * orgs disabled) — the page renders "unavailable" for all of them alike.
 */
@Controller()
export class InvitationLookupController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get("v1/invitations/:token")
  async lookup(
    @Param() params: Record<string, unknown>,
  ): Promise<{ valid: boolean; orgName: string | null; role: string | null }> {
    const parsed = tokenParamsSchema.safeParse(params);
    if (!parsed.success) validationFailed(parsed.error);
    return this.orgs.getInvitationByToken(parsed.data.token);
  }
}
