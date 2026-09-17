import { Module } from "@nestjs/common";

import { API_CONFIG } from "../db/db.module";
import type { ApiConfig } from "../common/config";
import { AuthModule } from "../auth/auth.module";
import { BILLING_ADAPTER, createBillingAdapter } from "./adapter";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

/**
 * Billing module (spec 5, faza 2.5) — checkout, portal, webhook and reads over
 * the tenant-scoped billing tables, plus the Stripe/null adapter behind the
 * contract.
 *
 * Provider selection comes from validated config (`BILLING_PROVIDER`): the
 * factory reads no `process.env` itself, and the `none` default never throws,
 * so the API boots with zero payment configuration. The notification fan-out
 * (`billing.notify`, owned by the jobs registry) reads through `BillingService`
 * only where it must — recipient resolution stays in `billing-notify`, which
 * owns the fan-out.
 */
@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    {
      provide: BILLING_ADAPTER,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) =>
        createBillingAdapter({
          provider: config.BILLING_PROVIDER,
          keys: {
            secretKey: config.STRIPE_SECRET_KEY,
            webhookSecret: config.STRIPE_WEBHOOK_SECRET,
          },
        }),
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
