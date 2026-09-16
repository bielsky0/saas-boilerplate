/**
 * Auth feature module (spec 2 — authentication).
 *
 * Owns the email/password UI and application flows. The forms call the NestJS
 * API directly from the browser (faza 2.1); the API answers codes, and the
 * components render the single `auth.errors.*` key per outcome. No SDK import
 * in feature/UI code (spec 1.2). Server-side session/authorization helpers
 * live in `src/lib/auth` (which itself now calls Nest — never the database).
 */
export {
  confirmResetWithNest,
  requestResetWithNest,
  safeCallbackUrl,
  signInWithNest,
  signOutFromNest,
  signUpWithNest,
  verifySentUrl,
  type AuthCode,
  type AuthFormState,
  type ForgotFormState,
  type SignUpInput,
} from "./client";
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
