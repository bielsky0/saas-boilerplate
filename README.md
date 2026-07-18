# Next.js SaaS Boilerplate

A robust foundation for building B2B and B2C SaaS applications. The project is designed around multi-tenancy (personal accounts and organizations), secure access management, subscription billing, and an architecture that lets external service providers be replaced without changing business logic.

> **Status:** specification / ready for implementation. This repository does not yet include a working application or runtime environment configuration.

## Project goals

- Build with **Next.js (App Router)**, React, and TypeScript in `strict` mode.
- Support personal accounts and multi-member organizations.
- Isolate tenant data in the data-access layer, optionally reinforced with database-level RLS.
- Provide secure authentication, RBAC, MFA, and session management.
- Keep billing, email, job queues, and AI behind stable internal interfaces.
- Deploy to Vercel or run as a standalone Node.js application.

## Intended scope

| Area | Core capabilities |
| --- | --- |
| Authentication | Email/password, magic links, Google/GitHub OAuth, email verification, password reset, MFA/TOTP, and device sessions. |
| Multi-tenancy | Automatic personal accounts, organizations, invitations, member roles, and context switching. |
| Authorization | Owner, Admin, and Member roles with backend-enforced atomic permissions. |
| Billing | Plans and quotas, Stripe as the reference provider, checkout, customer portal, and idempotent webhooks. |
| Super admin | Users and organizations, account suspension, impersonation, and audit logs. |
| Frontend | Design tokens, light/dark/system theme, responsive landing page, and dashboard. |
| Content and SEO | Blog, documentation, changelog, SSR/SSG, sitemap, robots.txt, metadata, and JSON-LD. |
| Operations | Transactional emails, background jobs, retry/backoff, observability, i18n, and E2E tests. |

## Architecture

The central principle is **no vendor lock-in**. Domain code and UI communicate only through application contracts. Provider SDKs are used exclusively inside infrastructure adapters.

```text
Product features / UI
          │
          ▼
Application logic and contracts
          │
          ├── Auth adapter       → Better Auth / Supabase Auth / NextAuth
          ├── Data adapter       → PostgreSQL + Drizzle or Prisma
          ├── Billing adapter    → Stripe / Lemon Squeezy / Paddle / …
          ├── Email adapter      → Resend / SES / Mailgun / SMTP
          ├── Jobs adapter       → Inngest or equivalent
          └── Storage adapter    → selected storage provider
```

Replacing a provider should require changing or implementing an adapter—not modifying product features.

### Tenant isolation

Every business record belongs to exactly one context: a personal account or an organization. All queries must be scoped by data ownership in the data-access layer; the UI is never a security boundary. PostgreSQL row-level security is recommended as an additional safeguard.

## Planned technology stack

- **Application:** Next.js App Router, React, TypeScript (`strict`)
- **UI:** Tailwind CSS, shadcn/ui-style headless components, centralized design tokens
- **Database:** PostgreSQL, with Drizzle or Prisma behind a shared interface
- **Payments:** Stripe as the reference implementation, hosted checkout, signed and idempotent webhooks
- **Async processing:** scheduler/job queue with retries, backoff, and recurring tasks
- **Quality:** ESLint, Prettier, Playwright E2E, and pull-request CI
- **Observability:** error tracking, product analytics, structured logs with request IDs

## Security

- Passwords are stored only as hashes (`bcrypt` or `argon2`)—never logged or stored in plain text.
- Login rate limiting—per client, counting failed attempts only—with a lockout message that still does not disclose whether an account exists.
- Rate limiting across every API endpoint, tiered by operation cost, answering `429` with `Retry-After`.
- Single-use, expiring tokens for verification, password resets, magic links, and invitations.
- Backend authorization for every data-changing operation; missing permissions return `403`.
- A common protection mechanism for both application routes and API endpoints.
- Webhook signature verification and safe handling of repeated deliveries.
- Soft deletes, data-retention policies, and audit trails for critical administrative actions.

## Implementation order

1. Database, multi-tenancy, and data isolation.
2. Authentication and sessions.
3. RBAC and permissions.
4. Design system and dashboard shell.
5. Billing, plans, and quotas.
6. Super admin panel.
7. Email and background jobs.
8. CMS/blog and SEO.
9. i18n, monitoring, and tests.
10. AI SDK and optional modules: testimonials, feedback, roadmap, wishlist, waitlist, and contact form.

## Documentation

The complete functional and technical specification is available in [docs/specyfikacja.md](docs/specyfikacja.md). It documents flows, business rules, edge cases, and the recommended delivery sequence.

## Development conventions

The project is intended to be friendly to team development and AI assistants:

- predictable module structure, such as `features/`, `components/`, and `lib/`;
- authorization logic and data access kept outside UI components;
- one reference pattern for protected endpoints and tenant-isolated entities;
- centralized definitions of roles, permissions, plans, and design tokens;
- UI and email copy kept in translation files rather than hard-coded in components.

Guidelines for collaborating assistants are available in [CLAUDE.md](CLAUDE.md).

## Deployment

The application is intended to support two deployment targets:

- **Vercel** as the primary deployment target;
- **Node.js standalone**, including Docker-based deployments.

Environment variables will be validated at application startup so missing configuration fails fast with a clear error.

### Required in production: `CRON_SECRET`

Background jobs (emails, retries, the onboarding sequence, data cleanup) are
drained by `GET /api/cron/jobs`, authenticated with `Authorization: Bearer
$CRON_SECRET`. Vercel Cron attaches that header automatically once the variable is
set; on Docker or standalone Node, point any scheduler at the same URL with the
same header.

**If `CRON_SECRET` is unset the endpoint answers 404 and nothing is retried.** The
happy path still delivers, so nothing looks broken — until the first email-provider
outage, which then never recovers. Generate one with `openssl rand -base64 32`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full setup, including the
Vercel Hobby daily-cron limitation.

## License

The license has not been specified yet.
