import * as z from "zod";

export const SignupFormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, { error: "Display name must be at least 2 characters long." })
    .max(50, { error: "Display name must be at most 50 characters long." }),
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z
    .string()
    .min(8, { error: "Be at least 8 characters long." })
    .regex(/[a-zA-Z]/, { error: "Contain at least one letter." })
    .regex(/[0-9]/, { error: "Contain at least one number." })
    .regex(/[^a-zA-Z0-9]/, { error: "Contain at least one special character." }),
});

export const LoginFormSchema = z.object({
  email: z.email({ error: "Please enter a valid email." }).trim(),
  password: z.string().min(1, { error: "Please enter your password." }),
});

export type FormState =
  | {
      errors?: {
        displayName?: string[];
        email?: string[];
        password?: string[];
        captcha?: string[];
      };
      message?: string;
      success?: string;
    }
  | undefined;