import type { TemplateProps } from "../contract";
import { Button, EmailLayout, FallbackLink, Heading, Text } from "./layout";

export const subscriptionConfirmedSubject = "Your subscription is active";

export function SubscriptionConfirmed({
  orgName,
  planName,
  manageUrl,
}: TemplateProps["subscription-confirmed"]) {
  return (
    <EmailLayout preview={`The ${planName} plan is now active for ${orgName}.`}>
      <Heading>Your subscription is active</Heading>
      <Text>
        The <strong>{planName}</strong> plan is now active for <strong>{orgName}</strong>. Thanks
        for subscribing.
      </Text>
      <Text>You can manage your plan, payment method, and invoices any time.</Text>
      <Button href={manageUrl}>Manage subscription</Button>
      <FallbackLink href={manageUrl} />
    </EmailLayout>
  );
}
