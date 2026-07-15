/**
 * Auth feature module (spec 2 — authentication).
 *
 * Owns the email/password UI and application flows. It talks to the auth
 * provider ONLY through the adapter in `src/lib/adapters/auth` (via the server
 * actions here) — no SDK import in feature/UI code (spec 1.2). Server-side
 * session/authorization helpers live in `src/lib/auth`.
 */

export { signInAction, signUpAction, signOutAction, type FormState } from "./actions";
export {
  emailSchema,
  passwordSchema,
  signInSchema,
  signUpSchema,
  type SignInValues,
  type SignUpValues,
} from "./schema";
export { SignUpForm } from "./components/sign-up-form";
export { SignInForm } from "./components/sign-in-form";
export { SignOutButton } from "./components/sign-out-button";
