import type { TemplateProps } from "../contract";
import { Button, EmailLayout, FallbackLink, Heading, Text, type EmailTranslator } from "./layout";

export function invitationSubject({ orgName }: TemplateProps["invitation"], t: EmailTranslator) {
  return t("invitation.subject", { orgName });
}

export function Invitation(
  { url, orgName, inviterName, role }: TemplateProps["invitation"],
  t: EmailTranslator,
) {
  return (
    <EmailLayout preview={t("invitation.preview", { inviterName, orgName })}>
      <Heading>{t("invitation.heading", { orgName })}</Heading>
      <Text>
        {/*
          `t.rich`, not `t`: the emphasis is part of the sentence, so it belongs in
          the message where a translator can move it. Polish word order differs
          from English, and a template that hard-codes <strong> around the second
          interpolation would bold the wrong word in half the languages.
        */}
        {t.rich("invitation.body", {
          inviterName,
          orgName,
          role,
          b: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
      <Button href={url}>{t("invitation.cta")}</Button>
      <FallbackLink href={url} t={t} />
      <Text muted>{t("invitation.note")}</Text>
    </EmailLayout>
  );
}
