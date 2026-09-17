import type { TemplateProps } from "@repo/contracts";

import {
  Button,
  EmailLayout,
  Heading,
  Text,
  UnsubscribeFooter,
  greetingArgs,
  type EmailTranslator,
} from "./layout";
import type { TemplateLinks } from "./index";

export function welcomeSubject(_props: TemplateProps["welcome"], t: EmailTranslator) {
  return t("welcome.subject");
}

/**
 * Day 0 of the onboarding sequence (spec 10.3), not a standalone transactional
 * mail — which is why it carries an unsubscribe footer.
 */
export function Welcome(
  { name, unsubscribeUrl }: TemplateProps["welcome"],
  t: EmailTranslator,
  _locale: string,
  links: TemplateLinks,
) {
  return (
    <EmailLayout preview={t("welcome.preview")}>
      <Heading>{t("welcome.heading", greetingArgs(name))}</Heading>
      <Text>{t("welcome.body")}</Text>
      <Text>{t("welcome.next")}</Text>
      <Button href={`${links.appUrl}/dashboard`}>{t("welcome.cta")}</Button>
      <UnsubscribeFooter url={unsubscribeUrl} t={t} />
    </EmailLayout>
  );
}
