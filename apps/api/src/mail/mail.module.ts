import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { MailController } from "./mail.controller";
import { MailService } from "./mail.service";

/**
 * Internal mail module (etap 5, faza 5.4) — threads, messages, folders, flags
 * and the `mail.deliver` handler. Imports `AuthModule` for `SessionGuard`;
 * `JobsModule` imports THIS module to register the handler (never the reverse,
 * which would be a cycle).
 */
@Module({
  imports: [AuthModule],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
