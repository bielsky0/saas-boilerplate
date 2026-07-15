import { NextResponse, type NextRequest } from "next/server";

import { authAdapter } from "@/lib/adapters/auth";
import { env } from "@/lib/env/server";

/**
 * Test-only account seeder (spec 14.1). Creates an email/password account
 * through the SAME in-process adapter path the sign-up server action uses, so
 * E2E tests can seed accounts deterministically without driving the full UI.
 * Disabled in production.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { email, password, name } = (await request.json()) as {
    email?: string;
    password?: string;
    name?: string;
  };
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }
  const result = await authAdapter.signUpEmailPassword(
    { email, password, name: name ?? "E2E User" },
    request.headers,
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, code: result.code }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
