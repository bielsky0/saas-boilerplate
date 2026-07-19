import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { file, invitation, location, membership, notification, user } from "@/lib/db/schema";
import { withSystemBypass } from "@/lib/db/system";
import { withOwner, withTenant, type Owner } from "@/lib/db/tenant";
import { getOrgBySlug, getPersonalAccountByUserId } from "@/features/organizations/data";
import { env } from "@/lib/env/server";
import { sqlStateOf } from "../sql-error";

/**
 * Test-only Row-Level Security probe (US-1.1/AC1). Disabled in production.
 *
 * WHY THIS EXISTS AS AN ENDPOINT. AC1 says isolation must hold "even if the
 * application layer omits the filter". Every real `data.ts` function includes
 * that filter, so nothing in the app can demonstrate the property — a passing
 * test would only prove the filter works. The queries below therefore omit the
 * owner predicate DELIBERATELY. That is the whole point, and it is why they live
 * here and not in a feature module.
 *
 * `mode` selects who asks:
 *   "tenant"  → inside withTenant(organizationId) — expect only that org's rows
 *   "owner"   → inside withOwner(owner)           — either owner shape (F1a)
 *   "raw"     → no owner context at all           — expect ZERO rows
 *   "bypass"  → inside withSystemBypass()         — expect every owner's rows
 *
 * `action` selects what:
 *   "select"  → the unfiltered read described above
 *   "insert"  → write a row claiming `rowOwner` while acting as `owner`. When the
 *               two differ, WITH CHECK must reject it with SQLSTATE 42501. When
 *               they match it is the POSITIVE CONTROL — without which every
 *               refusal test would pass equally well against a policy that
 *               refuses everything — and doubles as the seeder for the
 *               account-owned rows the read tests need.
 *
 * The `environment` block is returned on every call and is the most important
 * part of the response. RLS is bypassed unconditionally by a superuser and by a
 * table owner without FORCE, so if the app connected as `postgres` the isolation
 * assertions would pass while proving nothing. `excluded` is asserted too, and
 * NEGATIVELY: those four tables must NOT have RLS, because enabling it on
 * `notification_preference` (keyed on the user, not an owner) would silently
 * stop in-app suppression from working. See that table's schema header.
 */

/** Tables that MUST have `relrowsecurity` and `relforcerowsecurity`. */
const RLS_TABLES = [
  // langlion core (F0)
  "location",
  "group_type",
  "group_type_recurrence",
  "class_session",
  "client",
  "athlete",
  "booking",
  // boilerplate tenant tables (F1a)
  "membership",
  "invitation",
  "file",
  "notification",
];

/** Tables that must NOT have RLS — each for a reason recorded in its own header. */
const EXCLUDED_TABLES = [
  "organization",
  "personal_account",
  "notification_preference",
  "audit_log",
];

/** The tables the probe can read without an owner filter. */
const PROBE_TABLES = {
  location: { table: location, hasAccount: false },
  membership: { table: membership, hasAccount: false },
  invitation: { table: invitation, hasAccount: false },
  file: { table: file, hasAccount: true },
  notification: { table: notification, hasAccount: true },
} as const;

type ProbeTable = keyof typeof PROBE_TABLES;

/** An owner named the way a test can name one, rather than by raw id. */
type OwnerRef = { orgSlug: string } | { userEmail: string };

type Body = {
  mode?: "tenant" | "owner" | "raw" | "bypass";
  action?: "select" | "insert";
  table?: ProbeTable;
  /** mode=tenant (the F0 shape — kept so langlion-rls.spec.ts is untouched). */
  organizationId?: string;
  foreignOrganizationId?: string;
  /** mode=owner / action=insert (F1a). */
  owner?: OwnerRef;
  rowOwner?: OwnerRef;
  /** action=insert on `notification`, which needs a recipient. */
  userEmail?: string;
};

