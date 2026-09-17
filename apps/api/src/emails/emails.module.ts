import { Module } from "@nestjs/common";

import { EmailsService } from "./emails.service";
import { UnsubscribeController } from "./unsubscribe.controller";

/**
 * Email delivery module (spec 10) — transport (log/resend), templates,
 * suppression, the `email.send` handler, and the RFC 8058 endpoint.
 *
 * Imported by every module whose jobs send mail (onboarding, billing-notify)
 * and by the jobs registry. The adapter is chosen by `EMAIL_PROVIDER`;
 * feature code calls `EmailsService.enqueueEmail`, never `send` directly.
 */
@Module({
  controllers: [UnsubscribeController],
  providers: [EmailsService],
  exports: [EmailsService],
})
export class EmailsModule {}
