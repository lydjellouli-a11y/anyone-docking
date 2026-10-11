"use client";

import { useActionState } from "react";
import { FormMessage } from "./FormMessage";

export type FormState = { error?: string; success?: string };
type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Formulaire générique relié à une Server Action : affiche l'erreur ou le
 * succès renvoyé, et désactive le bouton pendant l'envoi.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Enregistrement…",
  confirmMessage,
  className = "form",
  buttonClassName,
  children,
}: {
  action: Action;
  submitLabel: string;
  pendingLabel?: string;
  confirmMessage?: string;
  className?: string;
  buttonClassName?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
      <FormMessage error={state.error} success={state.success} />
      <button type="submit" disabled={pending} className={buttonClassName}>
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
