// Calcul de l'historique cumulé d'un enseignement (sans accès réseau :
// fonction pure, testée unitairement).
//
// Règles :
//   * seules les séances CLÔTURÉES comptent (planifiées, ouvertes ou annulées
//     sont ignorées) ;
//   * une case vide (« — ») signifie que l'étudiant n'était pas inscrit à ce
//     moment-là (ajouté au groupe après la séance) : elle n'est pas comptée ;
//   * le SEUIL porte sur les absences NON justifiées (« absent ») ; les
//     absences justifiées (« excusé ») sont comptées à part.

export const ABSENCE_THRESHOLD = 3;

export type HistorySession = { id: string; scheduled_at: string; room: string | null };
export type HistoryStudent = { id: string; matricule: string; last_name: string; first_name: string; group: string };
export type HistoryAttendance = { session_id: string; student_id: string; status: string };

export type StudentHistory = HistoryStudent & {
  cells: (string | null)[]; // statut par séance, dans l'ordre des séances
  present: number;
  absent: number; // non justifiées
  excuse: number;
  counted: number; // séances où l'étudiant avait un statut
  absenceRate: number | null; // (absent + excusé) / counted
  overThreshold: boolean;
};

export type SessionSummary = HistorySession & { present: number; absent: number; excuse: number };

export type History = {
  sessions: SessionSummary[];
  students: StudentHistory[];
  overThresholdCount: number;
  presenceRate: number | null; // sur l'ensemble des cases comptées
};

export function computeHistory(
  sessions: HistorySession[],
  students: HistoryStudent[],
  attendance: HistoryAttendance[],
  threshold = ABSENCE_THRESHOLD,
): History {
  const ordered = [...sessions].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const index = new Map(ordered.map((s, i) => [s.id, i]));
  const byStudent = new Map<string, (string | null)[]>();
  for (const st of students) byStudent.set(st.id, Array(ordered.length).fill(null));
  for (const a of attendance) {
    const i = index.get(a.session_id);
    const row = byStudent.get(a.student_id);
    if (i !== undefined && row) row[i] = a.status === "retard" ? "present" : a.status;
  }

  const summaries: SessionSummary[] = ordered.map((s) => ({ ...s, present: 0, absent: 0, excuse: 0 }));
  let totalCounted = 0;
  let totalPresent = 0;

  const rows: StudentHistory[] = students.map((st) => {
    const cells = byStudent.get(st.id)!;
    let present = 0;
    let absent = 0;
    let excuse = 0;
    cells.forEach((c, i) => {
      if (c === "present") {
        present++;
        summaries[i].present++;
      } else if (c === "absent") {
        absent++;
        summaries[i].absent++;
      } else if (c === "excuse") {
        excuse++;
        summaries[i].excuse++;
      }
    });
    const counted = present + absent + excuse;
    totalCounted += counted;
    totalPresent += present;
    return {
      ...st,
      cells,
      present,
      absent,
      excuse,
      counted,
      absenceRate: counted ? (absent + excuse) / counted : null,
      overThreshold: absent >= threshold,
    };
  });

  rows.sort((a, b) => a.last_name.localeCompare(b.last_name, "fr") || a.first_name.localeCompare(b.first_name, "fr"));

  return {
    sessions: summaries,
    students: rows,
    overThresholdCount: rows.filter((r) => r.overThreshold).length,
    presenceRate: totalCounted ? totalPresent / totalCounted : null,
  };
}

export const CELL_LABELS: Record<string, string> = { present: "P", absent: "A", excuse: "E" };

export function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)} %`;
}
