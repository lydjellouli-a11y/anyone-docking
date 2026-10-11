import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm } from "@/components/ActionForm";
import { Collapsible } from "@/components/Collapsible";
import { getInstitutionContext } from "@/lib/institution";
import { formatDateTime } from "@/lib/dates";
import { SESSION_STATUS_LABELS, SESSION_TYPE_LABELS } from "@/lib/labels";
import { WEEKDAYS } from "@/lib/schedule";
import { cancelSession, planSession, planWeeklySessions } from "../../actions";

export const metadata: Metadata = { title: "Séances — Présence QR" };

export default async function AssignmentPage({
  params,
}: PageProps<"/espace/[institutionId]/enseignements/[assignmentId]">) {
  const { institutionId, assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();
  const { supabase, user, institution } = await getInstitutionContext(institutionId);

  const { data: assignment } = await supabase
    .from("teaching_assignments")
    .select(
      "id, teacher_id, session_type, group_id, module:modules(code, name), group:groups(id, name, kind, semester:semesters(label, start_date, end_date))",
    )
    .eq("id", assignmentId)
    .eq("institution_id", institution.id)
    .maybeSingle();
  if (!assignment) notFound();

  const isOwner = assignment.teacher_id === user.id;
  const { data: sessions } = await supabase
    .from("class_sessions")
    .select("id, scheduled_at, room, status")
    .eq("assignment_id", assignment.id)
    .order("scheduled_at");

  const semester = assignment.group?.semester;
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = semester && semester.start_date > today ? semester.start_date : today;

  return (
    <main>
      <p>
        <Link href={`/espace/${institution.id}/enseignements`}>← Enseignements</Link>
      </p>
      <h1>
        {assignment.module?.name} — {SESSION_TYPE_LABELS[assignment.session_type]}
      </h1>
      <p className="muted">
        {assignment.group?.kind === "section" ? "Section" : "Groupe"}{" "}
        <Link href={`/espace/${institution.id}/groupes/${assignment.group_id}`}>{assignment.group?.name}</Link>
        {semester ? ` — ${semester.label}` : ""}
      </p>

      <h2>Séances</h2>
      {sessions?.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date et heure</th>
                <th>Salle</th>
                <th>État</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className={s.status === "cancelled" ? "muted" : undefined}>
                  <td>{formatDateTime(s.scheduled_at)}</td>
                  <td>{s.room ?? "—"}</td>
                  <td>{SESSION_STATUS_LABELS[s.status]}</td>
                  <td>
                    {isOwner && s.status === "planned" && (
                      <ActionForm
                        action={cancelSession.bind(null, s.id)}
                        submitLabel="Annuler"
                        pendingLabel="…"
                        confirmMessage={`Annuler la séance du ${formatDateTime(s.scheduled_at)} ?`}
                        className="inline-form"
                        buttonClassName="link-button danger"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Aucune séance planifiée.</p>
      )}
      <p className="muted">
        L&apos;ouverture d&apos;une séance avec QR code arrive en phase 5.
      </p>

      {isOwner && (
        <>
          <Collapsible summary="Planifier des séances chaque semaine" defaultOpen={!sessions?.length}>
            <ActionForm
              action={planWeeklySessions.bind(null, institution.id, assignment.id)}
              submitLabel="Planifier les séances"
            >
              <label>
                Jour
                <select name="weekday" defaultValue="1">
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Heure de début (heure d&apos;Alger)
                <input name="time" type="time" required defaultValue="08:00" />
              </label>
              <label>
                Du
                <input name="from" type="date" required defaultValue={defaultFrom} />
              </label>
              <label>
                Au
                <input name="to" type="date" required defaultValue={semester?.end_date} />
              </label>
              <label>
                Salle (facultatif)
                <input name="room" maxLength={50} />
              </label>
            </ActionForm>
          </Collapsible>

          <Collapsible summary="Planifier une séance ponctuelle">
            <ActionForm action={planSession.bind(null, institution.id, assignment.id)} submitLabel="Planifier">
              <label>
                Date
                <input name="date" type="date" required defaultValue={today} />
              </label>
              <label>
                Heure (heure d&apos;Alger)
                <input name="time" type="time" required defaultValue="08:00" />
              </label>
              <label>
                Salle (facultatif)
                <input name="room" maxLength={50} />
              </label>
            </ActionForm>
          </Collapsible>
        </>
      )}
    </main>
  );
}
