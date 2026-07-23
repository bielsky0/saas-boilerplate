import type { TemplateProps } from "../contract";
import { EmailLayout, Heading, Text, type EmailTranslator } from "./layout";

/**
 * New progress note recorded (langlion §2.33, EPIK 35, v16, Faza 6).
 *
 * Same e-mail-first decision as `grade-recorded` — see that template's header.
 */
export function progressNoteAddedSubject(
  { orgName }: TemplateProps["progress-note-added"],
  t: EmailTranslator,
) {
  return t("progress-note-added.subject", { orgName });
}

export function ProgressNoteAdded(
  { orgName, athleteName }: TemplateProps["progress-note-added"],
  t: EmailTranslator,
) {
  return (
    <EmailLayout preview={t("progress-note-added.preview", { orgName })}>
      <Heading>{t("progress-note-added.heading", { orgName })}</Heading>
      <Text>{t("progress-note-added.body", { athleteName })}</Text>
    </EmailLayout>
  );
}
