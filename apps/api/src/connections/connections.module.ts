import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ConnectionsController } from "./connections.controller";
import { ConnectionsService } from "./connections.service";

/**
 * User connections (etap 5, faza 5.2) — the profile "connections" backing.
 * Imports `AuthModule` for `SessionGuard` wiring (same as admin/dashboard).
 */
@Module({
  imports: [AuthModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
