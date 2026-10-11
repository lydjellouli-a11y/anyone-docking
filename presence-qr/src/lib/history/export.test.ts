import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { computeHistory } from "./core";
import { exportFileName, historyToCsv, historyToXlsx, safeCell } from "./export";

const meta = { institution: "Université fictive", module: "Ration alimentaire", sessionType: "td", group: "M1 NDH — G1", semester: "S1" };
const history = computeHistory(
  [
    { id: "s1", scheduled_at: "2026-10-12T08:00:00Z", room: "A1" },
    { id: "s2", scheduled_at: "2026-10-19T08:00:00Z", room: null },
    { id: "s3", scheduled_at: "2026-10-26T08:00:00Z", room: null },
  ],
  [
    { id: "a", matricule: "20260001", last_name: "Fictif", first_name: "Amina", group: "" },
    { id: "b", matricule: "20260002", last_name: "=HYPERLINK(\"x\")", first_name: "Bilal", group: "" },
  ],
  [
    { session_id: "s1", student_id: "a", status: "present" },
    { session_id: "s2", student_id: "a", status: "excuse" },
    { session_id: "s3", student_id: "a", status: "present" },
    { session_id: "s1", student_id: "b", status: "absent" },
    { session_id: "s2", student_id: "b", status: "absent" },
    { session_id: "s3", student_id: "b", status: "absent" },
  ],
);

describe("export CSV", () => {
  const csv = historyToCsv(meta, history);

  it("utilise BOM, « ; », CRLF et des dates JJ/MM/AAAA", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(
      "Matricule;Nom;Prénom;12/10/2026;19/10/2026;26/10/2026;Présences;Absences non justifiées;Absences justifiées;Taux d'absence (%);Seuil (3 absences non justifiées)",
    );
    expect(lines.find((l) => l.startsWith("20260001"))).toBe("20260001;Fictif;Amina;P;E;P;2;0;1;33;");
  });

  it("neutralise l'injection de formule et signale le seuil", () => {
    const line = csv.split("\r\n").find((l) => l.includes("20260002"))!;
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(line.endsWith(";A;A;A;0;3;0;100;ATTEINT")).toBe(true);
  });
});

describe("export Excel", () => {
  it("produit un fichier lisible avec les bonnes valeurs et le surlignage", async () => {
    const buffer = await historyToXlsx(meta, history, new Date("2026-10-26T15:30:00Z"));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    const ws = wb.getWorksheet("Assiduité")!;
    expect(ws.getRow(5).getCell(2).value).toBe("26/10/2026 16:30 (heure d'Alger)");
    expect(ws.getRow(8).getCell(4).value).toBe("12/10/2026");
    const rows = [9, 10].map((n) => ws.getRow(n));
    const bilal = rows.find((r) => r.getCell(1).value === "20260002")!;
    const amina = rows.find((r) => r.getCell(1).value === "20260001")!;
    expect(bilal.getCell(2).value).toBe("'=HYPERLINK(\"x\")");
    expect(bilal.getCell(1).fill).toMatchObject({ fgColor: { argb: "FFFFD6D6" } });
    expect(amina.getCell(1).fill).toBeUndefined();
    expect(amina.getCell(10).value).toBe(33); // colonne « Taux d'absence (%) » (nombre)
    expect(wb.getWorksheet("Séances")!.getRow(2).values).toEqual([, "12/10/2026", "09:00", "A1", 1, 1, 0]);
  });
});

describe("utilitaires", () => {
  it.each(["=1+1", "+33", "-2", "@x", "\tx"])("préfixe %s", (v) => expect(safeCell(v).startsWith("'")).toBe(true));
  it("laisse un texte normal intact", () => expect(safeCell("Amina")).toBe("Amina"));
  it("nom de fichier sans accents", () =>
    expect(exportFileName(meta, "xlsx", new Date("2026-10-26T10:00:00Z"))).toBe(
      "assiduite_Ration-alimentaire_td_M1-NDH-G1_2026-10-26.xlsx",
    ));
});
