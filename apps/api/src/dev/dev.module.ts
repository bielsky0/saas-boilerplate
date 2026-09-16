import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DevController } from "./dev.controller";

/**
 * Test-only dev controller (spec 14.1) — `seed-user`, `user`, `rate-limit`.
 * Every route 404s in production (checked per-request, not just at boot).
 */
@Module({
  imports: [AuthModule],
  controllers: [DevController],
})
export class DevModule {}
