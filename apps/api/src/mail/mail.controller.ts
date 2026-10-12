import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { Session, SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/auth-engine";
import { MailService } from "./mail.service";

/**
 * Internal mail endpoints (etap 5, faza 5.4). `SessionGuard` on every handler;
 * the service scopes each query to the caller's own participant rows, so there
 * is no owner parameter to forge. A thread id from another mailbox 404s.
 */
@UseGuards(SessionGuard)
@Controller("v1/mail")
export class MailController {
  constructor(private readonly mail: MailService) {}

  @Get("threads")
  async list(@Session() session: RequestSession, @Query() query: Record<string, unknown>) {
    return this.mail.listThreads(session, query);
  }

  @Get("counts")
  async counts(@Session() session: RequestSession) {
    return this.mail.counts(session);
  }

  @Get("threads/:id")
  async detail(@Session() session: RequestSession, @Param() params: Record<string, unknown>) {
    return this.mail.getThread(session, params);
  }

  @Post("threads")
  async send(@Session() session: RequestSession, @Body() body: unknown) {
    return this.mail.send(session, body);
  }

  @Post("threads/:id/messages")
  async reply(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    return this.mail.reply(session, params, body);
  }

  @Patch("threads/:id")
  async update(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    return this.mail.update(session, params, body);
  }

  @Delete("threads/:id")
  async remove(@Session() session: RequestSession, @Param() params: Record<string, unknown>) {
    return this.mail.remove(session, params);
  }
}
