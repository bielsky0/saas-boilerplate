import type { TemplateProps } from "../contract";
import { EmailLayout, Heading, Text, type EmailTranslator } from "./layout";

/**
 * New grade recorded (langlion §2.33, EPIK 35, v16, Faza 6).
 *
 * E-MAIL-FIRST BY DECISION (Rozstrzygnięcie #3, plan Faza 6): the client is
 * notified the moment staff record a value, with no link into the client panel
 * — the panel does not show grades yet (US-35.6 is an F13 retrofit). This
 * template says only that something was recorded, not what: the value itself
 * stays staff-side until F13 gives the parent somewhere to read it.
 */
export function gradeRecordedSubject(
  { orgName }: TemplateProps["grade-recorded"],
  t: EmailTranslator,
) {
  return t("grade-recorded.subject", { orgName });
}

export function GradeRecorded(
  { orgName, athleteName, fieldName }: TemplateProps["grade-recorded"],
  t: EmailTranslator,
) {
  return (
    <EmailLayout preview={t("grade-recorded.preview", { orgName })}>
      <Heading>{t("grade-recorded.heading", { orgName })}</Heading>
      <Text>{t("grade-recorded.body", { athleteName, fieldName })}</Text>
    </EmailLayout>
  );
}
