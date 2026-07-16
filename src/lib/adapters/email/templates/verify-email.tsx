import type { TemplateProps } from "../contract";
import { Button, EmailLayout, FallbackLink, Heading, Text, greetingName } from "./layout";

export const verifyEmailSubject = "Verify your email address";

export function VerifyEmail({ url, name }: TemplateProps["verify-email"]) {
  return (
    <EmailLayout preview="Confirm your email address to finish setting up your account.">
      <Heading>Confirm your email</Heading>
      <Text>
        Hi {greetingName(name)}, thanks for signing up. Please confirm your email address to finish
        setting up your account.
      </Text>
      <Button href={url}>Verify email</Button>
      <FallbackLink href={url} />
      <Text muted>This link expires in 24 hours.</Text>
    </EmailLayout>
  );
}
