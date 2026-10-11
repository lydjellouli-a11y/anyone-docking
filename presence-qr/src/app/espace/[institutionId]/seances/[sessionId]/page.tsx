import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { serverEnv } from "@/lib/server-env";
import { ActionForm } from "@/components/ActionForm";
import { getInstitutionContext } from "@/lib/institution";
import { formatDateTime } from "@/lib/dates";
import { SESSION_STATUS_LABELS, SESSION_TYPE_LABELS } from "@/lib/labels";
import { fetchRoster } from "@/lib/roster";
import { openSession } from "../actions";
import { LiveSession } from "./LiveSession";

export const metadata: Metadata = { title: "Séance — Présence QR" };

export default async function SessionPage({ params }: PageProps<"/espace/[institutionId]/seances/[sessionId]">) {
  const { institutionId, sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();
  const { supabase, user, institution } = await getInstitutionContext(institutionId);

  const { data: session } = await supabase
    .from("class_sessions")
    .select(
      "id, status, scheduled_at, room, opened_at, closed_at, checkin_closes_at, public_code, fallback_code, assignment:teaching_assignments(id, teacher_id, session_type, group_id, module:modules(name), group:groups(name))",
    )
    .eq("id", sessionId)
    .eq("institution_id", institution.id)
    .maybeSingle();
  if (!session || !session.assignment) notFound();

  const isOwner = session.assignment.teacher_id === user.id;
  const { data: children } = await supabase.from("groups").select("id, name").eq("parent_id", session.assignment.group_id);
  const groupNames = new Map<string, string>([
    [session.assignment.group_id, session.assignment.group?.name ?? ""],
    ...(children ?? []).map((c) => [c.id, c.name] as [string, string]),
  ]);
  const roster = await fetchRoster(supabase, [...groupNames.keys()]);
  const { data: attendance } = await supabase
    .from("attendance")
    .select("student_id, status, source, recorded_at, flags")
    .eq("session_id", session.id);

  const siteHost = serverEnv.siteUrl ? new URL(serverEnv.siteUrl).host : ((await headers()).get("host") ?? "");
  const assignmentUrl = `/espace/${institution.id}/enseignements/${session.assignment.id}`;

  return (
    <main>
      <p>
        <Link href={assignmentUrl}>← Séances de cet enseignement</Link>
      </p>
      <h1>
        {session.assignment.module?.name} — {SESSION_TYPE_LABELS[session.assignment.session_type]} —{" "}
        {session.assignment.group?.name}
      </h1>
      <p className="muted">
        {formatDateTime(session.scheduled_at)}
        {session.room ? ` — salle ${session.room}` : ""} — {SESSION_STATUS_LABELS[session.status]}
      </p>

      {session.status === "planned" && isOwner && (
        <div className="card">
          <p>Ouvrir la séance affiche le QR code ; les étudiants ont 15 minutes pour pointer (prolongeable).</p>
          <ActionForm
            action={openSession.bind(null, session.id)}
            submitLabel="Ouvrir la séance et afficher le QR code"
            pendingLabel="Ouverture…"
            className="form"
          />
        </div>
      )}
      {session.status === "cancelled" && <p className="muted">Cette séance a été annulée.</p>}

      {(session.status === "open" || session.status === "closed") && (
        <LiveSession
          sessionId={session.id}
          publicCode={session.public_code}
          status={session.status}
          isOwner={isOwner}
          fallbackCode={session.fallback_code}
          checkinClosesAt={session.checkin_closes_at}
          roster={roster.map((s) => ({
            id: s.id,
            matricule: s.matricule,
            name: `${s.last_name} ${s.first_name}`,
            group: groupNames.size > 1 ? (groupNames.get(s.group_id) ?? "") : "",
          }))}
          initialAttendance={attendance ?? []}
          sheetUrl={`/espace/${institution.id}/seances/${session.id}/feuille`}
          siteHost={siteHost}
        />
      )}
    </main>
  );
}
