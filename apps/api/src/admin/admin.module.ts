import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

/**
 * Super-admin module (spec 6, faza 2.6) — the panel's reads and audited
 * mutations over the cross-tenant views, behind `SuperAdminGuard`.
 *
 * Imports `AuthModule` for the engine (`ban/unban`, `setRole`, session
 * revocation) and the session guards. No other feature module is involved:
 * admin effects are identity-engine calls or direct soft deletes, never
 * tenant flows.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
