import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { DevModule } from "./dev/dev.module";
import { HealthController } from "./health/health.controller";
import { NotificationsModule } from "./notifications/notifications.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { RateLimitModule } from "./rate-limit/rate-limit.module";

@Module({
  imports: [
    DbModule,
    RateLimitModule,
    AuthModule,
    DevModule,
    NotificationsModule,
    OrganizationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
