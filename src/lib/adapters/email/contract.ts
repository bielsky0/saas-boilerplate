/**
 * Email provider contract (spec 1.2, 10.1 — pluggable transactional email).
 *
 * Feature code depends ONLY on this interface and the `TemplateName` union.
 * Concrete adapters (log/dev, Resend, …) live beside this file and are chosen
 * by the factory in `./index.ts`. No provider SDK is imported here.
 */

/**
 * Templates available for this phase (spec 10.2). The minimum set grows as
 * later modules land (password reset, magic link, invitations, …).
 */
export type TemplateName = "verify-email" | "welcome" | "invitation";

/** Structured payload each template understands. Kept loose per template. */
export type TemplateData = Record<string, unknown>;

export interface Recipient {
  to: string;
  name?: string;
}

/** A template rendered to the two bodies every mail client can consume. */
export interface RenderedEmail {
  subject: string;
  html: string;
  /** Plain-text fallback (spec 10.2). */
  text: string;
}

export interface EmailAdapter {
  /**
   * Render `template` with `data` and deliver it to `recipient`. Implementations
   * must not throw for routine delivery issues in a way that breaks the calling
   * auth flow unless delivery is essential; log/observe instead.
   */
  send(template: TemplateName, data: TemplateData, recipient: Recipient): Promise<void>;
}
