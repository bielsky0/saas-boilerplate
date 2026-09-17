import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Turn off ESLint rules that conflict with Prettier (formatting is Prettier's job).
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  /**
   * Email templates are not web pages (spec 10.2).
   *
   * They render to a standalone HTML document delivered to a mail client, so they
   * legitimately own `<html>`/`<head>`. `next/head` is a router concept and does
   * not exist here; the rule's advice is simply inapplicable rather than ignored.
   */
  {
    files: ["src/lib/adapters/email/templates/**/*.tsx"],
    rules: {
      "@next/next/no-head-element": "off",
    },
  },
  /**
   * Structured logging is the only logging (spec 15.3).
   *
   * `console.*` and `src/lib/logger.ts` produce the same bytes under
   * LOG_FORMAT=pretty, which is exactly why this rule has to exist: nothing about
   * a stray `console.log` LOOKS wrong in a dev terminal. It only fails in
   * production, where it lands as an unindexed line with no requestId, no job id,
   * and no level for a collector to filter on — invisible precisely when it is
   * the line you went looking for.
   *
   * Two exemptions, both of which ARE the product rather than an oversight:
   *   - `src/lib/logger.ts` — the one module allowed to reach the console.
   *   - `src/lib/adapters/email/log.ts` — EMAIL_PROVIDER=log's dev outbox. Its
   *     console output is the feature (it is how you read a verification link in
   *     `pnpm dev`), not a diagnostic.
   */
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/logger.ts", "src/lib/adapters/email/log.ts"],
    rules: {
      "no-console": "error",
    },
  },
  /**
   * Playwright fixtures are not React (spec 14.1).
   *
   * A Playwright fixture is declared as `async ({ deps }, use) => { await use(x) }`
   * — and `react-hooks/rules-of-hooks` matches that call by NAME alone, deciding
   * `use` is React 19's `use()` hook being called outside a component. It is a
   * false positive on a file the React runtime never sees: nothing under e2e/ is
   * bundled, rendered, or imported by the app.
   *
   * Scoped to the fixture files rather than all of e2e/, so the rule keeps working
   * anywhere it could still mean something.
   */
  {
    files: ["e2e/*-fixtures.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  /**
   * Auth vendor containment (spec 1.2 — backend-independence).
   *
   * `better-auth` (SDK, plugins, cookie helpers) may be imported ONLY from
   * `src/lib/adapters/auth/**` — the one directory that implements the
   * contract. Everything else reads the session token through `@repo/contracts`
   * (cookie names) or calls the engine through the adapter. This is what makes
   * the backend swappable: dropping the vendor means deleting one directory,
   * and this rule proves beforehand that nothing else would break.
   *
   * Deliberately SEPARATE from the super-admin block above: that one guards a
   * privilege boundary, this one guards a vendor boundary. They fail for
   * different reasons and must be fixable independently.
   *
   * Exempt: the adapter itself, plus the MCP/OAuth routes — they consume the
   * engine's OAuth plugin directly and move to Nest with etap 2.7, which owns
   * removing them from this list.
   */
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/adapters/auth/**", "src/app/api/mcp/**", "src/app/.well-known/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["better-auth", "better-auth/*"],
              message:
                "Import the auth contract (@/lib/adapters/auth or @repo/contracts) instead — the SDK lives only in src/lib/adapters/auth (spec 1.2).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
