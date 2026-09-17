import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { Session, SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/auth-engine";
import { kickDrain } from "../jobs/runner";
import { BillingService } from "./billing.service";

/**
 * Billing endpoints (spec 5, faza 2.5) — checkout, portal, webhook, reads.
 *
 * Checkout and portal answer with a provider URL as JSON rather than a 3xx:
 * the caller is `fetch` from a client component (via the thin web proxy), and
 * a redirect would be followed opaquely by the browser, leaving no way to
 * surface a provider failure. The client navigates via `window.location.assign`.
 *
 * The webhook is deliberately UNAUTHENTICATED (the signature is the
 * authentication) and reads the RAW body — re-serializing would invalidate the
 * HMAC. Validation runs before the adapter (spec 22.2); error codes stay
 * neutral and coarse (`PROVIDER_ERROR`), so no caller branches on a vendor's
 * error taxonomy.
 */

function badBody(): never {
  throw new HttpException({ error: "Invalid JSON" }, HttpStatus.BAD_REQUEST);
}

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post("v1/billing/checkout")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async checkout(@Session() session: RequestSession, @Body() body: unknown) {
    if (!body || typeof body !== "object") badBody();
    const result = await this.billing.checkout(session, body);
    if ("url" in result) return result;
    if (result.code === "NOT_PURCHASABLE") {
      throw new HttpException(
        { error: "Plan is not available for purchase" },
        HttpStatus.NOT_FOUND,
      );
    }
    if (result.code === "NOT_CONFIGURED") {
      throw new HttpException({ error: "Billing is not configured" }, HttpStatus.NOT_FOUND);
    }
    throw new HttpException({ error: "Payment provider is unavailable" }, HttpStatus.BAD_GATEWAY);
  }

  @Post("v1/billing/portal")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async portal(@Session() session: RequestSession, @Body() body: unknown) {
    if (!body || typeof body !== "object") badBody();
    const result = await this.billing.portal(session, body);
    if ("url" in result) return result;
    // Never checked out → nothing to manage. 404 keeps this indistinguishable
    // from an unconfigured deployment: both mean "no portal here".
    if (result.code === "NO_CUSTOMER") {
      throw new HttpException({ error: "No billing customer yet" }, HttpStatus.NOT_FOUND);
    }
    if (result.code === "NOT_CONFIGURED") {
      throw new HttpException({ error: "Billing is not configured" }, HttpStatus.NOT_FOUND);
    }
    throw new HttpException({ error: "Payment provider is unavailable" }, HttpStatus.BAD_GATEWAY);
  }

  @Post("v1/billing/webhook")
  @HttpCode(200)
  async webhook(@Req() req: Request) {
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody?.toString("utf8");
    const signature = req.headers["stripe-signature"];
    const result = await this.billing.webhook(
      rawBody,
      typeof signature === "string" ? signature : undefined,
    );

    switch (result.outcome) {
      case "not_configured":
        throw new HttpException({ error: "Not found" }, HttpStatus.NOT_FOUND);
      case "malformed":
        throw new HttpException({ error: "Malformed payload" }, HttpStatus.BAD_REQUEST);
      case "invalid_signature":
        throw new HttpException({ error: "Invalid signature" }, HttpStatus.BAD_REQUEST);
      default:
        break;
    }

    const processed = result.outcome;
    // Any notification the event enqueued is committed by now; kick the drain
    // so the provider's timeout never depends on our email provider. Only on
    // "processed" — a duplicate enqueued nothing. Purely a latency win: cron
    // would pick the job up regardless.
    if (processed === "processed") kickDrain();

    return { received: true, status: processed };
  }

  @Get("v1/billing/subscription")
  @UseGuards(SessionGuard)
  async subscription(@Session() session: RequestSession, @Query() query: Record<string, unknown>) {
    // `slug` selects whose data the request touches, so it goes through
    // validation like any authority argument (spec 22.2) — inside the service,
    // together with the owner resolution.
    return this.billing.subscriptionView(session, query);
  }
}
