import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { memoryRateLimitAdapter, postgresRateLimitAdapter } from "@/lib/adapters/rate-limit";
import type { RateLimitAdapter } from "@/lib/adapters/rate-limit";
import { env } from "@/lib/env/server";

/**
 * Test-only rate-limit adapter exerciser (spec 14.1, 22.3).
 *
 * WHY THIS EXISTS: `RATE_LIMIT_PROVIDER` is read once at module load, so it
 * cannot vary per test — the E2E server boots with exactly one provider. Without
 * this route the postgres adapter's atomic upsert, its window reset and its
 * `prune` would have NO coverage at all, since the suite runs on `memory`.
 *
 * So the provider is a REQUEST parameter here, and a spec can drive either
 * implementation through the same assertions. Same shape as /api/dev/jobs: an
 * in-process test seam, 404 in production.
 *
 * This bypasses the tier table on purpose. It tests the STORE — counting, window
 * boundaries, reset, prune — not the policy that decides which rule applies.
 */

const bodySchema = z.object({
  provider: z.enum(["memory", "postgres"]),
  key: z.string().min(1),
  limit: z.number().int().positive(),
  windowMs: z.number().int().positive(),
  /** How many times to `consume`. 0 means peek only. */
  times: z.number().int().min(0).max(50).default(1),
  /** Reset the key before counting, so a rerun starts clean. */
  reset: z.boolean().default(false),
  /** Run `prune()` afterwards and report the count. */
  prune: z.boolean().default(false),
});

function adapterFor(provider: "memory" | "postgres"): RateLimitAdapter {
  return provider === "postgres" ? postgresRateLimitAdapter : memoryRateLimitAdapter;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { provider, key, limit, windowMs, times, reset, prune } = parsed.data;
  const adapter = adapterFor(provider);
  const rule = { limit, windowMs };

  if (reset) await adapter.reset(key);

  // Sequential, not Promise.all: the assertions are about the ORDER of decisions
  // (allowed, allowed, ..., blocked), which a parallel burst would scramble.
  const decisions = [];
  for (let i = 0; i < times; i += 1) {
    decisions.push(await adapter.consume(key, rule));
  }

  const peeked = await adapter.peek(key, rule);
  const pruned = prune ? await adapter.prune() : null;

  return NextResponse.json({ decisions, peeked, pruned });
}
