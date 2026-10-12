import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

/**
 * Personal revenue dashboard (etap 4, faza 3) — aggregates over the caller's
 * personal account for the Next.js dashboard view.
 *
 * Imports `AuthModule` for `SessionGuard`/`AUTH_ENGINE` wiring (same as the
 * admin module). Reads are tenant-local by construction; no billing internals
 * are involved — the service queries the shared tables directly.
 */
@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
