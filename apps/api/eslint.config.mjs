import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**"]),
  ...tseslint.configs.recommended,
  // Turn off ESLint rules that conflict with Prettier (formatting is Prettier's job).
  prettier,
]);
