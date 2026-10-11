"use client";

import { useState } from "react";

/**
 * Bloc repliable (<details>) dont l'état ouvert/fermé appartient à
 * l'utilisatrice : `defaultOpen` ne compte qu'à l'affichage initial, et un
 * rafraîchissement des données (après un ajout) ne le referme pas.
 */
export function Collapsible({
  summary,
  defaultOpen = false,
  className = "card",
  children,
}: {
  summary: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className={className} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
