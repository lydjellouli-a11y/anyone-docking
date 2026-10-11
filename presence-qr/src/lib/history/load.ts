import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchRoster } from "@/lib/roster";
import { computeHistory, type History, type HistoryAttendance } from "./core";

export type HistoryMeta = {
  institution: string;
  module: string;
  sessionType: string;
  group: string;
  semester: string;
};

const PAGE = 1000;

/**
 * Historique d'un enseignement, lu avec les droits de l'utilisatrice (RLS) :
 * renvoie null si elle n'a pas accès à cet enseignement.
 */
export async function loadAssignmentHistory(
  supabase: SupabaseClient<Database>,
  institutionId: string,
  assignmentId: string,
): Promise<{ meta: HistoryMeta; history: History } | null> {
  const { data: a } = await supabase
    .from("teaching_assignments")
    .select(
      "id, session_type, group_id, module:modules(name), group:groups(name, semester:semesters(label))",
    )
    .eq("id", assignmentId)
    .eq("institution_id", institutionId)
    .maybeSingle();
  if (!a) return null;
  const { data: institution } = await supabase.from("institutions").select("name").eq("id", institutionId).maybeSingle();

  const { data: children } = await supabase.from("groups").select("id, name").eq("parent_id", a.group_id);
  const groupNames = new Map<string, string>([
    [a.group_id, a.group?.name ?? ""],
    ...(children ?? []).map((c) => [c.id, c.name] as [string, string]),
  ]);
  const roster = await fetchRoster(supabase, [...groupNames.keys()]);
  // Un étudiant peut apparaître deux fois (section + groupe) : on garde une ligne.
  const students = [...new Map(roster.map((s) => [s.id, s])).values()].map((s) => ({
    id: s.id,
    matricule: s.matricule,
    last_name: s.last_name,
    first_name: s.first_name,
    group: groupNames.size > 1 ? (groupNames.get(s.group_id) ?? "") : "",
  }));

  const { data: sessions, error: sErr } = await supabase
    .from("class_sessions")
    .select("id, scheduled_at, room")
    .eq("assignment_id", assignmentId)
    .eq("status", "closed")
    .order("scheduled_at");
  if (sErr) throw sErr;

  const attendance: HistoryAttendance[] = [];
  const ids = (sessions ?? []).map((s) => s.id);
  if (ids.length) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("attendance")
        .select("session_id, student_id, status")
        .in("session_id", ids)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      attendance.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
  }

  return {
    meta: {
      institution: institution?.name ?? "",
      module: a.module?.name ?? "",
      sessionType: a.session_type,
      group: a.group?.name ?? "",
      semester: a.group?.semester?.label ?? "",
    },
    history: computeHistory(sessions ?? [], students, attendance),
  };
}
