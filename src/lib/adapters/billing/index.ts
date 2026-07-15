/**
 * Billing provider adapter (spec 1.2, 5.1 — pluggable payments backend).
 *
 * Defines the internal billing contract: create customer, create/update/cancel
 * subscription, fetch invoices, build checkout & portal sessions, verify and
 * parse webhooks. Stripe is the reference implementation; Lemon Squeezy,
 * Paddle, PayPal, Dodo, Polar plug in behind the same interface.
 */

export {};
