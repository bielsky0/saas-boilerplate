import { Body, Controller, Patch, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { LOCALES } from "@repo/i18n-core";
import { validationFailed } from "../common/http";
import { Session, SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/auth-engine";
import { LocaleService } from "./locale.service";

/**
 * Locale endpoint (spec 16.1, faza 2.8).
 *
 * `PATCH /v1/locale` `{locale}` → `200 {ok:true}`; unknown locale → `422`
 * envelope (a write must not launder a guess into a stored preference —
 * `null`/default collapsing happens only on reads). Session-guarded; the
 * caller persists their OWN choice only.
 *
 * Validation runs before anything else (spec 22.2). `z.enum(LOCALES)` keeps
 * the wire vocabulary identical to the proxy's negotiation table — adding a
 * language is one list, not two.
 */
const localeBodySchema = z.object({ locale: z.enum(LOCALES) });

@UseGuards(SessionGuard)
@Controller("v1/locale")
export class LocaleController {
  constructor(private readonly locale: LocaleService) {}

  @Patch()
  async setLocale(
    @Session() session: RequestSession,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    const parsed = localeBodySchema.safeParse(body);
    if (!parsed.success) validationFailed(parsed.error);
    return this.locale.setLocale(session.user.id, parsed.data.locale);
  }
}
