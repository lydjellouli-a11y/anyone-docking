"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { firstError, newPasswordSchema } from "@/lib/validation/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { FormMessage } from "@/components/FormMessage";

export function NewPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const parsed = newPasswordSchema.safeParse({
      password: form.get("password"),
      passwordConfirm: form.get("passwordConfirm"),
    });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }

    setPending(true);
    try {
      const { error: authError } = await createClient().auth.updateUser({
        password: parsed.data.password,
      });
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
        Nouveau mot de passe
        <input name="password" type="password" autoComplete="new-password" required minLength={10} aria-describedby="password-hint" />
      </label>
      <span id="password-hint" className="hint">10 caractères minimum, avec minuscule, majuscule et chiffre.</span>
      <label>
        Confirmer le mot de passe
        <input name="passwordConfirm" type="password" autoComplete="new-password" required />
      </label>
      <FormMessage error={error} />
      <button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </button>
    </form>
  );
}
