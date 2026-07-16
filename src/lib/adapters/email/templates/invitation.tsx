import type { TemplateProps } from "../contract";
import { Button, EmailLayout, FallbackLink, Heading, Text } from "./layout";

export function invitationSubject({ orgName }: TemplateProps["invitation"]): string {
  return `You've been invited to join ${orgName}`;
}

export function Invitation({ url, orgName, inviterName, role }: TemplateProps["invitation"]) {
  return (
    <EmailLayout preview={`${inviterName} invited you to join ${orgName}.`}>
      <Heading>Join {orgName}</Heading>
      <Text>
        {inviterName} invited you to join <strong>{orgName}</strong> as {role}.
      </Text>
      <Button href={url}>Accept invitation</Button>
      <FallbackLink href={url} />
      <Text muted>
        This invitation expires in 7 days. If you weren&apos;t expecting it, you can ignore this
        email.
      </Text>
    </EmailLayout>
  );
}
