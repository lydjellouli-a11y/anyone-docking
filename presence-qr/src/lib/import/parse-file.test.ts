import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("server-only", () => ({}));
const { parseStudentFile } = await import("./parse-file");

async function xlsx(rows: unknown[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Liste");
  rows.forEach((r) => ws.addRow(r));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("lecture de fichiers .xlsx", () => {
  it("lit un fichier Excel avec matricules numériques et ligne de titre", async () => {
    const bytes = await xlsx([
      ["Liste fictive L1 G1"],
      [],
      ["Matricule", "Nom", "Prénom"],
      [202612345678, "Fictif", "Alpha"],
      ["20260002", "Fictif", "Beta"],
    ]);
    const r = await parseStudentFile("liste.xlsx", bytes);
    expect(r.errors).toEqual([]);
    expect(r.students).toEqual([
      { line: 4, matricule: "202612345678", nom: "Fictif", prenom: "Alpha" },
      { line: 5, matricule: "20260002", nom: "Fictif", prenom: "Beta" },
    ]);
  });

  it("refuse un fichier .xlsx endommagé", async () => {
    const r = await parseStudentFile("faux.xlsx", new TextEncoder().encode("pas un fichier excel"));
    expect(r.errors[0].message).toContain("illisible");
  });

  it("explique comment convertir un ancien .xls", async () => {
    const r = await parseStudentFile("ancien.xls", new Uint8Array([1, 2, 3]));
    expect(r.errors[0].message).toContain(".xlsx");
  });
});
