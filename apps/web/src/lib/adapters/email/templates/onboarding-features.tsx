import { clientEnv } from "@/lib/env/client";
import type { TemplateProps } from "../contract";
import {
  Button,
  EmailLayout,
  Heading,
  Text,
  UnsubscribeFooter,
  greetingArgs,
  type EmailTranslator,
} from "./layout";

export function onboardingFeaturesSubject(
  _props: TemplateProps["onboarding-features"],
  t: EmailTranslator,
) {
  return t("onboarding-features.subject");
}

const LIST_STYLE = {
  margin: "0 0 16px",
  paddingLeft: "20px",
  fontSize: "14px",
  color: "#374151",
} as const;

/**
 * Day 7 of the onboarding sequence (spec 10.3) — the last step.
 *
 * Never reaches anyone who already subscribed: the handler re-checks that at run
 * time, so the upgrade nudge cannot land on a paying customer.
 */
export function OnboardingFeatures(
  { name, unsubscribeUrl }: TemplateProps["onboarding-features"],
  t: EmailTranslator,
) {
  return (
    <EmailLayout preview={t("onboarding-features.preview")}>
      <Heading>{t("onboarding-features.heading")}</Heading>
      <Text>{t("onboarding-features.body", greetingArgs(name))}</Text>
      <ul style={LIST_STYLE}>
        <li style={{ marginBottom: "8px" }}>{t("onboarding-features.seats")}</li>
        <li style={{ marginBottom: "8px" }}>{t("onboarding-features.limits")}</li>
        <li style={{ marginBottom: "8px" }}>{t("onboarding-features.support")}</li>
      </ul>
      {/* Points at /pricing once the pricing table lands (spec 5.2 / 7.3); until
          then the dashboard is the only real destination, and a 404 in a
          conversion email is worse than a soft landing. */}
      <Button href={`${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard`}>
        {t("onboarding-features.cta")}
      </Button>
      <UnsubscribeFooter url={unsubscribeUrl} t={t} />
    </EmailLayout>
  );
}
