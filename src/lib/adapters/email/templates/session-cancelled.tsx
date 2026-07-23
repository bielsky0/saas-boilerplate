import type { TemplateProps } from "../contract";
import { EmailLayout, Heading, Text, type EmailTranslator } from "./layout";

/**
 * Session cancelled by admin — sent to every parent whose booking was affected
 * (langlion US-19.2/AC3, Faza 7).
 *
 * `creditInfo` is present only when a compensation credit was issued (the booking
 * was `confirmed`). All affected clients are notified simultaneously per US-19.2/AC3.
 */
export function sessionCancelledSubject(
  { orgName }: TemplateProps["session-cancelled"],
  t: EmailTranslator,
) {
  return t("session-cancelled.subject", { orgName });
}

export function SessionCancelled(
  { orgName, athleteName, groupTypeName, sessionDate, sessionTime, creditInfo }: TemplateProps["session-cancelled"],
  t: EmailTranslator,
) {
  return (
    <EmailLayout preview={t("session-cancelled.preview", { orgName })}>
      <Heading>{t("session-cancelled.heading", { orgName })}</Heading>
      <Text>
        {t("session-cancelled.body", {
          athleteName,
          groupTypeName,
          sessionDate,
          sessionTime,
        })}
      </Text>
      {creditInfo ? (
        <Text>{creditInfo}</Text>
      ) : null}
    </EmailLayout>
  );
}
