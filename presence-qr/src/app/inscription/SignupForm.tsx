"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { firstError, signupSchema } from "@/lib/validation/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { FormMessage } from "@/components/FormMessage";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const form = new FormData(event.currentTarget);
    const parsed = signupSchema.safeParse({
      fullName: form.get("fullName"),
      email: form.get("email"),
      password: form.get("password"),
      passwordConfirm: form.get("passwordConfirm"),
    });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }

    setPending(true);
    try {
      const { data, error: authError } = await createClient().auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          // Seul le nom est conservé dans le profil (aucune autre donnée personnelle).
          data: { full_name: parsed.data.fullName },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/espace`,
        },
      });
      if (authError) {
        setError(authErrorMessage(authError));
        return;
      }
      if (data.session) {
        // Confirmation d'e-mail désactivée (environnement local) : connecté directement.
        router.replace("/espace");
        router.refresh();
      } else {
        setSuccess(
          "Compte créé. Un e-mail de confirmation vient de vous être envoyé : cliquez sur le lien qu'il contient pour activer votre compte.",
        );
        event.currentTarget?.reset();
      }
    } catch {
      setError(authErrorMessage({ status: 0 }));
    } finally {
      setPending(false);
    }
  }

  // method="post" : si la page n'est pas encore chargée (réseau lent), un envoi
  // « classique » du formulaire ne met jamais le mot de passe dans l'adresse.
  return (
    <form onSubmit={onSubmit} className="form" method="post" noValidate>
      <label>
        Nom complet
        <input name="fullName" autoComplete="name" required maxLength={100} />
      </label>
      <label>
        Adresse e-mail
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Mot de passe
        <input name="password" type="password" autoComplete="new-password" required minLength={10} aria-describedby="password-hint" />
      </label>
      <span id="password-hint" className="hint">10 caractères minimum, avec minuscule, majuscule et chiffre.</span>
      <label>
        Confirmer le mot de passe
        <input name="passwordConfirm" type="password" autoComplete="new-password" required />
      </label>
      <FormMessage error={error} success={success} />
      <button type="submit" disabled={pending}>
        {pending ? "Création…" : "Créer mon compte"}
      </button>
    </form>
  );
}
