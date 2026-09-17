import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

/**
 * Notifications module (spec 23) — the read side (bell list, mark-read),
 * the creation pipeline (`notification.create` handler + enqueue), and the
 * channel preferences (`PUT /v1/notifications/preferences`).
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
