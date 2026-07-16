import { render } from "@react-email/render";
import type { ReactElement } from "react";

import type { RenderedEmail, TemplateData, TemplateName, TemplateProps } from "../contract";
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
  subject: (props: TemplateProps[N]) => string;
  component: (props: TemplateProps[N]) => ReactElement;
}

/** Most subjects are constant; this keeps them from each needing a function. */
function constant<N extends TemplateName>(subject: string): (props: TemplateProps[N]) => string {
  return () => subject;
}

const templates: { [N in TemplateName]: TemplateDef<N> } = {
  "verify-email": { subject: constant(verifyEmailSubject), component: VerifyEmail },
  "password-reset": { subject: constant(passwordResetSubject), component: PasswordReset },
  invitation: { subject: invitationSubject, component: Invitation },
  "payment-failed": { subject: constant(paymentFailedSubject), component: PaymentFailed },
  "subscription-confirmed": {
    subject: constant(subscriptionConfirmedSubject),
    component: SubscriptionConfirmed,
  },
  welcome: { subject: constant(welcomeSubject), component: Welcome },
  "onboarding-tips": { subject: constant(onboardingTipsSubject), component: OnboardingTips },
  "onboarding-features": {
    subject: constant(onboardingFeaturesSubject),
    component: OnboardingFeatures,
  },
};

/**
 * Render a template to subject + HTML + plain text.
 *
 * Async because `render` is: the signature is the adapter's internal seam, and
 * both `log.ts` and `resend.ts` await it.
 *
 * `data` is the loose `TemplateData` rather than `TemplateProps[N]` because the
 * call arrives from a job payload, where the template name is only known at run
 * time. The typed door is `enqueueEmail`; by here it has already been zod-parsed.
 */
export async function renderTemplate(
  template: TemplateName,
  data: TemplateData,
): Promise<RenderedEmail> {
  const def = templates[template] as TemplateDef<TemplateName>;
  const props = data as TemplateProps[TemplateName];
  const node = def.component(props);
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })]);
  return { subject: def.subject(props), html, text };
}
