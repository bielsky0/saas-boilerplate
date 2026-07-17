import type { TemplateProps } from "../contract";
import {
  Button,
  EmailLayout,
  FallbackLink,
  Heading,
  Text,
  greetingArgs,
  type EmailTranslator,
} from "./layout";

export function verifyEmailSubject(_props: TemplateProps["verify-email"], t: EmailTranslator) {
  return t("verify-email.subject");
}

export function VerifyEmail({ url, name }: TemplateProps["verify-email"], t: EmailTranslator) {
  return (
    <EmailLayout preview={t("verify-email.preview")}>
      <Heading>{t("verify-email.heading")}</Heading>
      <Text>{t("verify-email.body", greetingArgs(name))}</Text>
      <Button href={url}>{t("verify-email.cta")}</Button>
      <FallbackLink href={url} t={t} />
      <Text muted>{t("verify-email.note")}</Text>
    </EmailLayout>
  );
}
