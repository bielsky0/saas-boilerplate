import { z } from "zod";

/**
 * Shared validation schemas (spec 2.1). Imported by BOTH the client forms (for
 * instant feedback) and the server actions (authoritative check), so the
 * password policy — min 8 chars, at least one letter and one digit — cannot be
 * bypassed by posting directly.
 */

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Za-z]/, "Password must include at least one letter.")
  .regex(/\d/, "Password must include at least one number.");

export const emailSchema = z.string().email("Enter a valid email address.");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().max(120).optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export type SignUpValues = z.infer<typeof signUpSchema>;
export type SignInValues = z.infer<typeof signInSchema>;
