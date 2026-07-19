import { defineConfig } from "vitest/config";

/**
 * Vitest configuration (langlion Faza 0 — decyzja D1).
 *
 * The repo has two test runners with a hard split, and `include` below is what
 * enforces it: Vitest owns `src/**\/*.test.ts` (pure logic, no database, no
 * build step), Playwright owns `e2e/*.spec.ts` (everything that touches the app
 * or the database, asserted through `/api/dev/*`).
 *
 * `include` is overridden rather than just `exclude`d on purpose. Vitest's
 * default glob is `**\/*.{test,spec}.?(c|m)[jt]s?(x)`, which would swallow the
 * whole Playwright suite in `e2e/` and fail on the first `@playwright/test`
 * import. Narrowing `include` to `.test.ts` under `src/` makes the split a
 * property of the file extension, so a new test lands in the right runner by
 * how it is named — there is no second list to keep in sync.
 *
 * `resolve.tsconfigPaths` reads the `@/*` alias from tsconfig.json, keeping one
 * source of truth for the mapping. Note that unit tests must not reach
 * `@/lib/env/server`: it validates the full server env at import time (t3-env)
 * and would fail outside a configured environment. Keep tested logic free of
 * that import — see `src/features/schedule/recurrence.ts`.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    environment: "node",
  },
});
