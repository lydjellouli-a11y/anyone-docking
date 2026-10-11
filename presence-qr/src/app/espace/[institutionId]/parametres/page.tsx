import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Collapsible } from "@/components/Collapsible";
import { getInstitutionContext } from "@/lib/institution";
import { formatDate } from "@/lib/dates";
import { createModule, createSemester, deleteModule, deleteSemester } from "../actions";

export const metadata: Metadata = { title: "Semestres et modules — Présence QR" };

export default async function ParametresPage({ params }: PageProps<"/espace/[institutionId]/parametres">) {
  const { institutionId } = await params;
  const { supabase, institution, isAdmin } = await getInstitutionContext(institutionId);
  if (!isAdmin) notFound();

  const [{ data: semesters }, { data: modules }] = await Promise.all([
    supabase.from("semesters").select("id, label, start_date, end_date").eq("institution_id", institution.id).order("start_date"),
    supabase.from("modules").select("id, code, name").eq("institution_id", institution.id).order("code"),
  ]);

  return (
    <main>
      <h1>Semestres et modules</h1>

      <section>
        <h2>Semestres</h2>
        {semesters?.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Libellé</th>
                <th>Début</th>
                <th>Fin</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {semesters.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td>{formatDate(`${s.start_date}T12:00:00Z`)}</td>
                  <td>{formatDate(`${s.end_date}T12:00:00Z`)}</td>
                  <td>
                    <ActionForm
                      action={deleteSemester.bind(null, s.id)}
                      submitLabel="Supprimer"
                      pendingLabel="…"
                      confirmMessage={`Supprimer le semestre « ${s.label} » ?`}
                      className="inline-form"
                      buttonClassName="link-button danger"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Aucun semestre.</p>
        )}
        <Collapsible summary="Ajouter un semestre" defaultOpen={!semesters?.length}>
          <ActionForm action={createSemester.bind(null, institution.id)} submitLabel="Ajouter le semestre">
            <label>
              Libellé
              <input name="label" required maxLength={100} placeholder="2026-2027 S1" />
            </label>
            <label>
              Date de début
              <input name="start_date" type="date" required />
            </label>
            <label>
              Date de fin
              <input name="end_date" type="date" required />
            </label>
          </ActionForm>
        </Collapsible>
      </section>

      <section>
        <h2>Modules</h2>
        {modules?.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Intitulé</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id}>
                  <td>{m.code}</td>
                  <td>{m.name}</td>
                  <td>
                    <ActionForm
                      action={deleteModule.bind(null, m.id)}
                      submitLabel="Supprimer"
                      pendingLabel="…"
                      confirmMessage={`Supprimer le module « ${m.name} » ?`}
                      className="inline-form"
                      buttonClassName="link-button danger"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Aucun module.</p>
        )}
        <Collapsible summary="Ajouter un module" defaultOpen={!modules?.length}>
          <ActionForm action={createModule.bind(null, institution.id)} submitLabel="Ajouter le module">
            <label>
              Code
              <input name="code" required maxLength={30} placeholder="CYTO" />
            </label>
            <label>
              Intitulé
              <input name="name" required maxLength={200} placeholder="Cytologie" />
            </label>
          </ActionForm>
        </Collapsible>
      </section>
    </main>
  );
}
