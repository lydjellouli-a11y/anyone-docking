import "server-only";
import ExcelJS from "exceljs";
import { decodeText, parseCsv } from "./csv";
import { rowsToStudents, type StudentListResult } from "./student-list";

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 Mo

/** Lit un fichier .xlsx ou .csv et renvoie la liste d'étudiants validée. */
export async function parseStudentFile(fileName: string, bytes: Uint8Array): Promise<StudentListResult> {
  const name = fileName.toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return rowsToStudents(parseCsv(decodeText(bytes)));
  }

  if (name.endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    } catch {
      return { students: [], errors: [{ line: null, message: "Fichier Excel illisible ou endommagé." }] };
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { students: [], errors: [{ line: null, message: "Le fichier Excel ne contient aucune feuille." }] };
    }
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellText(cell);
      });
      rows[rowNumber - 1] = cells;
    });
    // Lignes absentes (entièrement vides dans Excel) → tableaux vides.
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    return rowsToStudents(rows);
  }

  if (name.endsWith(".xls")) {
    return {
      students: [],
      errors: [
        {
          line: null,
          message: "L'ancien format .xls n'est pas pris en charge : dans Excel, « Enregistrer sous » au format .xlsx ou .csv.",
        },
      ],
    };
  }

  return { students: [], errors: [{ line: null, message: "Format non pris en charge : utilisez un fichier .xlsx ou .csv." }] };
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  // Matricule saisi comme nombre : pas de notation scientifique ni de « .0 ».
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (typeof v === "string") return v;
  if (typeof v === "object" && "result" in v) return v.result == null ? "" : String(v.result);
  return cell.text ?? "";
}
