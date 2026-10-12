import { Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";

import { Session, SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/auth-engine";
import { ConnectionsService } from "./connections.service";

/**
 * User connections (etap 5, faza 5.2). `SessionGuard` per-handler is the whole
 * boundary — the service scopes every read/delete to rows containing the
 * caller, so there is no target to authorize beyond that.
 */
const ConnectionsGuards = UseGuards(SessionGuard);

@Controller()
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get("v1/connections")
  @ConnectionsGuards
  async list(@Session() session: RequestSession) {
    return this.connections.listConnections(session);
  }

  @Post("v1/connections")
  @ConnectionsGuards
  async connect(@Session() session: RequestSession, @Req() req: Request) {
    return this.connections.connect(session, req.body);
  }

  @Delete("v1/connections/:id")
  @ConnectionsGuards
  async disconnect(
    @Session() session: RequestSession,
    @Param() params: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    return this.connections.disconnect(session, params);
  }
}
