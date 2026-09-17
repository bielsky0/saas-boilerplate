import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { EmailsModule } from "../emails/emails.module";
import { JobsModule } from "../jobs/jobs.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { DevController } from "./dev.controller";

/**
 * Test-only dev controller (spec 14.1) — `seed-user`, `user`, `rate-limit`,
 * `seed-org`, plus the faza 2.3 delivery seams (`emails`, `emails/fail-next`,
 * `jobs`, `jobs/run`, `notifications`, `notification-preference`). Every
 * route 404s in production (checked per-request, not just at boot).
 */
@Module({
  imports: [AuthModule, OrganizationsModule, EmailsModule, JobsModule, NotificationsModule],
  controllers: [DevController],
})
export class DevModule {}
