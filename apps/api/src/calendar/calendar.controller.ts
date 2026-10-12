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
import { CalendarService } from "./calendar.service";

/**
 * Calendar events (etap 5, faza 5.3). `SessionGuard` per-handler is the whole
 * boundary — the service scopes every read/write to the resolved owner
 * (personal account, or org via the `org` slug/parameter). Update/delete take
 * the same `org` hint as query params, because a bare id cannot name its
 * tenant and scanning tenants is forbidden.
 */
const CalendarGuards = UseGuards(SessionGuard);

@Controller()
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get("v1/calendar/events")
  @CalendarGuards
  async list(@Session() session: RequestSession, @Query() query: Record<string, unknown>) {
    return this.calendar.listEvents(session, query);
  }

  @Post("v1/calendar/events")
  @CalendarGuards
  async create(@Session() session: RequestSession, @Body() body: unknown) {
    return this.calendar.createEvent(session, body);
  }

  @Patch("v1/calendar/events/:id")
  @CalendarGuards
  async update(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    return this.calendar.updateEvent(session, params, query, body);
  }

  @Delete("v1/calendar/events/:id")
  @CalendarGuards
  async remove(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    return this.calendar.deleteEvent(session, params, query);
  }
}
