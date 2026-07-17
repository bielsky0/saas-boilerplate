import type { Locale } from "@/lib/i18n/config";
import type { TemplateProps } from "../contract";
import { Button, EmailLayout, FallbackLink, Heading, Text, type EmailTranslator } from "./layout";

export function paymentFailedSubject(_props: TemplateProps["payment-failed"], t: EmailTranslator) {
  return t("payment-failed.subject");
}

/**
 * `amount` is in MINOR UNITS, exactly as `billing_payment.amount` stores it and
 * the provider reports it (see that table's header). Divide here, at the one place
 * that renders it for a human — never upstream, where a float would then be summed.
 *
 * The locale is an argument now (§16.1). This used to pin `en-US`, which printed
 * "€12.00" to a Polish reader whose own convention is "12,00 €" — the right number
 * with the wrong separator, symbol and position, inside an otherwise Polish
 * sentence. `t.locale` is the language the rest of the message is rendered in, so
 * the amount cannot disagree with the words around it.
 */
function formatAmount(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100);
  } catch {
    // An unknown/invalid ISO code must not take down a dunning email — that is
    // the one email whose non-delivery costs the customer money.
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function PaymentFailed(
  { orgName, amount, currency, manageUrl }: TemplateProps["payment-failed"],
  t: EmailTranslator,
  locale: Locale,
) {
  return (
    <EmailLayout preview={t("payment-failed.preview", { orgName })}>
      <Heading>{t("payment-failed.heading")}</Heading>
      <Text>
        {t.rich("payment-failed.body", {
          amount: formatAmount(amount, currency, locale),
          orgName,
          b: (chunks) => <strong>{chunks}</strong>,
        })}
      </Text>
      <Text>{t("payment-failed.action")}</Text>
      <Button href={manageUrl}>{t("payment-failed.cta")}</Button>
      <FallbackLink href={manageUrl} t={t} />
      <Text muted>{t("payment-failed.note")}</Text>
    </EmailLayout>
  );
}
