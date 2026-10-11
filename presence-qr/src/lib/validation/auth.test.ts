import { describe, expect, it } from "vitest";
import { loginSchema, passwordSchema, signupSchema, workspaceSchema } from "./auth";

describe("validation des formulaires d'authentification", () => {
  it("accepte un mot de passe conforme", () => {
    expect(passwordSchema.safeParse("Fictif2026Abc").success).toBe(true);
  });

  it.each(["court1A", "toutminuscule123", "TOUTMAJUSCULE123", "SansChiffreIci"])(
    "refuse le mot de passe faible %s",
    (pwd) => {
      expect(passwordSchema.safeParse(pwd).success).toBe(false);
    },
  );

  it("normalise l'e-mail (espaces, majuscules)", () => {
    const r = loginSchema.parse({ email: "  Prof.A@Exemple.TEST ", password: "x" });
    expect(r.email).toBe("prof.a@exemple.test");
  });

  it("refuse une confirmation de mot de passe différente", () => {
    const r = signupSchema.safeParse({
      fullName: "Prof Fictif",
      email: "prof@exemple.test",
      password: "Fictif2026Abc",
      passwordConfirm: "Fictif2026Abd",
    });
    expect(r.success).toBe(false);
  });

  it("refuse un nom d'espace vide", () => {
    expect(workspaceSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});
