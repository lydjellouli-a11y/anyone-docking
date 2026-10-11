import { describe, expect, it } from "vitest";
import { computeHistory, formatPercent } from "./core";

const S = (id: string, d: string) => ({ id, scheduled_at: d, room: null });
const st = (id: string, last: string) => ({ id, matricule: id.toUpperCase(), last_name: last, first_name: "Fictif", group: "G1" });

describe("historique cumulé", () => {
  const sessions = [S("s2", "2026-10-21T09:00:00Z"), S("s1", "2026-10-14T09:00:00Z"), S("s3", "2026-10-28T09:00:00Z"), S("s4", "2026-11-04T09:00:00Z")];
  const students = [st("b", "Bilal"), st("a", "Amina"), st("c", "Chahinez")];
  const att = [
    // Amina : toujours présente
    ...["s1", "s2", "s3", "s4"].map((s) => ({ session_id: s, student_id: "a", status: "present" })),
    // Bilal : 3 absences non justifiées + 1 excusé -> au seuil
    { session_id: "s1", student_id: "b", status: "absent" },
    { session_id: "s2", student_id: "b", status: "absent" },
    { session_id: "s3", student_id: "b", status: "excuse" },
    { session_id: "s4", student_id: "b", status: "absent" },
    // Chahinez : inscrite à partir de s3 ; 2 absences + 2 excusés ailleurs -> sous le seuil
    { session_id: "s3", student_id: "c", status: "absent" },
    { session_id: "s4", student_id: "c", status: "excuse" },
    // présence d'une séance hors liste (non clôturée) : ignorée
    { session_id: "autre", student_id: "c", status: "absent" },
  ];
  const h = computeHistory(sessions, students, att);

  it("ordonne les séances par date et les étudiants par nom", () => {
    expect(h.sessions.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(h.students.map((s) => s.last_name)).toEqual(["Amina", "Bilal", "Chahinez"]);
  });

  it("calcule les totaux par étudiant", () => {
    const bilal = h.students.find((s) => s.id === "b")!;
    expect([bilal.present, bilal.absent, bilal.excuse, bilal.counted]).toEqual([0, 3, 1, 4]);
    expect(bilal.cells).toEqual(["absent", "absent", "excuse", "absent"]);
  });

  it("met en évidence le seuil de 3 absences NON justifiées seulement", () => {
    expect(h.students.find((s) => s.id === "b")!.overThreshold).toBe(true);
    expect(h.students.find((s) => s.id === "c")!.overThreshold).toBe(false);
    expect(h.overThresholdCount).toBe(1);
  });

  it("ne compte pas les séances antérieures à l'inscription", () => {
    const c = h.students.find((s) => s.id === "c")!;
    expect(c.cells).toEqual([null, null, "absent", "excuse"]);
    expect(c.counted).toBe(2);
    expect(c.absenceRate).toBe(1);
  });

  it("résume chaque séance et le taux de présence global", () => {
    expect(h.sessions.map((s) => [s.present, s.absent, s.excuse])).toEqual([
      [1, 1, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 1, 1],
    ]);
    expect(formatPercent(h.presenceRate)).toBe("40 %"); // 4 présences / 10 cases
  });

  it("gère un enseignement sans séance clôturée", () => {
    const empty = computeHistory([], students, []);
    expect(empty.presenceRate).toBeNull();
    expect(empty.students.every((s) => s.absenceRate === null && !s.overThreshold)).toBe(true);
  });
});
