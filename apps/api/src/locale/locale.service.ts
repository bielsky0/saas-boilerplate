import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { user, type Db } from "@repo/db";
import type { Locale } from "@repo/i18n-core";
import { DB } from "../db/db.module";

/**
 * Locale persistence (spec 16.1, faza 2.8) — the Nest twin of web's deleted
 * `setLocaleAction`.
 *
 * ONE door, same split as before: `user.locale` is the DURABLE store (a cron
 * drain sending day-7 mail has no cookie and no request — the row is the only
 * thing left), the `app-locale` COOKIE is the request-time cache the proxy
 * reads without a query. The API writes the row; the WEB route writes the
 * cookie on its own response (each side owns its cookie — no server writes
 * the other side's).
 *
 * No permission check beyond a valid session: setting your OWN language is
 * not a privileged action, and the id comes from the session, never the body.
 */
@Injectable()
export class LocaleService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async setLocale(userId: string, locale: Locale): Promise<{ ok: true }> {
    await this.db.update(user).set({ locale }).where(eq(user.id, userId));
    return { ok: true };
  }
}
