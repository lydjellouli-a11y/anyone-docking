import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm } from "@/components/ActionForm";
import { Collapsible } from "@/components/Collapsible";
import { getInstitutionContext } from "@/lib/institution";
import { fetchRoster } from "@/lib/roster";
import { deleteGroup, removeStudentFromGroup } from "../../actions";
import { ImportStudents } from "./ImportStudents";

export const metadata: Metadata = { title: "Liste du groupe — Présence QR" };

export default async function GroupPage({ params }: PageProps<"/espace/[institutionId]/groupes/[groupId]">) {
  const { institutionId, groupId } = await params;
  if (!z.uuid().safeParse(groupId).success) notFound();
  const { supabase, user, institution, isAdmin } = await getInstitutionContext(institutionId);

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, kind, level, parent_id, semester:semesters(label)")
    .eq("id", groupId)
    .eq("institution_id", institution.id)
    .maybeSingle();
  if (!group) notFound();

  const [{ data: children }, { data: parent }, { data: myAssignments }] = await Promise.all([
    supabase.from("groups").select("id, name").eq("parent_id", group.id).order("name"),
    group.parent_id
      ? supabase.from("groups").select("id, name").eq("id", group.parent_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("teaching_assignments")
      .select("id")
      .eq("teacher_id", user.id)
      .in("group_id", [group.id, ...(group.parent_id ? [group.parent_id] : [])]),
  ]);
  const kids = children ?? [];
  const groupNames = new Map([[group.id, group.name], ...kids.map((k) => [k.id, k.name] as [string, string])]);
  const roster = await fetchRoster(supabase, [group.id, ...kids.map((k) => k.id)]);
  const canImport = isAdmin || (myAssignments?.length ?? 0) > 0;
  const base = `/espace/${institution.id}/groupes`;

  return (
    <main>
      <p>
        <Link href={base}>← Sections et groupes</Link>
      </p>
      <h1>
        {group.kind === "section" ? "Section" : "Groupe"} : {group.name}
      </h1>
      <p className="muted">
        {group.semester?.label}
        {group.level ? ` — ${group.level}` : ""}
        {parent ? (
          <>
            {" "}
            — section <Link href={`${base}/${parent.id}`}>{parent.name}</Link>
          </>
        ) : null}
      </p>

      {kids.length > 0 && (
        <p>
          Groupes de la section :{" "}
          {kids.map((k, i) => (
            <span key={k.id}>
              {i > 0 && ", "}
              <Link href={`${base}/${k.id}`}>{k.name}</Link>
            </span>
          ))}
        </p>
      )}

      {canImport && <ImportStudents groupId={group.id} groupName={group.name} />}

      <h2>Liste des étudiants ({roster.length})</h2>
      {roster.length === 0 ? (
        <p className="muted">Aucun étudiant pour l&apos;instant.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Matricule</th>
                <th>Nom</th>
                <th>Prénom</th>
                {kids.length > 0 && <th>Groupe</th>}
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => (
                <tr key={`${s.group_id}-${s.id}`}>
                  <td>{s.matricule}</td>
                  <td>{s.last_name}</td>
                  <td>{s.first_name}</td>
                  {kids.length > 0 && <td>{s.group_id === group.id ? "—" : groupNames.get(s.group_id)}</td>}
                  {isAdmin && (
                    <td>
                      <ActionForm
                        action={removeStudentFromGroup.bind(null, s.group_id, s.id)}
                        submitLabel="Retirer"
                        pendingLabel="…"
                        confirmMessage={`Retirer ${s.last_name} ${s.first_name} de « ${groupNames.get(s.group_id)} » ?`}
                        className="inline-form"
                        buttonClassName="link-button danger"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
        <Collapsible summary={group.kind === "section" ? "Supprimer cette section" : "Supprimer ce groupe"}>
          <p className="muted">
            Possible seulement s&apos;il n&apos;a ni enseignement ni groupe rattaché. Les étudiants restent enregistrés
            dans l&apos;établissement.
          </p>
          <ActionForm
            action={deleteGroup.bind(null, group.id)}
            submitLabel="Supprimer définitivement"
            confirmMessage={`Supprimer « ${group.name} » ?`}
            buttonClassName="danger-button"
          />
        </Collapsible>
      )}
    </main>
  );
}
