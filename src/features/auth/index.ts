/**
 * Auth feature module (spec 2 — authentication).
 *
 * Owns the email/password UI and application flows. It talks to the auth
 * provider ONLY through the adapter in `src/lib/adapters/auth` (via the server
 * actions here) — no SDK import in feature/UI code (spec 1.2). Server-side
 * session/authorization helpers live in `src/lib/auth`.
 */

export {
  signInAction,
  signUpAction,
  signOutAction,
  requestPasswordResetAction,
  resetPasswordAction,
  type FormState,
  type ForgotPasswordState,
  type ResetPasswordState,
} from "./actions";
export {
  emailSchema,
  passwordSchema,
  signInSchema,
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type SignInValues,
  type SignUpValues,
  type ForgotPasswordValues,
  type ResetPasswordValues,
} from "./schema";
export { SignUpForm } from "./components/sign-up-form";
export { SignInForm } from "./components/sign-in-form";
export { SignOutButton } from "./components/sign-out-button";
export { ForgotPasswordForm } from "./components/forgot-password-form";
export { ResetPasswordForm } from "./components/reset-password-form";
