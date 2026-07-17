import type { Locale } from "./config";
import type { Messages } from "./messages";

/**
 * Teach next-intl our locales and our message shape (spec 16, §14.2 strict TS).
 *
 * Without this, `useLocale()`/`getLocale()` return a bare `string` and every
 * caller has to cast — which is exactly the `any`-shaped hole §14.2 exists to
 * prevent, just spelled differently. With it:
 *
 *   - `getLocale()` returns `"en" | "pl"`, so it can be handed straight to
 *     anything expecting a `Locale` with no cast and no runtime check;
 *   - `t("nav.doesNotExist")` is a COMPILE error rather than a key rendered at a
 *     user.
 *
 * `Messages` is `typeof en` — English is the fallback, so it is the only honest
 * answer to "what keys exist". See ./messages/index.ts.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
