import type { TemplateProps } from "../contract";
import { Button, EmailLayout, FallbackLink, Heading, Text } from "./layout";

export const paymentFailedSubject = "Your payment didn't go through";

/**
 * `amount` is in MINOR UNITS, exactly as `billing_payment.amount` stores it and
 * the provider reports it (see that table's header). Divide here, at the one place
 * that renders it for a human — never upstream, where a float would then be summed.
 */
function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
  } catch {
    // An unknown/invalid ISO code must not take down a dunning email — that is
    // the one email whose non-delivery costs the customer money.
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function PaymentFailed({
  orgName,
  amount,
  currency,
  manageUrl,
}: TemplateProps["payment-failed"]) {
  return (
    <EmailLayout preview={`We couldn't process the payment for ${orgName}.`}>
      <Heading>Your payment didn&apos;t go through</Heading>
      <Text>
        We couldn&apos;t process the {formatAmount(amount, currency)} payment for{" "}
        <strong>{orgName}</strong>. This usually means the card expired or was declined.
      </Text>
      <Text>Update your payment method to keep your subscription active.</Text>
      <Button href={manageUrl}>Update payment method</Button>
      <FallbackLink href={manageUrl} />
      <Text muted>
        We&apos;ll retry automatically over the next few days. If the payment keeps failing, your
        subscription may be cancelled.
      </Text>
    </EmailLayout>
  );
}
