import type { ReactNode } from "react";
import { IntlMessageFormat, type FormatXMLElementFn } from "intl-messageformat";

import { DEFAULT_LOCALE, isLocale, type Locale } from "@repo/i18n-core";
import en from "./messages/en.json";
import pl from "./messages/pl.json";

/**
 * Email translator (spec 16.1) — the Nest twin of web's
 * `getTranslator(locale, "emails")`.
 *
 * Runs inside the queue drain: no request, no headers, no React cache — so it
 * is a pure function of (locale, messages). Built on `intl-messageformat`
 * directly (the ICU engine under web's next-intl), so the same catalog renders
 * byte-identically in both processes: `select` (the nameless-greeting branch),
 * interpolation, and rich-text tags.
 *
 * The catalog lives HERE for the API. Web keeps its own copy for now (its
 * superseded templates still compile against it until the mail stack is
 * removed there) — the two must stay identical until then. `Record<Locale, _>`
 * keeps the add-a-locale-without-a-catalog compile error; English is the shape.
 */

const CATALOGS: Record<Locale, typeof en> = { en, pl };

/** Narrow whatever is in a payload to a renderable locale (stale → English). */
export function toEmailLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

function resolveMessage(locale: Locale, key: string): string {
  const parts = key.split(".");
  let node: unknown = CATALOGS[locale];
  for (const part of parts) {
    if (typeof node !== "object" || node === null || !(part in node)) {
      throw new Error(`Unknown email message key "${key}" for locale "${locale}"`);
    }
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") {
    throw new Error(`Email message key "${key}" for locale "${locale}" is not a string`);
  }
  return node;
}

export interface EmailTranslator {
  (key: string, values?: Record<string, string | number>): string;
  rich(
    key: string,
    values?: Record<string, string | number | FormatXMLElementFn<ReactNode, ReactNode>>,
  ): ReactNode;
  locale: Locale;
}

/**
 * A translator for a known locale, with NO request context — same calling
 * shape as web's (callable + `.rich`), so the ported templates read
 * identically. The translator is built ONCE per render and passed to both the
 * subject and the component: a subject in one language and a body in another
 * is a specific kind of broken that only shows up in production.
 */
export function getEmailTranslator(locale: Locale): EmailTranslator {
  const format = (
    key: string,
    values: Record<string, string | number | FormatXMLElementFn<ReactNode, ReactNode>> | undefined,
    rich: boolean,
  ): ReactNode => {
    const template = resolveMessage(locale, key);
    const formatted = new IntlMessageFormat(template, locale).format(values);
    if (typeof formatted === "string") return formatted;
    // Rich text (tag functions in values) formats to parts — an array mixing
    // strings and elements. Returned as-is: JSX renders arrays as children.
    // Plain `t()` joins defensively so a subject is always a string.
    if (rich) return formatted as ReactNode;
    return Array.isArray(formatted)
      ? formatted.map((part) => (typeof part === "string" ? part : "")).join("")
      : String(formatted);
  };
  const t = ((key: string, values?: Record<string, string | number>): string =>
    format(key, values, false) as string) as EmailTranslator;
  t.rich = (
    key: string,
    values?: Record<string, string | number | FormatXMLElementFn<ReactNode, ReactNode>>,
  ): ReactNode => format(key, values, true);
  t.locale = locale;
  return t;
}
