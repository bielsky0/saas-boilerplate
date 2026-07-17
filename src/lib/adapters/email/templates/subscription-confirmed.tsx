import type { TemplateProps } from "../contract";
import { Button, EmailLayout, FallbackLink, Heading, Text, type EmailTranslator } from "./layout";

export function subscriptionConfirmedSubject(
  _props: TemplateProps["subscription-confirmed"],
  t: EmailTranslator,
) {
  return t("subscription-confirmed.subject");
}

export function SubscriptionConfirmed(
  { orgName, planName, manageUrl }: TemplateProps["subscription-confirmed"],
  t: EmailTranslator,
) {
  return (
    <EmailLayout preview={t("subscription-confirmed.preview", { planName, orgName })}>
      <Heading>{t("subscription-confirmed.heading")}</Heading>
      <Text>
        {t.rich("subscription-confirmed.body", {
          planName,
          orgName,
          b: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
      <Text>{t("subscription-confirmed.manage")}</Text>
      <Button href={manageUrl}>{t("subscription-confirmed.cta")}</Button>
      <FallbackLink href={manageUrl} t={t} />
    </EmailLayout>
  );
}
