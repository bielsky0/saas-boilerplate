/**
 * Email provider adapter (spec 1.2, 10.1 — pluggable transactional email).
 *
 * Defines a single `send(template, data, recipient)` contract with adapters for
 * Resend / SES / Mailgun / SMTP. Templates (React → HTML + plain-text fallback)
 * and onboarding sequences are owned by the email feature/jobs; this layer only
 * abstracts delivery.
 */

export {};
