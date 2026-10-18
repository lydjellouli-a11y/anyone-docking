"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { emailSchema } from "@/lib/validation/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { FormMessage } from "@/components/FormMessage";

export function ForgotPasswordForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const parsed = emailSchema.safeParse(new FormData(event.currentTarget).get("email"));
    if (!parsed.success) {
      setError("Adresse e-mail invalide.");
      return;
    }

    setPending(true);
    try {
      const { error: authError } = await createClient().auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/compte/nouveau-mot-de-passe`,
      });
      // Même message que l'adresse existe ou non (on ne révèle pas les comptes existants).
      if (authError && authError.code?.startsWith("over_")) {
        setError(authErrorMessage(authError));
        return;
      }
      setSuccess(
        "Si un compte existe pour cette adresse, un e-mail contenant un lien de réinitialisation vient d'être envoyé.",
      );
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
        Adresse e-mail
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <FormMessage error={error} success={success} />
      <button type="submit" disabled={pending}>
        {pending ? "Envoi…" : "Recevoir un lien de réinitialisation"}
      </button>
    </form>
  );
}
