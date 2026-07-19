import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { location } from "@/lib/db/schema";
import { withSystemBypass } from "@/lib/db/system";
import { withTenant } from "@/lib/db/tenant";
import { env } from "@/lib/env/server";
import { sqlStateOf } from "../sql-error";

/**
 * Test-only Row-Level Security probe (US-1.1/AC1). Disabled in production.
 *
 * WHY THIS EXISTS AS AN ENDPOINT. AC1 says isolation must hold "even if the
 * application layer omits the filter". Every real `data.ts` function includes
 * that filter, so nothing in the app can demonstrate the property — a passing
 * test would only prove the filter works. The queries below therefore omit
 * `organizationId` DELIBERATELY. That is the whole point, and it is why they live
 * here and not in a feature module.
 *
 * `mode` selects who asks:
 *   "tenant"  → inside withTenant(organizationId) — expect only that org's rows
 *   "raw"     → no tenant context at all          — expect ZERO rows
 *   "bypass"  → inside withSystemBypass()         — expect every org's rows
 *
 * `action` selects what:
 *   "select"  → the unfiltered read described above
 *   "insert"  → in "tenant" mode, write a row claiming `foreignOrganizationId`;
 *               the WITH CHECK clause must reject it with SQLSTATE 42501
 *
 * The `environment` block is returned on every call and is the most important
 * part of the response. RLS is bypassed unconditionally by a superuser and by a
 * table owner without FORCE, so if the app connected as `postgres` the isolation
 * assertions would pass while proving nothing. The spec asserts on these fields
 * directly — see e2e/langlion-rls.spec.ts.
 */

const LANGLION_TABLES = [
  "location",
  "group_type",
  "group_type_recurrence",
  "class_session",
  "client",
  "athlete",
  "booking",
];

type Body = {
  mode?: "tenant" | "raw" | "bypass";
  action?: "select" | "insert";
  organizationId?: string;
  foreignOrganizationId?: string;
};

/** Who are we connected as, and is RLS actually switched on? */
async function readEnvironment() {
  const role = await db.execute<{
    current_user: string;
    usesuper: boolean;
    rolbypassrls: boolean;
  }>(sql`
    SELECT current_user,
           r.rolsuper AS usesuper,
           r.rolbypassrls
    FROM pg_roles r
    WHERE r.rolname = current_user
  `);

  // `= ANY(${array})` does not work here: the driver binds a JS array as a single
  // parameter, and Postgres rejects it with 42809 rather than expanding it. An
  // explicit IN list of individually-bound values is the portable form.
  const names = sql.join(
    LANGLION_TABLES.map((name) => sql`${name}`),
    sql`, `,
  );
  const tables = await db.execute<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(sql`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname IN (${names})
    ORDER BY relname
  `);

  return { role: Array.from(role)[0] ?? null, tables: Array.from(tables) };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Body;
  const mode = body.mode ?? "raw";
  const action = body.action ?? "select";
  const environment = await readEnvironment();

  try {
    if (action === "insert") {
      if (mode !== "tenant" || !body.organizationId || !body.foreignOrganizationId) {
        return NextResponse.json(
          { error: "insert requires mode=tenant, organizationId and foreignOrganizationId" },
          { status: 400 },
        );
      }
      await withTenant(body.organizationId, async (tx) => {
        await tx.insert(location).values({
          organizationId: body.foreignOrganizationId!,
          name: "rls-probe cross-tenant write",
        });
      });
      // Reaching here means the WITH CHECK clause let a cross-tenant write
      // through, which is a failure the test must see as a failure.
      return NextResponse.json({ ok: true, environment, wrote: true });
    }

    // NOTE: no `.where(eq(location.organizationId, …))` anywhere below. Intentional.
    const rows =
      mode === "tenant"
        ? await withTenant(body.organizationId ?? "", (tx) =>
            tx.select({ id: location.id, organizationId: location.organizationId }).from(location),
          )
        : mode === "bypass"
          ? await withSystemBypass("e2e rls probe", (tx) =>
              tx
                .select({ id: location.id, organizationId: location.organizationId })
                .from(location),
            )
          : await db
              .select({ id: location.id, organizationId: location.organizationId })
              .from(location);

    return NextResponse.json({ ok: true, environment, rows });
  } catch (error) {
    // The SQLSTATE is the assertion target: 42501 for a policy violation, 23P01
    // for an exclusion constraint. Surfaced rather than thrown so the test can
    // distinguish "correctly refused" from "endpoint crashed".
    const sqlState = sqlStateOf(error);
    return NextResponse.json({
      ok: false,
      environment,
      sqlState,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
