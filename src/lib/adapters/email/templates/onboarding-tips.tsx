import type { TemplateProps } from "../contract";
import { Button, EmailLayout, Heading, Text, UnsubscribeFooter, greetingName } from "./layout";
import { clientEnv } from "@/lib/env/client";

export const onboardingTipsSubject = "Three things worth knowing";

/** Day 3 of the onboarding sequence (spec 10.3). */
export function OnboardingTips({ name, unsubscribeUrl }: TemplateProps["onboarding-tips"]) {
  return (
    <EmailLayout preview="A few things that make the product click.">
      <Heading>Getting the most out of it</Heading>
      <Text>Hi {greetingName(name)}, a few things that tend to click for people early on:</Text>
      <ul style={{ margin: "0 0 16px", paddingLeft: "20px", fontSize: "14px", color: "#374151" }}>
        <li style={{ marginBottom: "8px" }}>
          <strong>Invite your team.</strong> Most of the value shows up once more than one person is
          in the workspace.
        </li>
        <li style={{ marginBottom: "8px" }}>
          <strong>Use roles.</strong> Owners manage billing, admins manage people, members do the
          work.
        </li>
        <li style={{ marginBottom: "8px" }}>
          <strong>Switch context.</strong> Your personal space and each organization keep their data
          completely separate.
        </li>
      </ul>
      <Button href={`${clientEnv.NEXT_PUBLIC_APP_URL}/dashboard`}>Go to your dashboard</Button>
      <UnsubscribeFooter url={unsubscribeUrl} />
    </EmailLayout>
  );
}
