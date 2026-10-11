import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { roleLabel } from "@/lib/roles";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";

export const metadata: Metadata = { title: "Mes espaces — Présence QR" };

export default async function EspacePage() {
  const { supabase, user } = await requireUser();

  // La RLS ne renvoie que les appartenances de l'utilisatrice connectée et
  // les établissements dont elle est membre active.
  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("role, status, institution:institutions(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) {
    return (
      <main className="container">
        <p role="alert" className="form-error">
          Impossible de charger vos espaces. Vérifiez votre connexion et rechargez la page.
        </p>
      </main>
    );
  }

  const byInstitution = new Map<string, { name: string; roles: string[] }>();
  for (const m of memberships ?? []) {
    if (!m.institution) continue;
    const entry = byInstitution.get(m.institution.id) ?? { name: m.institution.name, roles: [] };
    entry.roles.push(roleLabel(m.role));
    byInstitution.set(m.institution.id, entry);
  }

  return (
    <main className="container">
      <h1>Mes espaces de travail</h1>
      {byInstitution.size === 0 ? (
        <section>
          <p>
            Bienvenue ! Pour commencer, créez votre espace de travail. Vous en serez
            l&apos;administratrice et l&apos;enseignante ; d&apos;autres collègues pourront
            être ajoutés plus tard.
          </p>
          <CreateWorkspaceForm />
        </section>
      ) : (
        <ul className="card-list">
          {[...byInstitution].map(([id, { name, roles }]) => (
            <li key={id} className="card">
              <Link href={`/espace/${id}`}>{name}</Link>
              <span className="muted"> — {roles.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
