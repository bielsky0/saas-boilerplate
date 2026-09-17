import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { BillingNotifyModule } from "./billing-notify/billing-notify.module";
import { DbModule } from "./db/db.module";
import { DevModule } from "./dev/dev.module";
import { EmailsModule } from "./emails/emails.module";
import { HealthController } from "./health/health.controller";
import { JobsModule } from "./jobs/jobs.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { RateLimitModule } from "./rate-limit/rate-limit.module";

@Module({
  imports: [
    DbModule,
    RateLimitModule,
    AuthModule,
    DevModule,
    EmailsModule,
    OnboardingModule,
    NotificationsModule,
    OrganizationsModule,
    BillingNotifyModule,
    JobsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
