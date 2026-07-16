import type { TemplateProps } from "../contract";
import { Button, EmailLayout, Heading, Text, UnsubscribeFooter, greetingName } from "./layout";
import { clientEnv } from "@/lib/env/client";

export const welcomeSubject = "Welcome aboard";

/**
 * Day 0 of the onboarding sequence (spec 10.3), not a standalone transactional
 * mail — which is why it carries an unsubscribe footer. See
 * features/emails/categories.ts.
 */
export function Welcome({ name, unsubscribeUrl }: TemplateProps["welcome"]) {
  return (
    <EmailLayout preview="Your account is ready.">
      <Heading>Welcome, {greetingName(name)}!</Heading>
      <Text>Your email is verified and your account is ready to use.</Text>
      <Text>
        Start by creating an organization and inviting your team — that&apos;s where the shared
        workspace lives.
      </Text>
      <Button href={`${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard`}>Open your dashboard</Button>
      <UnsubscribeFooter url={unsubscribeUrl} />
    </EmailLayout>
  );
}
