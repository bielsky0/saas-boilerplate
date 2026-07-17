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

export function onboardingTipsSubject(
  _props: TemplateProps["onboarding-tips"],
  t: EmailTranslator,
) {
  return t("onboarding-tips.subject");
}

const LIST_STYLE = {
  margin: "0 0 16px",
  paddingLeft: "20px",
  fontSize: "14px",
  color: "#374151",
} as const;

/** Day 3 of the onboarding sequence (spec 10.3). */
export function OnboardingTips(
  { name, unsubscribeUrl }: TemplateProps["onboarding-tips"],
  t: EmailTranslator,
) {
  return (
    <EmailLayout preview={t("onboarding-tips.preview")}>
      <Heading>{t("onboarding-tips.heading")}</Heading>
      <Text>{t("onboarding-tips.body", greetingArgs(name))}</Text>
      <ul style={LIST_STYLE}>
        <li style={{ marginBottom: "8px" }}>
          <strong>{t("onboarding-tips.inviteTitle")}</strong> {t("onboarding-tips.inviteText")}
        </li>
        <li style={{ marginBottom: "8px" }}>
          <strong>{t("onboarding-tips.rolesTitle")}</strong> {t("onboarding-tips.rolesText")}
        </li>
        <li style={{ marginBottom: "8px" }}>
          <strong>{t("onboarding-tips.contextTitle")}</strong> {t("onboarding-tips.contextText")}
        </li>
      </ul>
      <Button href={`${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard`}>
        {t("onboarding-tips.cta")}
      </Button>
      <UnsubscribeFooter url={unsubscribeUrl} t={t} />
    </EmailLayout>
  );
}
