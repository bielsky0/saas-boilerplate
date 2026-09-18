import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { LocaleController } from "./locale.controller";
import { LocaleService } from "./locale.service";

/**
 * Locale module (faza 2.8) — persistence for the explicit language choice
 * (spec 16.1). One guarded endpoint; the cookie half stays in the web app's
 * `/api/locale` route (each side owns its cookie).
 */
@Module({
  imports: [AuthModule],
  controllers: [LocaleController],
  providers: [LocaleService],
})
export class LocaleModule {}
