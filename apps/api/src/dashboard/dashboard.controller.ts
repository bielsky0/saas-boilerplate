import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { Session, SessionGuard } from "../auth/session.guard";
import type { RequestSession } from "../auth/auth-engine";
import { DashboardService, parseTransactionsQuery } from "./dashboard.service";

/**
 * Personal revenue dashboard (etap 4, faza 3).
 *
 * `SessionGuard` is the ONLY boundary here — and it is sufficient, because the
 * service scopes every query to the caller's personal account. Reads are
 * tenant-local by construction, never cross-tenant (see the service header).
 * Guards are per-handler so no handler can forget them (same shape as admin).
 */
const DashboardGuards = UseGuards(SessionGuard);

@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("v1/dashboard/summary")
  @DashboardGuards
  async summary(@Session() session: RequestSession) {
    return this.dashboard.getSummary(session);
  }

  @Get("v1/dashboard/transactions")
  @DashboardGuards
  async transactions(@Session() session: RequestSession, @Query() query: Record<string, unknown>) {
    return this.dashboard.listTransactions(session, parseTransactionsQuery(query));
  }
}
