import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Collapsible } from "@/components/Collapsible";
import { getInstitutionContext } from "@/lib/institution";
import { SESSION_TYPE_LABELS } from "@/lib/labels";
import { createAssignment, deleteAssignment } from "../actions";

export const metadata: Metadata = { title: "Enseignements — Présence QR" };

export default async function EnseignementsPage({ params }: PageProps<"/espace/[institutionId]/enseignements">) {
  const { institutionId } = await params;
  const { supabase, user, institution, isAdmin } = await getInstitutionContext(institutionId);
  const base = `/espace/${institution.id}/enseignements`;

  // La RLS limite automatiquement : l'admin voit tout, l'enseignant les siens.
  const { data: assignments } = await supabase
    .from("teaching_assignments")
    .select(
      "id, session_type, teacher_id, module:modules(code, name), group:groups(name, kind, semester:semesters(label))",
    )
    .eq("institution_id", institution.id)
    .order("created_at");

  const [{ data: teachers }, { data: modules }, { data: groups }] = isAdmin
    ? await Promise.all([
        supabase
          .from("memberships")
          .select("user_id, profile:profiles(full_name)")
          .eq("institution_id", institution.id)
          .eq("role", "enseignant")
          .eq("status", "active"),
        supabase.from("modules").select("id, code, name").eq("institution_id", institution.id).order("code"),
        supabase
          .from("groups")
          .select("id, name, kind, semester:semesters(label)")
          .eq("institution_id", institution.id)
          .order("name"),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  const teacherName = new Map((teachers ?? []).map((t) => [t.user_id, t.profile?.full_name || "Sans nom"]));

  return (
    <main>
      <h1>Enseignements</h1>
      <p className="muted">
        Un enseignement relie un module à une section (cours) ou à un groupe (TD/TP), pour un enseignant.
      </p>

      {assignments?.length ? (
        <ul className="card-list">
          {assignments.map((a) => (
            <li key={a.id} className="card">
              <Link href={`${base}/${a.id}`}>
                {a.module?.name} — {SESSION_TYPE_LABELS[a.session_type]} — {a.group?.name}
              </Link>
              <div className="muted">
                {a.group?.semester?.label}
                {isAdmin && ` — ${a.teacher_id === user.id ? "vous" : teacherName.get(a.teacher_id) ?? "enseignant"}`}
              </div>
              {isAdmin && (
                <ActionForm
                  action={deleteAssignment.bind(null, a.id)}
                  submitLabel="Supprimer"
                  pendingLabel="…"
                  confirmMessage="Supprimer cet enseignement ?"
                  className="inline-form"
                  buttonClassName="link-button danger"
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Aucun enseignement.</p>
      )}

      {isAdmin &&
        (modules?.length && groups?.length ? (
          <Collapsible summary="Ajouter un enseignement" defaultOpen={!assignments?.length}>
            <ActionForm action={createAssignment.bind(null, institution.id)} submitLabel="Ajouter">
              <label>
                Enseignant
                <select name="teacher_id" defaultValue={user.id} required>
                  {(teachers ?? []).map((t) => (
                    <option key={t.user_id} value={t.user_id}>
                      {t.user_id === user.id ? `${t.profile?.full_name || "Moi"} (vous)` : t.profile?.full_name || "Sans nom"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Module
                <select name="module_id" required>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} — {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Section ou groupe
                <select name="group_id" required>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.kind === "section" ? "Section" : "Groupe"} {g.name} ({g.semester?.label})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select name="session_type" defaultValue="td" required>
                  <option value="cours">Cours (section entière)</option>
                  <option value="td">TD</option>
                  <option value="tp">TP</option>
                </select>
              </label>
            </ActionForm>
          </Collapsible>
        ) : (
          <p>
            Pour ajouter un enseignement, créez d&apos;abord un module (
            <Link href={`/espace/${institution.id}/parametres`}>Semestres et modules</Link>) et une section ou un
            groupe (<Link href={`/espace/${institution.id}/groupes`}>Sections et groupes</Link>).
          </p>
        ))}
    </main>
  );
}
