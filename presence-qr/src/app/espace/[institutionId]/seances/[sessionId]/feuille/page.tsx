import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getInstitutionContext } from "@/lib/institution";
import { formatDateTime } from "@/lib/dates";
import { SESSION_TYPE_LABELS } from "@/lib/labels";
import { fetchRoster } from "@/lib/roster";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Feuille d'émargement — Présence QR" };

// Procédure de secours sans réseau : feuille à imprimer à l'avance, signée en
// salle, puis ressaisie (corrections justifiées « Feuille papier »).
export default async function SheetPage({ params }: PageProps<"/espace/[institutionId]/seances/[sessionId]/feuille">) {
  const { institutionId, sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();
  const { supabase, institution } = await getInstitutionContext(institutionId);

  const { data: session } = await supabase
    .from("class_sessions")
    .select("id, scheduled_at, room, assignment:teaching_assignments(session_type, group_id, module:modules(name), group:groups(name))")
    .eq("id", sessionId)
    .eq("institution_id", institution.id)
    .maybeSingle();
  if (!session?.assignment) notFound();

  const { data: children } = await supabase.from("groups").select("id, name").eq("parent_id", session.assignment.group_id);
  const groupNames = new Map<string, string>([
    [session.assignment.group_id, session.assignment.group?.name ?? ""],
    ...(children ?? []).map((c) => [c.id, c.name] as [string, string]),
  ]);
  const fullRoster = await fetchRoster(supabase, [...groupNames.keys()]);
  // Un étudiant inscrit à la fois dans la section et dans un groupe n'apparaît qu'une fois.
  const roster = [...new Map(fullRoster.map((s) => [s.id, s])).values()];
  const showGroup = groupNames.size > 1;

  return (
    <main className="sheet">
      <div className="no-print row-actions left">
        <PrintButton />
        <span className="muted small">{roster.length} étudiant(s)</span>
      </div>
      <h1>Feuille d&apos;émargement</h1>
      <p>
        {institution.name} — {session.assignment.module?.name} ({SESSION_TYPE_LABELS[session.assignment.session_type]}) —{" "}
        {session.assignment.group?.name}
        <br />
        Séance du {formatDateTime(session.scheduled_at)}
        {session.room ? ` — salle ${session.room}` : ""}
      </p>
      <table className="table sheet-table">
        <thead>
          <tr>
            <th>N°</th>
            <th>Matricule</th>
            <th>Nom</th>
            <th>Prénom</th>
            {showGroup && <th>Groupe</th>}
            <th>Signature</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((s, i) => (
            <tr key={s.id}>
              <td>{i + 1}</td>
              <td>{s.matricule}</td>
              <td>{s.last_name}</td>
              <td>{s.first_name}</td>
              {showGroup && <td>{groupNames.get(s.group_id) ?? ""}</td>}
              <td className="signature" />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">Nombre de présents : ________ — Signature de l&apos;enseignant(e) :</p>
    </main>
  );
}
