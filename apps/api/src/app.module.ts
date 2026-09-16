import { Module } from "@nestjs/common";

import { DbModule } from "./db/db.module";
import { HealthController } from "./health/health.controller";
import { NotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [DbModule, NotificationsModule],
  controllers: [HealthController],
})
export class AppModule {}
