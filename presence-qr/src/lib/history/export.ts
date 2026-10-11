// Génération des fichiers d'export (CSV et Excel) de l'historique.
import ExcelJS from "exceljs";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";
import { SESSION_TYPE_LABELS } from "@/lib/labels";
import { ABSENCE_THRESHOLD, CELL_LABELS, type History } from "./core";
import type { HistoryMeta } from "./load";

/**
 * Neutralise l'« injection de formule » : une cellule commençant par
 * = + - @ (ou tabulation / retour) serait interprétée comme une formule par
 * Excel à l'ouverture d'un CSV. On la préfixe d'une apostrophe.
 */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvField(value: string): string {
  const v = safeCell(value);
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function rate(r: number | null): string {
  return r === null ? "" : `${Math.round(r * 100)}`;
}

function headers(history: History, withGroup: boolean): string[] {
  return [
    "Matricule",
    "Nom",
    "Prénom",
    ...(withGroup ? ["Groupe"] : []),
    ...history.sessions.map((s) => formatDate(s.scheduled_at)),
    "Présences",
    "Absences non justifiées",
    "Absences justifiées",
    "Taux d'absence (%)",
    `Seuil (${ABSENCE_THRESHOLD} absences non justifiées)`,
  ];
}

function row(history: History, s: History["students"][number], withGroup: boolean): (string | number)[] {
  return [
    s.matricule,
    s.last_name,
    s.first_name,
    ...(withGroup ? [s.group] : []),
    ...s.cells.map((c) => (c ? CELL_LABELS[c] ?? c : "")),
    s.present,
    s.absent,
    s.excuse,
    rate(s.absenceRate),
    s.overThreshold ? "ATTEINT" : "",
  ];
}

/** CSV « Excel français » : séparateur « ; », UTF-8 avec BOM, fins de ligne CRLF. */
export function historyToCsv(meta: HistoryMeta, history: History): string {
  const withGroup = history.students.some((s) => s.group);
  const lines = [
    headers(history, withGroup),
    ...history.students.map((s) => row(history, s, withGroup).map(String)),
  ].map((cells) => cells.map(csvField).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

const RED_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFD6D6" } };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F3EE" } };

export async function historyToXlsx(meta: HistoryMeta, history: History, exportedAt = new Date()): Promise<Buffer> {
  const withGroup = history.students.some((s) => s.group);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Présence QR";

  // --- Feuille 1 : tableau cumulé
  const ws = wb.addWorksheet("Assiduité", { views: [{ state: "frozen", xSplit: 3, ySplit: 8 }] });
  const info: [string, string][] = [
    ["Établissement", meta.institution],
    ["Module", `${meta.module} — ${SESSION_TYPE_LABELS[meta.sessionType] ?? meta.sessionType}`],
    ["Section / groupe", meta.group],
    ["Semestre", meta.semester],
    ["Exporté le", `${formatDateTime(exportedAt)} (heure d'Alger)`],
    ["Légende", `P = présent, A = absent (non justifié), E = excusé, vide = non inscrit. Seuil : ${ABSENCE_THRESHOLD} absences non justifiées.`],
  ];
  info.forEach(([k, v]) => {
    const r = ws.addRow([k, safeCell(v)]);
    r.getCell(1).font = { bold: true };
  });
  ws.addRow([]);
  const header = ws.addRow(headers(history, withGroup));
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  });
  for (const s of history.students) {
    const values = row(history, s, withGroup).map((v) => (typeof v === "string" ? safeCell(v) : v));
    const last = values.length - 2; // colonne « taux » : nombre si disponible
    values[last] = s.absenceRate === null ? "" : Math.round(s.absenceRate * 100);
    const r = ws.addRow(values);
    if (s.overThreshold) r.eachCell((c) => (c.fill = RED_FILL));
  }
  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 18;

  // --- Feuille 2 : récapitulatif des séances
  const ws2 = wb.addWorksheet("Séances");
  const h2 = ws2.addRow(["Date", "Heure", "Salle", "Présents", "Absents non justifiés", "Excusés"]);
  h2.font = { bold: true };
  h2.eachCell((c) => (c.fill = HEADER_FILL));
  for (const s of history.sessions) {
    ws2.addRow([formatDate(s.scheduled_at), formatTime(s.scheduled_at), safeCell(s.room ?? ""), s.present, s.absent, s.excuse]);
  }
  ws2.columns.forEach((c) => (c.width = 16));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Nom de fichier sans accents ni caractères spéciaux. */
export function exportFileName(meta: HistoryMeta, ext: "csv" | "xlsx", now = new Date()): string {
  const slug = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  const date = formatDate(now).split("/").reverse().join("-");
  return `assiduite_${slug(meta.module)}_${slug(meta.sessionType)}_${slug(meta.group)}_${date}.${ext}`;
}
