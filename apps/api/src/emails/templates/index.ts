import { render } from "@react-email/render";
import type { ReactElement } from "react";

import type { Locale } from "@repo/i18n-core";
import type { RenderedEmail, TemplateData, TemplateName, TemplateProps } from "@repo/contracts";
import { getEmailTranslator, type EmailTranslator } from "../translator";
import { Invitation, invitationSubject } from "./invitation";
import { OnboardingFeatures, onboardingFeaturesSubject } from "./onboarding-features";
import { OnboardingTips, onboardingTipsSubject } from "./onboarding-tips";
import { PasswordReset, passwordResetSubject } from "./password-reset";
import { PaymentFailed, paymentFailedSubject } from "./payment-failed";
import { SubscriptionConfirmed, subscriptionConfirmedSubject } from "./subscription-confirmed";
import { VerifyEmail, verifyEmailSubject } from "./verify-email";
import { Welcome, welcomeSubject } from "./welcome";

/**
 * Template registry (spec 10.2 — component templates, HTML + plain-text) —
 * the Nest twin of web's `src/lib/adapters/email/templates/index.ts`.
 *
 * ONE component produces BOTH bodies: `render(node)` for HTML and
 * `render(node, { plainText: true })` for the fallback.
 *
 * Adding a template: add it to `TemplateName` in `@repo/contracts`, add its
 * props to `TemplateProps`, write the component, register it here, and
 * classify it in `../categories.ts`. The last two are compile errors if
 * forgotten — both maps are `Record<TemplateName, _>`.
 */

/**
 * Request-independent links a template may need. Web reads these from the
 * client env; the API has no client env, so the render call carries them.
 * Today only the web dashboard URL (onboarding CTAs land on pages).
 */
export interface TemplateLinks {
  appUrl: string;
}

interface TemplateDef<N extends TemplateName> {
  subject: (props: TemplateProps[N], t: EmailTranslator) => string;
  /**
   * `locale` is the third argument because ICU cannot express a CURRENCY whose
   * code is only known at runtime: `{amount, number, ::currency/EUR}` bakes
   * the currency into the message, and `payment-failed` gets it from the
   * provider. So that one template formats the amount itself and needs the
   * locale to do it. Every other template ignores the parameter.
   */
  component: (
    props: TemplateProps[N],
    t: EmailTranslator,
    locale: Locale,
    links: TemplateLinks,
  ) => ReactElement;
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
 * `data` is the loose `TemplateData` rather than `TemplateProps[N]` because
 * the call arrives from a job payload, where the template name is only known
 * at run time. The typed door is `enqueueEmail`; by here it has already been
 * zod-parsed.
 *
 * The translator is built ONCE and passed to both `subject` and `component`:
 * a subject in one language and a body in another is a specific kind of
 * broken that only shows up in production, in the language nobody on the team
 * reads.
 */
export async function renderTemplate(
  template: TemplateName,
  data: TemplateData,
  locale: Locale,
  links: TemplateLinks,
): Promise<RenderedEmail> {
  const def = templates[template] as TemplateDef<TemplateName>;
  const props = data as TemplateProps[TemplateName];
  const t = getEmailTranslator(locale);
  const node = def.component(props, t, locale, links);
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
  return { subject: def.subject(props, t), html, text };
}
