"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { createWorkspace, type ActionState } from "./actions";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createWorkspace, {});
  return (
    <form action={action} className="form">
      <label>
        Nom de l&apos;espace (par exemple votre établissement ou votre département)
        <input name="name" required minLength={2} maxLength={200} placeholder="Université fictive — Biologie" />
      </label>
      <FormMessage error={state.error} />
      <button type="submit" disabled={pending}>
        {pending ? "Création…" : "Créer l'espace de travail"}
      </button>
    </form>
  );
}
