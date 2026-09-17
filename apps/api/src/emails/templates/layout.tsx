import type { ReactNode } from "react";

import type { EmailTranslator } from "../translator";

export type { EmailTranslator };

/**
 * Shared email chrome (spec 10.2) — the Nest twin of web's
 * `src/lib/adapters/email/templates/layout.tsx`.
 *
 * Plain JSX with inline styles rather than `@react-email/components`: that
 * package's primitive tree is deprecated on npm, while `@react-email/render`
 * — turning one component into both an HTML and a plain-text body — is
 * maintained. Mail clients are not browsers: inline styles only (Gmail strips
 * <style>), no flex/grid, no external assets, every colour explicit.
 */

/*
 * The brand shown in the footer. Web reads this from `src/lib/site.ts` (which
 * needs the client env); the API has no client env, so the name is stated
 * here. A rename touches two files — this one and web's `site.ts`.
 */
const BRAND = "SaaS Boilerplate";

export function EmailLayout({ preview, children }: { preview?: string; children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          padding: "24px",
          backgroundColor: "#f6f7f9",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          lineHeight: 1.5,
          color: "#111827",
        }}
      >
        {/*
         * Preview text: the snippet an inbox shows next to the subject. Hidden in
         * the body itself, which is why it carries its own display:none.
         */}
        {preview ? (
          <div
            style={{
              display: "none",
              overflow: "hidden",
              lineHeight: "1px",
              opacity: 0,
              maxHeight: 0,
              maxWidth: 0,
            }}
          >
            {preview}
          </div>
        ) : null}
        <div
          style={{
            maxWidth: "560px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            padding: "32px",
          }}
        >
          {children}
        </div>
        <div
          style={{
            maxWidth: "560px",
            margin: "16px auto 0",
            textAlign: "center",
            fontSize: "12px",
            color: "#6b7280",
          }}
        >
          {BRAND}
        </div>
      </body>
    </html>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <h1 style={{ margin: "0 0 16px", fontSize: "20px", fontWeight: 600, color: "#111827" }}>
      {children}
    </h1>
  );
}

export function Text({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <p style={{ margin: "0 0 16px", fontSize: "14px", color: muted ? "#6b7280" : "#374151" }}>
      {children}
    </p>
  );
}

export function Button({ href, children }: { href: string; children: ReactNode }) {
  return (
    <p style={{ margin: "24px 0" }}>
      <a
        href={href}
        style={{
          display: "inline-block",
          padding: "10px 18px",
          backgroundColor: "#111827",
          color: "#ffffff",
          borderRadius: "6px",
          textDecoration: "none",
          fontSize: "14px",
          fontWeight: 500,
        }}
      >
        {children}
      </a>
    </p>
  );
}

/**
 * The copy-paste fallback for every action link.
 *
 * Not optional garnish: corporate mail gateways rewrite or strip <a href>, and
 * a button is then a dead end with no way for the user to recover.
 */
export function FallbackLink({ href, t }: { href: string; t: EmailTranslator }) {
  return (
    <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#6b7280", wordBreak: "break-all" }}>
      {t("shared.fallbackLink")}
      <br />
      <a href={href} style={{ color: "#2563eb" }}>
        {href}
      </a>
    </p>
  );
}

/** Unsubscribe footer — required on every non-transactional email (spec 10.3). */
export function UnsubscribeFooter({ url, t }: { url: string; t: EmailTranslator }) {
  return (
    <div style={{ marginTop: "32px", borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
      <p style={{ margin: 0, fontSize: "12px", color: "#6b7280" }}>
        {t("shared.unsubscribeQuestion")}{" "}
        <a href={url} style={{ color: "#6b7280", textDecoration: "underline" }}>
          {t("shared.unsubscribeAction")}
        </a>
        .
      </p>
    </div>
  );
}

/**
 * ICU `select` arguments for a greeting that may not know the recipient's name.
 *
 * The sentence branches in the catalog (not a fallback word), because English's
 * "Hi there" has no Polish equivalent — `Cześć {name},` with an empty name reads
 * "Cześć ,". Each language writes its own variant via `select`.
 */
export function greetingArgs(name?: string | null): { named: "yes" | "no"; name: string } {
  const trimmed = name?.trim();
  return trimmed ? { named: "yes", name: trimmed } : { named: "no", name: "" };
}
