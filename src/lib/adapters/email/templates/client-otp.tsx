import type { TemplateProps } from "../contract";
import { EmailLayout, Heading, Text, type EmailTranslator } from "./layout";

/**
 * The parent's one-time sign-in code (langlion §2.19, US-4.5).
 *
 * NO BUTTON AND NO FALLBACK LINK, unlike every other template here — this message
 * carries a CODE, not a link, and the difference is deliberate rather than a
 * simplification. A magic link would authenticate whoever opens the mail, and the
 * inbox this goes to is frequently shared (two parents, one family address) or
 * forwarded. A code has to be typed into the tab that asked for it, which keeps
 * the session with the person who started it.
 *
 * It also means the template needs no `url`, so there is nothing here for a
 * corporate gateway to rewrite — the failure mode `FallbackLink` exists to
 * mitigate does not apply.
 */

export function clientOtpSubject({ code }: TemplateProps["client-otp"], t: EmailTranslator) {
  // The code is IN THE SUBJECT on purpose: on a phone it is readable from the
  // notification, which is the difference between typing six digits and opening a
  // mail client mid-signup.
  return t("client-otp.subject", { code });
}

/**
 * Big, monospaced, letter-spaced. Six digits misread as five is the most common
 * way this flow fails for a real person, and it costs them a whole round trip.
 */
function Code({ children }: { children: string }) {
  return (
    <p
      style={{
        margin: "24px 0",
        padding: "16px 20px",
        backgroundColor: "#f3f4f6",
        borderRadius: "6px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "28px",
        fontWeight: 600,
        letterSpacing: "6px",
        color: "#111827",
        textAlign: "center",
      }}
    >
      {children}
    </p>
  );
}

export function ClientOtp(
  { code, orgName, expiresInMinutes }: TemplateProps["client-otp"],
  t: EmailTranslator,
) {
  return (
    <EmailLayout preview={t("client-otp.preview", { orgName })}>
      <Heading>{t("client-otp.heading", { orgName })}</Heading>
      <Text>{t("client-otp.body", { orgName })}</Text>
      <Code>{code}</Code>
      <Text muted>{t("client-otp.expiry", { minutes: expiresInMinutes })}</Text>
      <Text muted>{t("client-otp.note")}</Text>
    </EmailLayout>
  );
}
