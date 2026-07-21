## Rate limiting in production

`RATE_LIMIT_PROVIDER=memory` is the default because the adapter factory runs at
module load and a default that can throw breaks `next build` for everyone. It is
correct for a single container and for CI. **It is not correct for a multi-
instance deploy**, where each instance keeps its own Map and the effective limit
becomes N × the configured one. Set `RATE_LIMIT_PROVIDER=postgres` there: one
shared counter, one atomic upsert, and the database's clock as the single source
of truth (which is why every timestamp in that adapter is computed with `now()`
rather than passed in from Node).

Expired counters are reclaimed by the `ratelimit.prune` job, enqueued from
`/api/cron/jobs` with an **hourly** dedupe key rather than the daily one
`job.prune` and `storage.purge` use — rate-limit rows are one per client per
bucket and expire in minutes, so a daily sweep would carry a full day of dead
rows in a table the request path writes to constantly. On Vercel Hobby (daily
cron only) it degrades to one prune per run. Skipping it entirely costs disk, not
correctness: an expired row is reset by the next `consume` rather than read.

**A deployment with no reverse proxy in front of it gets ONE bucket for the
entire internet.** `clientIp()` has no socket address to fall back on (`NextRequest.ip`
was removed in Next 15), so with no `X-Forwarded-For` every anonymous request
keys to `"unknown"`. That only ever over-restricts, never under-restricts, but it
means one abusive client can exhaust the anonymous allowance for everyone.
Authenticated traffic is unaffected — it keys on the session.

## Common commands

| Command                        | Purpose                                  |
| ------------------------------ | ---------------------------------------- |
| `pnpm dev`                     | Run the app locally                      |
| `pnpm build` / `pnpm start`    | Production build / serve                 |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit`                  |
| `pnpm test`                    | Vitest unit tests (pure logic, no DB)    |
| `pnpm test:e2e`                | Playwright E2E (auth flows)              |
| `pnpm format`                  | Prettier write                           |
| `pnpm db:up` / `pnpm db:down`  | Start / stop local Postgres (Docker)     |
| `pnpm db:generate`             | Generate a migration from schema changes |
| `pnpm db:migrate`              | Apply pending migrations                 |
| `pnpm db:studio`               | Open Drizzle Studio                      |

## Local setup

1. Create `.env` (it is gitignored). The database block needs **two** URLs — see
   "Two database URLs (RLS)" below — plus a real `BETTER_AUTH_SECRET`:

   ```
   DATABASE_URL=postgresql://saas_school:saas_school@localhost:5433/saas_boilerplate
   DATABASE_MIGRATION_URL=postgresql://postgres:postgres@localhost:5433/saas_boilerplate
   BETTER_AUTH_SECRET=...            # openssl rand -base64 32
   BETTER_AUTH_URL=http://localhost:3000
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   EMAIL_PROVIDER=log
   S3_ENDPOINT=http://localhost:9100
   S3_REGION=us-east-1
   S3_BUCKET=saas-boilerplate
   S3_ACCESS_KEY_ID=minioadmin
   S3_SECRET_ACCESS_KEY=minioadmin
   S3_FORCE_PATH_STYLE=true
   ```

   Port **5433**, not the default 5432: `docker-compose.yml` namespaces the host
   port and container name to this project so it can run next to an upstream
   saas-boilerplate checkout.

2. `pnpm install`
3. `pnpm db:up` then `pnpm db:migrate`
4. `pnpm dev` → http://localhost:3000

### Two database URLs (RLS)

The app and the migrations connect as **different Postgres roles**, and this is
load-bearing rather than tidiness:

| Variable                 | Role          | Used by             | Properties                                       |
| ------------------------ | ------------- | ------------------- | ------------------------------------------------ |
| `DATABASE_URL`           | `saas_school` | the running app     | NOSUPERUSER, NOBYPASSRLS, owns nothing, DML only |
| `DATABASE_MIGRATION_URL` | `postgres`    | drizzle-kit, studio | schema owner, runs DDL, implicit BYPASSRLS       |

Row-Level Security is bypassed outright by a superuser, and by a table's owner
unless the table also carries `FORCE ROW LEVEL SECURITY`. Connecting the app as
`postgres` — which is both — would leave every policy in the schema decorative
while looking perfectly configured. That is the failure mode US-1.1/AC1 exists to
catch, so `e2e/langlion-rls.spec.ts` asserts the connected role is genuinely
neither superuser nor BYPASSRLS. If that assertion fails, the isolation tests
around it are not testing anything.

`DATABASE_MIGRATION_URL` is deliberately **not** in `src/lib/env/server.ts`: the
running app should have no way to read the owner's credentials. `drizzle.config.ts`
reads it from `process.env` directly and throws if it is absent — a silent
fallback to `DATABASE_URL` would run DDL as the unprivileged role and surface as
"permission denied for schema public", which says nothing about the real cause.

Two operational consequences:

- **`pnpm db:studio` must be pointed at the migration URL.** On the app role it
  shows zero rows in every RLS-covered table, which looks like data loss.
- **`btree_gist`** (required by the `EXCLUDE` constraints in §5.1/§5.3) is not a
  _trusted_ extension in PG16, so creating it needs superuser. On managed hosting
  (Supabase/Neon/RDS) a DBA enables it out of band.

The `saas_school` role is created by `docker/postgres-init/01-app-role.sql`, which
the Postgres image runs **only when initialising an empty data directory**. A
volume created before that file existed will not have the role, and the grant
migration then aborts with a message naming the fix. Recreate the volume:

```
docker compose down -v && pnpm db:up && pnpm db:migrate
```

or, to keep existing local data, create the role by hand:

```
docker exec saas_school_postgres psql -U postgres -d saas_boilerplate \
  -c "CREATE ROLE saas_school LOGIN PASSWORD 'saas_school' NOSUPERUSER NOBYPASSRLS;" \
  -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
```

