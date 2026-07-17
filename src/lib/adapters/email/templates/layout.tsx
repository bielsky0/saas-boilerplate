import type { ReactNode } from "react";

import { getTranslator } from "@/lib/i18n";
import { site } from "@/lib/site";

/**
 * The translator handed to every template (spec 16.1), scoped to `emails`.
 *
 * Derived from `getTranslator` rather than hand-written, so the message keys stay
 * checked: `t("verify-email.subject")` compiles, `t("verify-email.subjekt")` does
 * not.
 *
 * Templates receive this as an ARGUMENT and never build their own. A template that
 * called `getTranslator()` itself would have to know the locale, and the whole
 * point of §16's email design is that the locale arrives from the job payload —
 * one place, resolved at enqueue, where it could still be known.
 */
export type EmailTranslator = ReturnType<typeof getTranslator<"emails">>;

/**
 * Shared email chrome (spec 10.2).
 *
 * Plain JSX with inline styles rather than `@react-email/components`: that
 * package and its whole primitive tree are deprecated on npm, while
 * `@react-email/render` — the part that actually earns its keep, turning one
 * component into both an HTML and a plain-text body — is maintained. Email HTML
 * needs inline styles and no stylesheet regardless, so the primitives were buying
 * very little here.
 *
 * Rules these components must keep following, because mail clients are not
 * browsers: inline styles only (Gmail strips <style>), no flex/grid, no external
 * assets, and every colour explicit — a client's dark mode will not read our
 * tokens.
 */

/*
 * The brand shown in the footer. `site` is app config, not a provider SDK, so an
 * adapter may read it — the no-lock-in rule (§1.2) fences vendor SDKs, not our
 * own configuration.
 */
const BRAND = site.name;

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
 * Not optional garnish: corporate mail gateways rewrite or strip <a href>, and a
 * button is then a dead end with no way for the user to recover.
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
 * This replaced a `greetingName()` that returned the literal `"there"` for an
 * unknown name, so the message could just interpolate `Hi {name},`. That works in
 * English and ONLY in English: Polish has no "hi there" — it says "Cześć!" — and
 * interpolating an empty string yields "Cześć ,". No choice of fallback WORD fixes
 * it, because the difference is in the sentence, not the noun.
 *
 * So the sentence branches instead, in the catalog, where a translator can see
 * both variants and write each naturally. This is exactly what ICU `select` is
 * for, and it is the concrete reason §16 chose a real ICU library over a
 * dictionary of strings.
 */
export function greetingArgs(name?: string | null): { named: "yes" | "no"; name: string } {
  const trimmed = name?.trim();
  return trimmed ? { named: "yes", name: trimmed } : { named: "no", name: "" };
}
