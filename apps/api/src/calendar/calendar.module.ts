import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";

/**
 * Calendar events (etap 5, faza 5.3) — tenant-scoped event CRUD for the
 * Next.js calendar views. Imports `AuthModule` for `SessionGuard` wiring
 * (same as admin/dashboard/connections).
 */
@Module({
  imports: [AuthModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
