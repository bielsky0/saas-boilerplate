import { render } from "@react-email/render";
import type { ReactElement } from "react";

import { type Locale, getTranslator } from "@/lib/i18n";
import type { RenderedEmail, TemplateData, TemplateName, TemplateProps } from "../contract";
import type { EmailTranslator } from "./layout";
import { ClientOtp, clientOtpSubject } from "./client-otp";
import { Invitation, invitationSubject } from "./invitation";
import { OnboardingFeatures, onboardingFeaturesSubject } from "./onboarding-features";
import { OnboardingTips, onboardingTipsSubject } from "./onboarding-tips";
import { PasswordReset, passwordResetSubject } from "./password-reset";
import { PaymentFailed, paymentFailedSubject } from "./payment-failed";
import { SubscriptionConfirmed, subscriptionConfirmedSubject } from "./subscription-confirmed";
import { VerifyEmail, verifyEmailSubject } from "./verify-email";
import { Welcome, welcomeSubject } from "./welcome";

/**
 * Template registry (spec 10.2 — component templates, HTML + plain-text).
 *
 * ONE component produces BOTH bodies: `render(node)` for HTML and
 * `render(node, { plainText: true })` for the fallback. That is the entire reason
 * this indirection exists — the previous hand-written literals kept two copies of
 * every message in sync by hand, and they drift.
 *
 * Adding a template: add it to `TemplateName` in ../contract.ts, add its props to
 * `TemplateProps`, write the component, register it here, and classify it in
 * features/emails/categories.ts. The last two are compile errors if you forget —
 * both maps are `Record<TemplateName, _>`.
 */

interface TemplateDef<N extends TemplateName> {
  subject: (props: TemplateProps[N], t: EmailTranslator) => string;
  /**
   * `locale` is the third argument because ICU cannot express a CURRENCY whose
   * code is only known at runtime: `{amount, number, ::currency/EUR}` bakes the
   * currency into the message, and `payment-failed` gets it from the provider.
   * So that one template formats the amount itself and needs the locale to do it.
   * Every other template ignores the parameter.
   */
  component: (props: TemplateProps[N], t: EmailTranslator, locale: Locale) => ReactElement;
}

const templates: { [N in TemplateName]: TemplateDef<N> } = {
  "verify-email": { subject: verifyEmailSubject, component: VerifyEmail },
  "password-reset": { subject: passwordResetSubject, component: PasswordReset },
  invitation: { subject: invitationSubject, component: Invitation },
  "payment-failed": { subject: paymentFailedSubject, component: PaymentFailed },
  "subscription-confirmed": {
    subject: subscriptionConfirmedSubject,
    component: SubscriptionConfirmed,
  },
  "client-otp": { subject: clientOtpSubject, component: ClientOtp },
  welcome: { subject: welcomeSubject, component: Welcome },
  "onboarding-tips": { subject: onboardingTipsSubject, component: OnboardingTips },
  "onboarding-features": {
    subject: onboardingFeaturesSubject,
    component: OnboardingFeatures,
  },
};

/**
 * Render a template to subject + HTML + plain text, in `locale`.
 *
 * Async because `render` is: the signature is the adapter's internal seam, and
 * both `log.ts` and `resend.ts` await it.
 *
 * `data` is the loose `TemplateData` rather than `TemplateProps[N]` because the
 * call arrives from a job payload, where the template name is only known at run
 * time. The typed door is `enqueueEmail`; by here it has already been zod-parsed.
 *
 * ─── Why `getTranslator` and not `getTranslations` (spec 16.1) ──────────────
 *
 * This runs inside a CRON DRAIN. There is no request, no headers, and no React
 * `cache` — so `getTranslations()`, which resolves through `getRequestConfig`,
 * throws here. `getTranslator(locale, ns)` is a pure function of
 * (locale, messages) and is the only shape that works. It is the reason
 * src/lib/i18n exports it at all.
 *
 * The translator is built ONCE and passed to both `subject` and `component`:
 * a subject in one language and a body in another is a specific kind of broken
 * that only shows up in production, in the language nobody on the team reads.
 */
export async function renderTemplate(
  template: TemplateName,
  data: TemplateData,
  locale: Locale,
): Promise<RenderedEmail> {
  const def = templates[template] as TemplateDef<TemplateName>;
  const props = data as TemplateProps[TemplateName];
  const t = getTranslator(locale, "emails");
  const node = def.component(props, t, locale);
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
  return { subject: def.subject(props, t), html, text };
}
