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

export function passwordResetSubject(_props: TemplateProps["password-reset"], t: EmailTranslator) {
  return t("password-reset.subject");
}

export function PasswordReset({ url, name }: TemplateProps["password-reset"], t: EmailTranslator) {
  return (
    <EmailLayout preview={t("password-reset.preview")}>
      <Heading>{t("password-reset.heading")}</Heading>
      <Text>{t("password-reset.body", greetingArgs(name))}</Text>
      <Button href={url}>{t("password-reset.cta")}</Button>
      <FallbackLink href={url} t={t} />
      <Text muted>{t("password-reset.note")}</Text>
    </EmailLayout>
  );
}
