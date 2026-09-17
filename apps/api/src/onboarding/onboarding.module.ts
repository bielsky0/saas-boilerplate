import { Module } from "@nestjs/common";

import { EmailsModule } from "../emails/emails.module";
import { OnboardingService } from "./onboarding.service";

/**
 * Onboarding sequence module (spec 10.3) — the day 0/3/7 steps, the
 * paid-subscription interrupt, and the sequence starter the auth engine calls
 * after email verification.
 */
@Module({
  imports: [EmailsModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
