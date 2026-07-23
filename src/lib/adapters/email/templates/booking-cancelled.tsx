import type { TemplateProps } from "../contract";
import { EmailLayout, Heading, Text, type EmailTranslator } from "./layout";

/**
 * Booking cancelled — confirmation sent to the parent after a self-service or
 * staff-initiated cancellation (langlion EPIK 12, Faza 7).
 *
 * `creditInfo` is present only when a compensation credit was issued (the booking
 * was `confirmed` — parent actually paid). For `booked_offline` / `payment_pending`
 * cancellations the email confirms the cancellation without mentioning a credit.
 */
export function bookingCancelledSubject(
  { orgName }: TemplateProps["booking-cancelled"],
  t: EmailTranslator,
) {
  return t("booking-cancelled.subject", { orgName });
}

export function BookingCancelled(
  { orgName, athleteName, groupTypeName, sessionDate, sessionTime, creditInfo }: TemplateProps["booking-cancelled"],
  t: EmailTranslator,
) {
  return (
    <EmailLayout preview={t("booking-cancelled.preview", { orgName })}>
      <Heading>{t("booking-cancelled.heading", { orgName })}</Heading>
      <Text>
        {t("booking-cancelled.body", {
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
