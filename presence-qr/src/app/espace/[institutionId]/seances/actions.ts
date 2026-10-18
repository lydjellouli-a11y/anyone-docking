"use server";

// Actions de l'enseignant pendant une séance. Chaque action appelle une
// fonction SQL qui vérifie elle-même que l'utilisatrice est l'enseignante de
// la séance (owns_session) : un appel forgé est refusé par la base.
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/db-errors";
import { serverEnv } from "@/lib/server-env";
import type { FormState } from "@/components/ActionForm";

const uuid = z.uuid();

async function siteOrigin(): Promise<string> {
  if (serverEnv.siteUrl) return serverEnv.siteUrl;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function openSession(sessionId: string, _: FormState): Promise<FormState> {
  if (!uuid.safeParse(sessionId).success) return { error: "Identifiant invalide." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("open_session", { p_session_id: sessionId, p_minutes: 15 });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return {};
}

/** Crée une séance « maintenant » et l'ouvre immédiatement. */
export async function startSessionNow(institutionId: string, assignmentId: string, _: FormState): Promise<FormState> {
  if (!uuid.safeParse(institutionId).success || !uuid.safeParse(assignmentId).success) {
    return { error: "Identifiant invalide." };
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("class_sessions")
    .insert({ institution_id: institutionId, assignment_id: assignmentId, scheduled_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) return { error: dbErrorMessage(error) };
  const opened = await supabase.rpc("open_session", { p_session_id: data.id, p_minutes: 15 });
  if (opened.error) return { error: dbErrorMessage(opened.error) };
  redirect(`/espace/${institutionId}/seances/${data.id}`);
}

export async function extendCheckin(sessionId: string, _: FormState): Promise<FormState> {
  if (!uuid.safeParse(sessionId).success) return { error: "Identifiant invalide." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("extend_checkin", { p_session_id: sessionId, p_minutes: 5 });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { success: "Pointage prolongé de 5 minutes." };
}

export async function closeSession(sessionId: string, _: FormState): Promise<FormState> {
  if (!uuid.safeParse(sessionId).success) return { error: "Identifiant invalide." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("close_session", { p_session_id: sessionId });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return {};
}

export type QrPayload =
  | { ok: true; svg: string; url: string; expiresAt: string; closesAt: string; serverNow: string }
  | { ok: false; ended: boolean; error: string };

/** Nouveau QR code (appelé toutes les 20 secondes par l'écran de l'enseignante). */
export async function nextQr(sessionId: string, publicCode: string): Promise<QrPayload> {
  if (!uuid.safeParse(sessionId).success || !/^[A-Za-z0-9_-]{12}$/.test(publicCode)) {
    return { ok: false, ended: false, error: "Identifiant invalide." };
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("rotate_session_token", { p_session_id: sessionId });
  const row = data?.[0];
  if (error || !row) {
    return { ok: false, ended: error?.code === "P0001", error: dbErrorMessage(error) };
  }
  const url = `${await siteOrigin()}/p/${publicCode}?t=${encodeURIComponent(row.token)}`;
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  return { ok: true, svg, url, expiresAt: row.expires_at, closesAt: row.checkin_closes_at, serverNow: row.server_now };
}

const attendanceSchema = z.object({
  status: z.enum(["present", "absent", "excuse"]),
  reason: z.string().trim().min(3, "Justification obligatoire (3 caractères minimum).").max(500),
});

/** Saisie ou correction manuelle, toujours justifiée (journal d'audit). */
export async function setAttendance(
  sessionId: string,
  studentId: string,
  _: FormState,
  fd: FormData,
): Promise<FormState> {
  const parsed = attendanceSchema.safeParse({ status: fd.get("status"), reason: fd.get("reason") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  if (!uuid.safeParse(sessionId).success || !uuid.safeParse(studentId).success) {
    return { error: "Identifiant invalide." };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_attendance", {
    p_session_id: sessionId,
    p_student_id: studentId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return { success: "Enregistré." };
}

const discardSchema = z.object({
  reason: z.string().trim().min(3, "Justification obligatoire (3 caractères minimum).").max(500),
});

/**
 * Annule une séance déjà ouverte ou clôturée (essai, erreur). Elle ne compte
 * plus dans l'historique ni les exports ; les présences restent tracées.
 */
export async function discardSession(sessionId: string, _: FormState, fd: FormData): Promise<FormState> {
  const parsed = discardSchema.safeParse({ reason: fd.get("reason") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  if (!uuid.safeParse(sessionId).success) return { error: "Identifiant invalide." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("discard_session", { p_session_id: sessionId, p_reason: parsed.data.reason });
  if (error) return { error: dbErrorMessage(error) };
  refresh();
  return {};
}
