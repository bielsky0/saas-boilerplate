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
   * Super-admin containment (spec 6.3).
   *
   * Two things must not leak out of `src/features/admin`:
   *   - `adminAuthAdapter`: every privileged operation has to be audit-logged,
   *     and the audit write lives in `features/admin/actions.ts`. An import from
   *     anywhere else is an unaudited privileged action by construction.
   *   - `features/admin/data`: it queries business tables WITHOUT a tenant-owner
   *     filter (the §6.2 carve-out). Its access boundary is `requireSuperAdmin()`,
   *     which only its own callers apply — behind any other caller, the same
   *     query is a tenant-isolation breach.
   *
   * The rule is the enforcement, not the file headers that explain it. Note
   * `importNames`: plain `authAdapter` from the same module stays free.
   *
   * Exempt: the admin feature itself, the auth adapter that defines the export,
   * and the `(admin)` route group — the panel's own pages, which apply
   * `requireSuperAdmin()` as their first line and are the intended consumers.
   * Everything else in the app is denied by default.
   *
   * The group is matched as `src/app/**\/(admin)/**` rather than a fixed
   * `src/app/(admin)/**` so it survives a segment being added above it — §16 put
   * the whole page tree under `[locale]`, which silently un-exempted the panel and
   * failed CI until this pattern stopped hard-coding the depth. (A literal
   * `src/app/[locale]/...` would be worse than the depth: `[locale]` is a glob
   * CHARACTER CLASS, so it would match `/l/`, `/o/`, `/c/` … and not the directory
   * actually named `[locale]`.)
   */
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/features/admin/**", "src/lib/adapters/auth/**", "src/app/**/(admin)/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/adapters/auth",
              importNames: ["adminAuthAdapter"],
              message:
                "Super-admin engine calls must go through src/features/admin/actions.ts so they are audit-logged (spec 6.3).",
            },
          ],
          patterns: [
            {
              group: ["@/features/admin/data", "**/features/admin/data"],
              message:
                "features/admin/data queries across tenants; it is only safe behind requireSuperAdmin() (spec 6.2 carve-out).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
