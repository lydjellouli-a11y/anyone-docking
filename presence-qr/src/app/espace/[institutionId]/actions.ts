"use server";

// Actions serveur de l'espace d'un établissement.
// Principe : on valide les entrées (zod), puis on agit avec l'identité de
// l'utilisatrice connectée. Les droits sont vérifiés par la base (RLS et
// fonctions SQL) : une action non autorisée échoue, même si l'interface a
// été contournée.

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/db-errors";
import { MAX_FILE_BYTES, parseStudentFile } from "@/lib/import/parse-file";
import { MATRICULE_PATTERN, MAX_STUDENTS, type StudentListResult } from "@/lib/import/student-list";
import { MAX_WEEKLY_SESSIONS, algiersToUtcIso, weeklyDates } from "@/lib/schedule";
import type { FormState } from "@/components/ActionForm";

const uuid = z.uuid();
const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} : ${min} caractère(s) minimum.`)
    .max(max, `${label} : ${max} caractères maximum.`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

function invalid(error: z.ZodError): FormState {
  return { error: error.issues[0]?.message ?? "Données invalides." };
}

// -----------------------------------------------------------------------------
// Semestres et modules (admin)
// -----------------------------------------------------------------------------

const semesterSchema = z
  .object({
    label: text(1, 100, "Libellé"),
    start_date: z.iso.date("Date de début invalide."),
    end_date: z.iso.date("Date de fin invalide."),
  })
  .refine((v) => v.end_date > v.start_date, { message: "La date de fin doit suivre la date de début." });

export async function createSemester(institutionId: string, _: FormState, fd: FormData): Promise<FormState> {
  const parsed = semesterSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("semesters").insert({ institution_id: institutionId, ...parsed.data });
  if (error) return { error: dbErrorMessage(error, { duplicate: "Un semestre porte déjà ce libellé." }) };
  refresh();
  return { success: "Semestre ajouté." };
}

export async function deleteSemester(id: string, _: FormState): Promise<FormState> {
  if (!uuid.safeParse(id).success) return { error: "Identifiant invalide." };
  const { supabase } = await requireUser();
  const { error, count } = await supabase.from("semesters").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: dbErrorMessage(error, { inUse: "Ce semestre contient des groupes : supprimez-les d'abord." }) };
  if (!count) return { error: "Action non autorisée." };
  refresh();
  return {};
}

const moduleSchema = z.object({ code: text(1, 30, "Code"), name: text(1, 200, "Intitulé") });

export async function createModule(institutionId: string, _: FormState, fd: FormData): Promise<FormState> {
  const parsed = moduleSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("modules")
    .insert({ institution_id: institutionId, code: parsed.data.code.toUpperCase(), name: parsed.data.name });
  if (error) return { error: dbErrorMessage(error, { duplicate: "Un module porte déjà ce code." }) };
  refresh();
  return { success: "Module ajouté." };
}

export async function deleteModule(id: string, _: FormState): Promise<FormState> {
  if (!uuid.safeParse(id).success) return { error: "Identifiant invalide." };
  const { supabase } = await requireUser();
  const { error, count } = await supabase.from("modules").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: dbErrorMessage(error, { inUse: "Ce module est utilisé par un enseignement." }) };
  if (!count) return { error: "Action non autorisée." };
  refresh();
  return {};
}

// -----------------------------------------------------------------------------
// Sections et groupes (admin)
// -----------------------------------------------------------------------------

const groupSchema = z.object({
  semester_id: uuid,
  kind: z.enum(["section", "groupe"]),
  name: text(1, 100, "Nom"),
  level: optionalText(50),
  parent_id: z
    .string()
    .transform((v) => v || null)
    .pipe(uuid.nullable()),
});

export async function createGroup(institutionId: string, _: FormState, fd: FormData): Promise<FormState> {
  const parsed = groupSchema.safeParse({
    semester_id: fd.get("semester_id"),
    kind: fd.get("kind"),
    name: fd.get("name"),
    level: fd.get("level") ?? "",
    parent_id: fd.get("parent_id") ?? "",
  });
  if (!parsed.success) return { error: "Formulaire incomplet : choisissez un semestre et un nom." };
  if (parsed.data.kind === "section" && parsed.data.parent_id) {
    return { error: "Une section ne peut pas être rattachée à une autre section." };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.from("groups").insert({ institution_id: institutionId, ...parsed.data });
  if (error) return { error: dbErrorMessage(error, { duplicate: "Ce nom existe déjà à cet endroit." }) };
  refresh();
  return { success: parsed.data.kind === "section" ? "Section créée." : "Groupe créé." };
}

export async function deleteGroup(id: string, _: FormState): Promise<FormState> {
  if (!uuid.safeParse(id).success) return { error: "Identifiant invalide." };
  const { supabase } = await requireUser();
  const { error, count } = await supabase.from("groups").delete({ count: "exact" }).eq("id", id);
  if (error) {
    return { error: dbErrorMessage(error, { inUse: "Impossible : ce groupe a des enseignements ou des groupes rattachés." }) };
  }
  if (!count) return { error: "Action non autorisée." };
  refresh();
  return {};
}

export async function removeStudentFromGroup(groupId: string, studentId: string, _: FormState): Promise<FormState> {
  if (!uuid.safeParse(groupId).success || !uuid.safeParse(studentId).success) return { error: "Identifiant invalide." };
  const { supabase } = await requireUser();
  const { error, count } = await supabase
    .from("group_students")
    .delete({ count: "exact" })
    .eq("group_id", groupId)
    .eq("student_id", studentId);
  if (error) return { error: dbErrorMessage(error) };
  if (!count) return { error: "Action non autorisée." };
  refresh();
  return {};
}

// -----------------------------------------------------------------------------
// Importation d'une liste d'étudiants
// -----------------------------------------------------------------------------

/** Étape 1 : lecture et vérification du fichier (rien n'est enregistré). */
export async function previewImport(fd: FormData): Promise<StudentListResult> {
  await requireUser();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { students: [], errors: [{ line: null, message: "Choisissez un fichier." }] };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { students: [], errors: [{ line: null, message: "Fichier trop volumineux (2 Mo maximum)." }] };
  }
  return parseStudentFile(file.name, new Uint8Array(await file.arrayBuffer()));
}

const importRowsSchema = z
  .array(
    z.object({
      matricule: z.string().regex(MATRICULE_PATTERN),
      nom: z.string().trim().min(1).max(100),
      prenom: z.string().trim().min(1).max(100),
    }),
  )
  .min(1)
  .max(MAX_STUDENTS);

export type ImportSummary = {
  error?: string;
  crees?: number;
  ajoutes?: number;
  deja_presents?: number;
  noms_differents?: { matricule: string; enregistre: string; fichier: string }[];
};

/** Étape 2 : enregistrement (tout ou rien) via la fonction SQL import_students. */
export async function confirmImport(groupId: string, rows: unknown): Promise<ImportSummary> {
  const parsedRows = importRowsSchema.safeParse(rows);
  if (!uuid.safeParse(groupId).success || !parsedRows.success) {
    return { error: "Liste invalide : relancez la vérification du fichier." };
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("import_students", {
    p_group_id: groupId,
    p_rows: parsedRows.data,
  });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return data as ImportSummary;
}

// -----------------------------------------------------------------------------
// Enseignements (affectations) — admin
// -----------------------------------------------------------------------------

const assignmentSchema = z.object({
  teacher_id: uuid,
  module_id: uuid,
  group_id: uuid,
  session_type: z.enum(["cours", "td", "tp"]),
});

export async function createAssignment(institutionId: string, _: FormState, fd: FormData): Promise<FormState> {
  const parsed = assignmentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Formulaire incomplet : choisissez l'enseignant, le module, le groupe et le type." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("teaching_assignments").insert({ institution_id: institutionId, ...parsed.data });
  if (error) return { error: dbErrorMessage(error, { duplicate: "Cet enseignement existe déjà." }) };
  refresh();
  return { success: "Enseignement ajouté." };
}

export async function deleteAssignment(id: string, _: FormState): Promise<FormState> {
  if (!uuid.safeParse(id).success) return { error: "Identifiant invalide." };
  const { supabase } = await requireUser();
  const { error, count } = await supabase.from("teaching_assignments").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: dbErrorMessage(error, { inUse: "Cet enseignement a déjà des séances : il ne peut pas être supprimé." }) };
  if (!count) return { error: "Action non autorisée." };
  refresh();
  return {};
}

// -----------------------------------------------------------------------------
// Séances (enseignant de l'affectation)
// -----------------------------------------------------------------------------

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:MM).");
const roomSchema = optionalText(50);

const oneSessionSchema = z.object({
  date: z.iso.date("Date invalide."),
  time: timeSchema,
  room: roomSchema,
});

export async function planSession(
  institutionId: string,
  assignmentId: string,
  _: FormState,
  fd: FormData,
): Promise<FormState> {
  const parsed = oneSessionSchema.safeParse({ date: fd.get("date"), time: fd.get("time"), room: fd.get("room") ?? "" });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("class_sessions").insert({
    institution_id: institutionId,
    assignment_id: assignmentId,
    scheduled_at: algiersToUtcIso(parsed.data.date, parsed.data.time),
    room: parsed.data.room,
  });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { success: "Séance planifiée." };
}

const weeklySchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    time: timeSchema,
    from: z.iso.date("Date de début invalide."),
    to: z.iso.date("Date de fin invalide."),
    room: roomSchema,
  })
  .refine((v) => v.to >= v.from, { message: "La date de fin doit suivre la date de début." });

export async function planWeeklySessions(
  institutionId: string,
  assignmentId: string,
  _: FormState,
  fd: FormData,
): Promise<FormState> {
  const parsed = weeklySchema.safeParse({
    weekday: fd.get("weekday"),
    time: fd.get("time"),
    from: fd.get("from"),
    to: fd.get("to"),
    room: fd.get("room") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const { weekday, time, from, to, room } = parsed.data;
  const dates = weeklyDates(from, to, weekday);
  if (dates.length === 0) return { error: "Aucune date ne correspond à ce jour sur cette période." };
  if (dates.length > MAX_WEEKLY_SESSIONS) {
    return { error: `Trop de séances (${dates.length}) : ${MAX_WEEKLY_SESSIONS} au maximum en une fois.` };
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.from("class_sessions").insert(
    dates.map((d) => ({
      institution_id: institutionId,
      assignment_id: assignmentId,
      scheduled_at: algiersToUtcIso(d, time),
      room,
    })),
  );
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { success: `${dates.length} séance(s) planifiée(s).` };
}

export async function cancelSession(sessionId: string, _: FormState): Promise<FormState> {
  if (!uuid.safeParse(sessionId).success) return { error: "Identifiant invalide." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("cancel_session", { p_session_id: sessionId });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return {};
}
