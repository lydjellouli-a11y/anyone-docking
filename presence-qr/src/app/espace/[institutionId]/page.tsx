import type { Metadata } from "next";
import Link from "next/link";
import { getInstitutionContext } from "@/lib/institution";
import { formatDateTime } from "@/lib/dates";
import { roleLabel } from "@/lib/roles";
import { SESSION_TYPE_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "Tableau de bord — Présence QR" };

export default async function InstitutionPage({ params }: PageProps<"/espace/[institutionId]">) {
  const { institutionId } = await params;
  const { supabase, user, institution, roles, isAdmin } = await getInstitutionContext(institutionId);

  const { data: assignments } = await supabase
    .from("teaching_assignments")
    .select("id, session_type, module:modules(code, name), group:groups(name, kind)")
    .eq("institution_id", institution.id)
    .eq("teacher_id", user.id)
    .order("created_at");

  const { data: nextSessions } = await supabase
    .from("class_sessions")
    .select("assignment_id, scheduled_at")
    .eq("institution_id", institution.id)
    .eq("status", "planned")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at");
  const nextByAssignment = new Map<string, string>();
  for (const s of nextSessions ?? []) {
    if (!nextByAssignment.has(s.assignment_id)) nextByAssignment.set(s.assignment_id, s.scheduled_at);
  }

  return (
    <main>
      <h1>{institution.name}</h1>
      <p className="muted">Vos rôles : {roles.map(roleLabel).join(", ") || "aucun"}</p>

      <h2>Mes enseignements</h2>
      {assignments && assignments.length > 0 ? (
        <ul className="card-list">
          {assignments.map((a) => {
            const next = nextByAssignment.get(a.id);
            return (
              <li key={a.id} className="card">
                <Link href={`/espace/${institution.id}/enseignements/${a.id}`}>
                  {a.module?.name} — {SESSION_TYPE_LABELS[a.session_type]} — {a.group?.name}
                </Link>
                <div className="muted">
                  {next ? `Prochaine séance : ${formatDateTime(next)}` : "Aucune séance planifiée"}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card">
          <p>Aucun enseignement pour l&apos;instant.</p>
          {isAdmin && (
            <ol>
              <li>
                Créez le semestre et les modules : <Link href={`/espace/${institution.id}/parametres`}>Semestres et modules</Link>
              </li>
              <li>
                Créez les sections et groupes, puis importez les listes :{" "}
                <Link href={`/espace/${institution.id}/groupes`}>Sections et groupes</Link>
              </li>
              <li>
                Ajoutez vos enseignements : <Link href={`/espace/${institution.id}/enseignements`}>Enseignements</Link>
              </li>
            </ol>
          )}
        </div>
      )}
    </main>
  );
}
