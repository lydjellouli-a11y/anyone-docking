"use client";

import { useActionState } from "react";
import type { CheckinState } from "./actions";

type Action = (state: CheckinState, formData: FormData) => Promise<CheckinState>;

// Formulaire très léger (réseau mobile faible). En cas de coupure réseau,
// un message clair indique que la présence n'est PAS enregistrée.
export function CheckinForm({ action, withCode = false, hint }: { action: Action; withCode?: boolean; hint?: string }) {
  const [state, formAction, pending] = useActionState<CheckinState, FormData>(async (prev, fd) => {
    try {
      return await action(prev, fd);
    } catch {
      return {
        ok: false,
        message: "Réseau indisponible : votre présence n'est PAS enregistrée. Vérifiez votre connexion et réessayez.",
      };
    }
  }, {});

  if (state.ok) {
    return (
      <p role="status" className="checkin-result ok">
        ✅ {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="form">
      {withCode && (
        <label>
          Code de la séance (6 chiffres, affiché au tableau)
          <input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="off" />
        </label>
      )}
      <label>
        Votre matricule
        <input
          name="matricule"
          required
          maxLength={40}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
        />
      </label>
      {state.message && (
        <p role="alert" className="checkin-result error">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Envoi…" : "Valider ma présence"}
      </button>
      {hint && <p className="muted small">{hint}</p>}
    </form>
  );
}
