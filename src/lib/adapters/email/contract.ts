import type { Locale } from "@/lib/i18n/config";

/**
 * Email provider contract (spec 1.2, 10.1 — pluggable transactional email).
 *
 * Feature code depends ONLY on this interface and the `TemplateName` union.
 * Concrete adapters (log/dev, Resend, …) live beside this file and are chosen by
 * the factory in `./index.ts`. No provider SDK is imported here.
 *
 * This adapter is DUMB TRANSPORT. It renders and delivers. It knows nothing about
 * categories, unsubscribe preferences, or tokens — that is `features/emails`,
 * because those are product policy, not provider capability. The one delivery
 * path in the app is the `email.send` job handler (spec 12); feature code calls
 * `enqueueEmail`, never `send` directly, which is what keeps retry and suppression
 * in one file each instead of eight.
 */

/** Every template the app can send (spec 10.2). */
export type TemplateName =
  // Transactional — always delivered; never suppressible.
  | "verify-email"
  | "password-reset"
  | "invitation"
  | "payment-failed"
  | "subscription-confirmed"
  // Onboarding sequence (spec 10.3) — carries an unsubscribe link.
  | "welcome"
  | "onboarding-tips"
  | "onboarding-features";
// `magic-link` lands with spec 2.2, which is not implemented yet.

/**
 * Per-template props.
 *
 * Typed per template rather than a loose bag: with eight templates and as many
 * trigger sites, `Record<string, unknown>` is how you ship a `payment-failed`
 * whose `orgName` is spelled `organizationName` with no compiler complaint.
 */
export interface TemplateProps {
  "verify-email": { url: string; name?: string | null };
  "password-reset": { url: string; name?: string | null };
  invitation: { url: string; orgName: string; inviterName: string; role: string };
  /**
   * `manageUrl` points at wherever the user deals with billing. Today that is an
   * in-app settings page; it becomes the provider-hosted customer portal link
   * once spec 5.5 lands, which changes the caller, not these templates.
   */
  "payment-failed": { orgName: string; amount: number; currency: string; manageUrl: string };
  "subscription-confirmed": { orgName: string; planName: string; manageUrl: string };
  welcome: { name?: string | null; unsubscribeUrl: string };
  "onboarding-tips": { name?: string | null; unsubscribeUrl: string };
  "onboarding-features": { name?: string | null; unsubscribeUrl: string };
}

/** Loose payload shape for callers that resolve the template at runtime. */
export type TemplateData = Record<string, unknown>;

export interface Recipient {
  to: string;
  name?: string;
  /**
   * The language to write to this person in (spec 16.1).
   *
   * A property of the RECIPIENT, not of the message: you cannot address a human
   * without knowing what language they read, and the same template goes out in
   * different languages to different people.
   *
   * REQUIRED, not optional, and that is the whole point — it applies the
   * `indexable` precedent from lib/public-routes.ts. Optional would mean every
   * caller who forgets silently sends English to a Polish user, and nothing
   * anywhere records that it happened. Required makes "in what language?" a
   * question the compiler asks at each of the eight enqueue sites.
   */
  locale: Locale;
}

export interface SendOptions {
  /**
   * Extra RFC 5322 headers — `List-Unsubscribe` and friends (spec 10.3).
   *
   * The caller builds these because only it knows the template's category and can
   * mint the token. Spec 10.1 pins the signature as `send(template, dane,
   * odbiorca)`, so this stays an optional fourth parameter.
   */
  headers?: Record<string, string>;
}

/** A template rendered to the two bodies every mail client can consume. */
export interface RenderedEmail {
  subject: string;
  html: string;
  /** Plain-text fallback (spec 10.2). */
  text: string;
}

export interface EmailAdapter {
  /**
   * Render `template` with `data` and deliver it to `recipient`.
   *
   * IMPLEMENTATIONS MUST THROW ON DELIVERY FAILURE. Throwing is the ONLY way the
   * job queue learns to retry (§12.2): the handler's exception is what schedules
   * the backoff. An adapter that catches and logs instead converts a transient
   * provider outage into permanent, silent data loss — the user simply never gets
   * the email and nothing anywhere records that.
   */
  send(
    template: TemplateName,
    data: TemplateData,
    recipient: Recipient,
    options?: SendOptions,
  ): Promise<void>;
}
