import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueScanTicket, requestFingerprints, sqlNullable } from "@/lib/checkin/device";
import { checkinMessage, type CheckinResult } from "@/lib/checkin/messages";
import { submitCheckin } from "../actions";
import { CheckinForm } from "../CheckinForm";

export const metadata: Metadata = { title: "Pointage — Présence QR", robots: { index: false, follow: false } };

// Page ouverte en scannant le QR code. Le jeton du QR est vérifié MAINTENANT
// (au moment du scan) ; l'étudiant reçoit alors un passage signé valable
// 3 minutes pour saisir son matricule.
export default async function ScanPage({ params, searchParams }: PageProps<"/p/[code]">) {
  const { code } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t.slice(0, 64) : "";

  let outcome: { ok: true; ticket: string; module: string } | { ok: false; message: string };
  if (!/^[A-Za-z0-9_-]{12}$/.test(code) || !token) {
    outcome = { ok: false, message: checkinMessage({ result: "seance_introuvable" }).text };
  } else {
    const { ipHash, deviceRef } = await requestFingerprints({ create: false });
    const { data, error } = await createAdminClient().rpc("validate_scan", {
      p_public_code: code,
      p_token: token,
      p_fallback_code: sqlNullable(null),
      p_ip_hash: sqlNullable(ipHash),
      p_device_ref: sqlNullable(deviceRef),
    });
    const scan = data as { result: CheckinResult["result"]; session_id?: string; source?: "qr"; module?: string } | null;
    if (error || !scan) {
      outcome = { ok: false, message: "Service momentanément indisponible : rechargez la page." };
    } else if (scan.result === "ok" && scan.session_id) {
      outcome = {
        ok: true,
        module: scan.module ?? "",
        ticket: issueScanTicket(scan.session_id, "qr"),
      };
    } else {
      outcome = { ok: false, message: checkinMessage({ result: scan.result }).text };
    }
  }

  return (
    <main className="container narrow">
      <h1>Pointage de présence</h1>
      {outcome.ok ? (
        <>
          <p className="muted">{outcome.module}</p>
          <CheckinForm
            action={submitCheckin.bind(null, outcome.ticket)}
            hint="Vous avez 3 minutes pour valider après le scan."
          />
        </>
      ) : (
        <>
          <p role="alert" className="checkin-result error">
            {outcome.message}
          </p>
          <p className="muted small">
            Pas de QR code lisible ? <Link href="/code">Saisir le code de la séance</Link>
          </p>
        </>
      )}
    </main>
  );
}
