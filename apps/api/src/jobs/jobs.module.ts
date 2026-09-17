import { Logger, Module } from "@nestjs/common";

import type { Db } from "@repo/db";
import type { JobRegistry, RateLimitAdapter } from "@repo/contracts";
import { DB } from "../db/db.module";
import { BillingNotifyModule } from "../billing-notify/billing-notify.module";
import { BillingNotifyService } from "../billing-notify/billing-notify.service";
import { EmailsModule } from "../emails/emails.module";
import { EmailsService } from "../emails/emails.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { NotificationsService } from "../notifications/notifications.service";
import { OnboardingModule } from "../onboarding/onboarding.module";
import { OnboardingService } from "../onboarding/onboarding.service";
import { StorageModule } from "../storage/storage.module";
import { RATE_LIMIT_MEMORY, RATE_LIMIT_POSTGRES } from "../rate-limit/rate-limit.module";
import { CronController } from "./cron.controller";
import { JobsService } from "./jobs.service";
import { pruneTerminalJobs } from "./prune";
import { JOB_REGISTRY } from "./registry-token";
import { StoragePurgeService } from "./storage-purge.service";

/**
 * Background-jobs module (spec 12) — queue, drain, and the handler registry.
 *
 * `JobRegistry` is `Record<JobName, _>`, so a job name with no handler here
 * is a compile error rather than a row that dead-letters at 3am with "No
 * handler registered". The registry is a provider (built from the handler
 * services) rather than an import: an adapter that imported feature code
 * would be a cycle, and a service-level cycle is what the token avoids.
 */
@Module({
  imports: [
    EmailsModule,
    OnboardingModule,
    NotificationsModule,
    BillingNotifyModule,
    StorageModule,
  ],
  controllers: [CronController],
  providers: [
    JobsService,
    StoragePurgeService,
    {
      provide: JOB_REGISTRY,
      inject: [
        DB,
        EmailsService,
        OnboardingService,
        NotificationsService,
        BillingNotifyService,
        StoragePurgeService,
        RATE_LIMIT_MEMORY,
        RATE_LIMIT_POSTGRES,
      ],
      useFactory: (
        db: Db,
        emails: EmailsService,
        onboarding: OnboardingService,
        notifications: NotificationsService,
        billingNotify: BillingNotifyService,
        purge: StoragePurgeService,
        rateLimitMemory: RateLimitAdapter,
        rateLimitPostgres: RateLimitAdapter,
      ): JobRegistry => {
        const log = new Logger("JobsRegistry");
        return {
          "email.send": (payload) => emails.handleEmailSend(payload),
          "onboarding.step": (payload) => onboarding.handleStep(payload),
          "billing.notify": (payload) => billingNotify.handleNotify(payload),
          "notification.create": (payload) => notifications.handleNotificationCreate(payload),
          "job.prune": async () => {
            const deleted = await pruneTerminalJobs(db);
            log.log(`pruned terminal jobs deleted=${deleted}`);
          },
          "storage.purge": () => purge.handlePurge(),
          "ratelimit.prune": async () => {
            // Both stores: the dev seam drives either one regardless of the
            // configured provider, and a no-op on memory is the healthy norm.
            const memory = await rateLimitMemory.prune();
            const postgres = await rateLimitPostgres.prune();
            log.log(`pruned expired rate-limit counters memory=${memory} postgres=${postgres}`);
          },
        };
      },
    },
  ],
  exports: [JobsService, JOB_REGISTRY],
})
export class JobsModule {}
