import { Controller, HttpCode, Inject, Post, Query } from "@nestjs/common";
import { z } from "zod";

import { API_CONFIG } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { badRequest } from "../common/http";
import { EmailsService } from "./emails.service";
import { verifyUnsubscribeToken } from "./suppression";

/**
 * RFC 8058 one-click unsubscribe (spec 10.3).
 *
 * The target of the `List-Unsubscribe` header. Mail clients POST
 * `List-Unsubscribe=One-Click` here when the user clicks the unsubscribe
 * affordance the CLIENT renders — never inside the message body.
 *
 * POST ONLY: a GET is issued by scanners and prefetchers and means nothing,
 * whereas a POST from a mail provider's servers is a deliberate user act. So
 * this suppresses immediately with no confirmation page, unlike the in-body
 * link at `/unsubscribe`.
 *
 * Unauthenticated by design — the HMAC in the query IS the authentication,
 * and the recipient has no session. Always 200 on a well-formed, genuine
 * request: Gmail reads a non-2xx as a broken unsubscribe and holds it against
 * sender reputation. Malformed/forged links answer 400 with ONE body —
 * distinguishing them only helps someone probing the token format. The 400
 * (not 422) is deliberate and E2E-pinned: shape and signature failures must
 * be indistinguishable, and 422 carries per-field `issues` that would tell
 * them apart.
 */
const unsubscribeQuerySchema = z.object({
  e: z.string().min(1).max(320),
  c: z.string().min(1).max(64),
  t: z.string().min(1).max(128),
});

@Controller("v1/unsubscribe")
export class UnsubscribeController {
  constructor(
    private readonly emails: EmailsService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Post()
  @HttpCode(200)
  async unsubscribe(@Query() query: Record<string, unknown>) {
    // Shape first, signature second. Both failures answer identically.
    const parsed = unsubscribeQuerySchema.safeParse(query);
    if (!parsed.success) badRequest("Invalid unsubscribe link");

    const token = verifyUnsubscribeToken(parsed.data.e, parsed.data.c, parsed.data.t, {
      unsubscribeSecret: this.config.EMAIL_UNSUBSCRIBE_SECRET,
      authSecret: this.config.BETTER_AUTH_SECRET,
    });
    if (!token) badRequest("Invalid unsubscribe link");

    await this.emails.suppress(token.email, token.category, "unsubscribe");
    return { unsubscribed: true };
  }
}
