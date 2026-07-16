import type { TemplateProps } from "../contract";
import { Button, EmailLayout, Heading, Text, UnsubscribeFooter, greetingName } from "./layout";
import { clientEnv } from "@/lib/env/client";

export const onboardingFeaturesSubject = "Ready for more?";

/**
 * Day 7 of the onboarding sequence (spec 10.3) — the last step.
 *
 * Never reaches anyone who already subscribed: the handler re-checks that at run
 * time, so the upgrade nudge cannot land on a paying customer.
 */
export function OnboardingFeatures({ name, unsubscribeUrl }: TemplateProps["onboarding-features"]) {
  return (
    <EmailLayout preview="The features you haven't tried yet.">
      <Heading>Ready for more?</Heading>
      <Text>
        Hi {greetingName(name)}, you&apos;ve been with us a week. Here&apos;s what a paid plan opens
        up:
      </Text>
      <ul style={{ margin: "0 0 16px", paddingLeft: "20px", fontSize: "14px", color: "#374151" }}>
        <li style={{ marginBottom: "8px" }}>More seats for your team</li>
        <li style={{ marginBottom: "8px" }}>
          Higher limits on everything you&apos;re already using
        </li>
        <li style={{ marginBottom: "8px" }}>Priority support when something breaks</li>
      </ul>
      {/* Points at /pricing once the pricing table lands (spec 5.2 / 7.3); until
          then the dashboard is the only real destination, and a 404 in a
          conversion email is worse than a soft landing. */}
      <Button href={`${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard`}>See what&apos;s available</Button>
      <UnsubscribeFooter url={unsubscribeUrl} />
    </EmailLayout>
  );
}
