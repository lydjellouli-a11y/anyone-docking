"use server";

// Pointage étudiant (sans compte). Le serveur vérifie le passage de scan
// signé, puis appelle la fonction SQL record_checkin avec la clé secrète.
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { verifyTicket } from "@/lib/checkin/crypto";
import { requestFingerprints, sqlNullable } from "@/lib/checkin/device";
import { checkinMessage, type CheckinResult } from "@/lib/checkin/messages";

export type CheckinState = { ok?: boolean; message?: string };

const matriculeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9./_-]{2,29}$/));

const UNAVAILABLE = "Service momentanément indisponible : réessayez, ou signalez-vous à l'enseignant(e).";

async function record(sessionId: string, source: "qr" | "code_secours", matricule: string): Promise<CheckinState> {
  const { ipHash, deviceRef } = await requestFingerprints({ create: true });
  const { data, error } = await createAdminClient().rpc("record_checkin", {
    p_session_id: sessionId,
    p_source: source,
    p_matricule: matricule,
    p_ip_hash: sqlNullable(ipHash),
    p_device_ref: sqlNullable(deviceRef),
  });
  if (error || !data) return { ok: false, message: UNAVAILABLE };
  const { ok, text } = checkinMessage(data as CheckinResult);
  return { ok, message: text };
}

/** Pointage après scan du QR : `ticket` a été délivré au moment du scan. */
export async function submitCheckin(ticket: string, _: CheckinState, fd: FormData): Promise<CheckinState> {
  const matricule = matriculeSchema.safeParse(fd.get("matricule") ?? "");
  if (!matricule.success) return { ok: false, message: "Matricule invalide : vérifiez la saisie." };
  const scan = verifyTicket(serverEnv.checkinSecret, ticket);
  if (!scan) {
    return {
      ok: false,
      message: "Délai dépassé (3 minutes après le scan). Scannez à nouveau le QR code affiché.",
    };
  }
  return record(scan.sessionId, scan.source, matricule.data);
}

/** Pointage avec le code de secours à 6 chiffres (sans QR). */
export async function submitFallbackCode(_: CheckinState, fd: FormData): Promise<CheckinState> {
  const code = z.string().trim().regex(/^\d{6}$/).safeParse(fd.get("code") ?? "");
  const matricule = matriculeSchema.safeParse(fd.get("matricule") ?? "");
  if (!code.success) return { ok: false, message: "Le code de séance comporte 6 chiffres." };
  if (!matricule.success) return { ok: false, message: "Matricule invalide : vérifiez la saisie." };

  const { ipHash, deviceRef } = await requestFingerprints({ create: true });
  const { data, error } = await createAdminClient().rpc("validate_scan", {
    p_public_code: sqlNullable(null),
    p_token: sqlNullable(null),
    p_fallback_code: code.data,
    p_ip_hash: sqlNullable(ipHash),
    p_device_ref: sqlNullable(deviceRef),
  });
  if (error || !data) return { ok: false, message: UNAVAILABLE };
  const scan = data as { result: CheckinResult["result"]; session_id?: string };
  if (scan.result !== "ok" || !scan.session_id) {
    return { ok: false, message: checkinMessage({ result: scan.result }).text };
  }
  return record(scan.session_id, "code_secours", matricule.data);
}
