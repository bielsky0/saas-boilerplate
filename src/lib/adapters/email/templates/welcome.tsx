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

export function welcomeSubject(_props: TemplateProps["welcome"], t: EmailTranslator) {
  return t("welcome.subject");
}

/**
 * Day 0 of the onboarding sequence (spec 10.3), not a standalone transactional
 * mail — which is why it carries an unsubscribe footer. See
 * features/emails/categories.ts.
 */
export function Welcome({ name, unsubscribeUrl }: TemplateProps["welcome"], t: EmailTranslator) {
  return (
    <EmailLayout preview={t("welcome.preview")}>
      <Heading>{t("welcome.heading", greetingArgs(name))}</Heading>
      <Text>{t("welcome.body")}</Text>
      <Text>{t("welcome.next")}</Text>
      <Button href={`${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard`}>{t("welcome.cta")}</Button>
      <UnsubscribeFooter url={unsubscribeUrl} t={t} />
    </EmailLayout>
  );
}
