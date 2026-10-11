import { z } from "zod";

// Mêmes règles que la configuration Supabase Auth (supabase/config.toml) :
// 10 caractères minimum, avec minuscule, majuscule et chiffre.
export const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères.")
  .max(72, "Le mot de passe ne doit pas dépasser 72 caractères.")
  .regex(/[a-z]/, "Le mot de passe doit contenir une lettre minuscule.")
  .regex(/[A-Z]/, "Le mot de passe doit contenir une lettre majuscule.")
  .regex(/[0-9]/, "Le mot de passe doit contenir un chiffre.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Adresse e-mail invalide."));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Mot de passe requis."),
});

export const signupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Indiquez votre nom complet.")
      .max(100, "Nom trop long (100 caractères maximum)."),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["passwordConfirm"],
  });

export const newPasswordSchema = z
  .object({ password: passwordSchema, passwordConfirm: z.string() })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["passwordConfirm"],
  });

export const workspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères.")
    .max(200, "Nom trop long (200 caractères maximum)."),
});

/** Premier message d'erreur lisible d'une validation zod. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides.";
}
