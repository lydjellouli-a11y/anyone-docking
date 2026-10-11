"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { firstError, loginSchema } from "@/lib/validation/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { FormMessage } from "@/components/FormMessage";

// La connexion se fait depuis le navigateur : Supabase voit ainsi l'adresse
// IP réelle de l'utilisatrice, et ses limites anti-abus s'appliquent par
// personne (et non à l'adresse unique du serveur).
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }

    setPending(true);
    try {
      const { error: authError } = await createClient().auth.signInWithPassword(parsed.data);
      if (authError) {
        setError(authErrorMessage(authError));
        return;
      }
      router.replace("/espace");
      router.refresh();
    } catch {
      setError(authErrorMessage({ status: 0 }));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="form" noValidate>
      <label>
        Adresse e-mail
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Mot de passe
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <FormMessage error={error} />
      <button type="submit" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
