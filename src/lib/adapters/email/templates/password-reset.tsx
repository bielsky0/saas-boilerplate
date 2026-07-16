import type { TemplateProps } from "../contract";
import { Button, EmailLayout, FallbackLink, Heading, Text, greetingName } from "./layout";

export const passwordResetSubject = "Reset your password";

export function PasswordReset({ url, name }: TemplateProps["password-reset"]) {
  return (
    <EmailLayout preview="Reset your password.">
      <Heading>Reset your password</Heading>
      <Text>
        Hi {greetingName(name)}, we received a request to reset your password. Choose a new one
        using the link below.
      </Text>
      <Button href={url}>Reset password</Button>
      <FallbackLink href={url} />
      <Text muted>
        This link expires in 1 hour and can be used once. If you didn&apos;t request a reset, you
        can safely ignore this email — your password will not change.
      </Text>
    </EmailLayout>
  );
}
