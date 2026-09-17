import { Module } from "@nestjs/common";

import { EmailsModule } from "../emails/emails.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { BillingNotifyService } from "./billing-notify.service";

/**
 * Billing-notify module (spec 10.2) — the `billing.notify` fan-out ONLY.
 *
 * Checkout/portal/webhook move in faza 2.5; until then the webhook still
 * lives in web and enqueues into the shared table, and this handler drains
 * it here. Deliberately named `billing-notify` (not `billing`) so the 2.5
 * module takes the canonical name without a rename.
 */
@Module({
  imports: [EmailsModule, NotificationsModule],
  providers: [BillingNotifyService],
  exports: [BillingNotifyService],
})
export class BillingNotifyModule {}
