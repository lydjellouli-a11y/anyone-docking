import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Collapsible } from "@/components/Collapsible";
import { getInstitutionContext } from "@/lib/institution";
import { createGroup } from "../actions";

export const metadata: Metadata = { title: "Sections et groupes — Présence QR" };

type GroupRow = {
  id: string;
  name: string;
  kind: string;
  level: string | null;
  parent_id: string | null;
  semester_id: string;
  group_students: { count: number }[];
};

export default async function GroupesPage({ params }: PageProps<"/espace/[institutionId]/groupes">) {
  const { institutionId } = await params;
  const { supabase, institution, isAdmin } = await getInstitutionContext(institutionId);
  const base = `/espace/${institution.id}/groupes`;

  const [{ data: semesters }, { data: groupsData }] = await Promise.all([
    supabase.from("semesters").select("id, label").eq("institution_id", institution.id).order("start_date"),
    supabase
      .from("groups")
      .select("id, name, kind, level, parent_id, semester_id, group_students(count)")
      .eq("institution_id", institution.id)
      .order("name"),
  ]);
  const groups = (groupsData ?? []) as GroupRow[];
  const count = (g: GroupRow) => g.group_students[0]?.count ?? 0;
  const childrenOf = (id: string) => groups.filter((g) => g.parent_id === id);
  const sections = groups.filter((g) => g.kind === "section");

  return (
    <main>
      <h1>Sections et groupes</h1>
      <p className="muted">
        Une <strong>section</strong> regroupe des <strong>groupes</strong> de TD. La liste d&apos;une section
        réunit les étudiants de tous ses groupes : importez la liste de chaque groupe.
      </p>

      {(semesters ?? []).map((sem) => {
        const inSemester = groups.filter((g) => g.semester_id === sem.id);
        const topLevel = inSemester.filter((g) => !g.parent_id);
        return (
          <section key={sem.id}>
            <h2>{sem.label}</h2>
            {inSemester.length === 0 ? (
              <p className="muted">Aucune section ni aucun groupe.</p>
            ) : (
              <ul className="card-list">
                {/* Un enseignant de TD peut voir un groupe sans voir sa section. */}
                {[...topLevel, ...inSemester.filter((g) => g.parent_id && !groups.some((p) => p.id === g.parent_id))].map(
                  (g) => {
                    const kids = childrenOf(g.id);
                    const total = count(g) + kids.reduce((n, k) => n + count(k), 0);
                    return (
                      <li key={g.id} className="card">
                        <Link href={`${base}/${g.id}`}>
                          {g.kind === "section" ? "Section" : "Groupe"} : {g.name}
                        </Link>{" "}
                        <span className="muted">
                          {g.level ? `(${g.level}) ` : ""}— {total} étudiant(s)
                        </span>
                        {kids.length > 0 && (
                          <ul>
                            {kids.map((k) => (
                              <li key={k.id}>
                                <Link href={`${base}/${k.id}`}>{k.name}</Link>{" "}
                                <span className="muted">— {count(k)} étudiant(s)</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  },
                )}
              </ul>
            )}
          </section>
        );
      })}

      {isAdmin &&
        (semesters?.length ? (
          <Collapsible summary="Créer une section ou un groupe" defaultOpen={groups.length === 0}>
            <ActionForm action={createGroup.bind(null, institution.id)} submitLabel="Créer">
              <label>
                Semestre
                <select name="semester_id" required>
                  {semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Type</legend>
                <label className="inline">
                  <input type="radio" name="kind" value="section" defaultChecked /> Section (pour les cours)
                </label>
                <label className="inline">
                  <input type="radio" name="kind" value="groupe" /> Groupe (TD / TP)
                </label>
              </fieldset>
              <label>
                Nom
                <input name="name" required maxLength={100} placeholder="L1 Biologie — Section 1, ou G1" />
              </label>
              <label>
                Niveau (facultatif)
                <input name="level" maxLength={50} placeholder="L1, M1…" />
              </label>
              <label>
                Section de rattachement (pour un groupe)
                <select name="parent_id" defaultValue="">
                  <option value="">— Aucune —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({semesters.find((x) => x.id === s.semester_id)?.label})
                    </option>
                  ))}
                </select>
              </label>
            </ActionForm>
          </Collapsible>
        ) : (
          <p>
            Créez d&apos;abord un semestre dans{" "}
            <Link href={`/espace/${institution.id}/parametres`}>Semestres et modules</Link>.
          </p>
        ))}
    </main>
  );
}