async function resolveOwner(ref: OwnerRef): Promise<Owner | null> {
  if ("orgSlug" in ref) {
    const org = await getOrgBySlug(ref.orgSlug);
    return org ? { kind: "organization", organizationId: org.id } : null;
  }
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, ref.userEmail))
    .limit(1);
  if (!row) return null;
  const account = await getPersonalAccountByUserId(row.id);
  return account ? { kind: "personal", accountId: account.id } : null;
}

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
  const inList = (names: string[]) =>
    sql.join(
      names.map((name) => sql`${name}`),
      sql`, `,
    );

  const read = (names: string[]) =>
    db.execute<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(sql`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname IN (${inList(names)})
      ORDER BY relname
    `);

  const [tables, excluded] = await Promise.all([read(RLS_TABLES), read(EXCLUDED_TABLES)]);

  return {
    role: Array.from(role)[0] ?? null,
    tables: Array.from(tables),
    excluded: Array.from(excluded),
  };
}

/**
 * Select id + both owner columns without any owner predicate.
 *
 * `accountId` is reported as null for the org-only tables so the spec can assert
 * on one row shape regardless of which table it asked about.
 */
function unfilteredSelect(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db,
  name: ProbeTable,
) {
  const entry = PROBE_TABLES[name];
  return entry.hasAccount
    ? tx
        .select({
          id: entry.table.id,
          organizationId: entry.table.organizationId,
          accountId: (entry.table as typeof file).accountId,
        })
        .from(entry.table)
    : tx
        .select({
          id: entry.table.id,
          organizationId: entry.table.organizationId,
          accountId: sql<string | null>`NULL`,
        })
        .from(entry.table);
}

function ownerColumns(owner: Owner): { organizationId?: string; accountId?: string } {
  return owner.kind === "organization"
    ? { organizationId: owner.organizationId }
    : { accountId: owner.accountId };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Body;
  const mode = body.mode ?? "raw";
  const action = body.action ?? "select";
  const table: ProbeTable = body.table ?? "location";
  const environment = await readEnvironment();

  try {
    if (action === "insert") {
      // --- F0 shape: cross-tenant write to `location` in tenant mode ----------
      if (mode === "tenant") {
        if (!body.organizationId || !body.foreignOrganizationId) {
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

      // --- F1a shape: act as `owner`, write a row claiming `rowOwner` ---------
      if (mode !== "owner" || !body.owner || !body.rowOwner) {
        return NextResponse.json(
          { error: "insert requires mode=owner with owner and rowOwner (or the mode=tenant form)" },
          { status: 400 },
        );
      }
      const acting = await resolveOwner(body.owner);
      const claimed = await resolveOwner(body.rowOwner);
      if (!acting || !claimed) {
        return NextResponse.json({ error: "owner or rowOwner did not resolve" }, { status: 400 });
      }

      await withOwner(acting, async (tx) => {
        if (table === "notification") {
          if (!body.userEmail) {
            throw new Error("notification insert requires userEmail (the recipient)");
          }
          const [recipient] = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, body.userEmail))
            .limit(1);
          if (!recipient) throw new Error(`user ${body.userEmail} not found`);
          await tx.insert(notification).values({
            userId: recipient.id,
            ...ownerColumns(claimed),
            type: "member.invited",
            params: {},
          });
          return;
        }
        // `file` is the default insert target: it is the only XOR table with no
        // required FK to a user, so a test can create an account-owned row
        // without seeding a recipient first.
        await tx.insert(file).values({
          ...ownerColumns(claimed),
          key: `rls-probe/${crypto.randomUUID()}`,
          originalName: "rls-probe.txt",
          contentType: "text/plain",
          size: 1,
          visibility: "private",
          status: "ready",
        });
      });

      return NextResponse.json({ ok: true, environment, wrote: true });
    }

    // NOTE: no owner predicate anywhere below. Intentional — see the header.
    let rows;
    if (mode === "tenant") {
      rows = await withTenant(body.organizationId ?? "", (tx) => unfilteredSelect(tx, table));
    } else if (mode === "owner") {
      if (!body.owner) {
        return NextResponse.json({ error: "mode=owner requires owner" }, { status: 400 });
      }
      const acting = await resolveOwner(body.owner);
      if (!acting) return NextResponse.json({ error: "owner did not resolve" }, { status: 400 });
      rows = await withOwner(acting, (tx) => unfilteredSelect(tx, table));
    } else if (mode === "bypass") {
      rows = await withSystemBypass("e2e rls probe", (tx) => unfilteredSelect(tx, table));
    } else {
      rows = await unfilteredSelect(db, table);
    }

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
