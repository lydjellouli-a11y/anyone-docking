import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type RosterStudent = {
  id: string;
  matricule: string;
  last_name: string;
  first_name: string;
  group_id: string;
};

const PAGE = 1000; // l'API Supabase renvoie au plus 1000 lignes par requête

/**
 * Étudiants inscrits dans les groupes donnés (ex. une section et ses groupes),
 * triés par nom. Lit par pages de 1000 pour ne rien tronquer.
 * La RLS ne renvoie que ce que l'utilisatrice a le droit de voir.
 */
export async function fetchRoster(
  supabase: SupabaseClient<Database>,
  groupIds: string[],
): Promise<RosterStudent[]> {
  const rows: RosterStudent[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("group_students")
      .select("group_id, student:students(id, matricule, last_name, first_name)")
      .in("group_id", groupIds)
      .order("student_id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      if (r.student) rows.push({ ...r.student, group_id: r.group_id });
    }
    if (!data || data.length < PAGE) break;
  }
  return rows.sort(
    (a, b) => a.last_name.localeCompare(b.last_name, "fr") || a.first_name.localeCompare(b.first_name, "fr"),
  );
}
