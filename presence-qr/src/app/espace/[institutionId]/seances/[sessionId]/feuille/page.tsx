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

  const { data: children } = await supabase.from("groups").select("id").eq("parent_id", session.assignment.group_id);
  const roster = await fetchRoster(supabase, [session.assignment.group_id, ...(children ?? []).map((c) => c.id)]);

  return (
    <main className="sheet">
      <PrintButton />
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
              <td className="signature" />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">Signature de l&apos;enseignant(e) :</p>
    </main>
  );
}
