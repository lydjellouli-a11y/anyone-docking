// Transformation d'un tableau de cellules (venant d'un CSV ou d'un XLSX) en
// liste d'étudiants validée. Toute la logique est ici, sans dépendance à un
// format de fichier, pour être facilement testée.

export const MAX_STUDENTS = 2000;
export const MATRICULE_PATTERN = /^[A-Z0-9][A-Z0-9./_-]{2,29}$/;

export type ParsedStudent = { line: number; matricule: string; nom: string; prenom: string };
export type ImportIssue = { line: number | null; message: string };
export type StudentListResult = { students: ParsedStudent[]; errors: ImportIssue[] };

/** « N° Matricule » → « nmatricule » ; « Prénom » → « prenom ». */
function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isMatriculeHeader(h: string) {
  return h === "mat" || h.includes("matricule");
}
function isNomHeader(h: string) {
  return h === "nom" || h === "noms" || h === "nomdefamille" || h === "nomfamille";
}
function isPrenomHeader(h: string) {
  return h === "prenom" || h === "prenoms";
}

export function normalizeMatricule(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

type Columns = { headerIndex: number; matricule: number; nom: number; prenom: number };

/** Cherche la ligne d'en-tête dans les 20 premières lignes (des titres peuvent précéder). */
function findColumns(rows: string[][]): Columns | ImportIssue {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const headers = rows[r].map((c) => normalizeHeader(c ?? ""));
    const matricule = headers.findIndex(isMatriculeHeader);
    const nom = headers.findIndex(isNomHeader);
    const prenom = headers.findIndex(isPrenomHeader);
    if (matricule >= 0 && nom >= 0 && prenom >= 0) {
      return { headerIndex: r, matricule, nom, prenom };
    }
    if (matricule >= 0 && headers.some((h) => h.startsWith("nom") && h.includes("prenom"))) {
      return {
        line: r + 1,
        message:
          "Le nom et le prénom sont dans une seule colonne. Séparez-les en deux colonnes « Nom » et « Prénom ».",
      };
    }
  }
  return {
    line: null,
    message:
      "Colonnes introuvables : le fichier doit contenir une ligne d'en-tête avec « Matricule », « Nom » et « Prénom ».",
  };
}

export function rowsToStudents(rows: string[][]): StudentListResult {
  const columns = findColumns(rows);
  if ("message" in columns) {
    return { students: [], errors: [columns] };
  }

  const students: ParsedStudent[] = [];
  const errors: ImportIssue[] = [];
  const seen = new Map<string, number>();

  for (let r = columns.headerIndex + 1; r < rows.length; r++) {
    const line = r + 1; // numéro de ligne tel qu'affiché dans Excel
    const row = rows[r];
    const rawMat = row[columns.matricule] ?? "";
    const nom = cleanName(row[columns.nom] ?? "");
    const prenom = cleanName(row[columns.prenom] ?? "");

    if (!rawMat.trim() && !nom && !prenom) continue; // ligne vide

    const matricule = normalizeMatricule(rawMat);
    if (!MATRICULE_PATTERN.test(matricule)) {
      errors.push({ line, message: `Matricule invalide : « ${rawMat.trim().slice(0, 40)} »` });
      continue;
    }
    if (!nom || !prenom) {
      errors.push({ line, message: `Nom ou prénom manquant (matricule ${matricule})` });
      continue;
    }
    if (nom.length > 100 || prenom.length > 100) {
      errors.push({ line, message: `Nom ou prénom trop long (matricule ${matricule})` });
      continue;
    }
    const previous = seen.get(matricule);
    if (previous !== undefined) {
      errors.push({ line, message: `Matricule ${matricule} en double (déjà présent ligne ${previous})` });
      continue;
    }
    seen.set(matricule, line);
    students.push({ line, matricule, nom, prenom });
  }

  if (students.length === 0 && errors.length === 0) {
    errors.push({ line: null, message: "Aucun étudiant trouvé sous la ligne d'en-tête." });
  }
  if (students.length > MAX_STUDENTS) {
    errors.push({ line: null, message: `Trop d'étudiants (${students.length}) : ${MAX_STUDENTS} au maximum par import.` });
  }
  return { students, errors };
}
