import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**"]),
  ...tseslint.configs.recommended,
  // Turn off ESLint rules that conflict with Prettier (formatting is Prettier's job).
  prettier,
  /**
   * Auth vendor containment (spec 1.2 — backend-independence).
   *
   * `better-auth` may be imported ONLY from `src/auth/**` (the adapter: engine,
   * flows, guards) and `src/main.ts` (the engine-HTTP mount). Feature modules
   * inject `AUTH_ENGINE` or call `/v1/*` — they never touch the SDK. Same deal
   * as web's rule: swapping the auth library means rewriting one directory,
   * and this rule proves beforehand that nothing else would break.
   */
  {
    files: ["src/**/*.ts"],
    ignores: ["src/auth/**", "src/main.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["better-auth", "better-auth/*"],
              message:
                "Import the auth engine (AUTH_ENGINE) or call /v1/* instead — the SDK lives only in src/auth (spec 1.2).",
            },
          ],
        },
      ],
    },
  },
]);
