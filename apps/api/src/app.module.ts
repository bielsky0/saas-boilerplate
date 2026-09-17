import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { BillingNotifyModule } from "./billing-notify/billing-notify.module";
import { BillingModule } from "./billing/billing.module";
import { DbModule } from "./db/db.module";
import { DevModule } from "./dev/dev.module";
import { EmailsModule } from "./emails/emails.module";
import { HealthController } from "./health/health.controller";
import { JobsModule } from "./jobs/jobs.module";
import { McpModule } from "./mcp/mcp.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { RateLimitModule } from "./rate-limit/rate-limit.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    DbModule,
    RateLimitModule,
    AuthModule,
    DevModule,
    EmailsModule,
    OnboardingModule,
    NotificationsModule,
    AdminModule,
    OrganizationsModule,
    BillingNotifyModule,
    BillingModule,
    JobsModule,
    McpModule,
    StorageModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
