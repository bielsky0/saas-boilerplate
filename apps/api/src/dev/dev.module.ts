import { Module } from "@nestjs/common";

import { AdminModule } from "../admin/admin.module";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { EmailsModule } from "../emails/emails.module";
import { JobsModule } from "../jobs/jobs.module";
import { McpModule } from "../mcp/mcp.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { DevController } from "./dev.controller";

/**
 * Test-only dev controller (spec 14.1) — `seed-user`, `user`, `rate-limit`,
 * `seed-org`, plus the faza 2.3 delivery seams (`emails`, `emails/fail-next`,
 * `jobs`, `jobs/run`, `notifications`, `notification-preference`) plus the faza
 * 2.5 billing seams (`seed-billing-customer`, `billing-state`) plus the faza
 * 2.6 admin seam (`seed-super-admin`) plus the faza 2.7 MCP seam (`mcp`). Every
 * route 404s in production (checked per-request, not just at boot).
 */
@Module({
  imports: [
    AdminModule,
    AuthModule,
    OrganizationsModule,
    EmailsModule,
    JobsModule,
    McpModule,
    NotificationsModule,
    BillingModule,
  ],
  controllers: [DevController],
})
export class DevModule {}
