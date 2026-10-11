"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/dates";
import { ActionForm } from "@/components/ActionForm";
import { closeSession, extendCheckin, nextQr, setAttendance, type QrPayload } from "../actions";

type Student = { id: string; matricule: string; name: string; group: string };
type Attendance = { student_id: string; status: string; source: string; recorded_at: string; flags: string[] };

const STATUS_LABELS: Record<string, string> = { present: "Présent", absent: "Absent", excuse: "Excusé", retard: "Retard" };
const SOURCE_LABELS: Record<string, string> = {
  qr: "QR",
  code_secours: "code",
  manuel: "manuel",
  import_papier: "papier",
  cloture: "clôture",
};
const QR_REFRESH_MS = 20_000;
const POLL_MS = 4_000;

export function LiveSession(props: {
  sessionId: string;
  publicCode: string;
  status: "open" | "closed";
  isOwner: boolean;
  fallbackCode: string | null;
  checkinClosesAt: string | null;
  roster: Student[];
  initialAttendance: Attendance[];
  sheetUrl: string;
  siteHost: string;
}) {
  const { sessionId, status, isOwner, roster } = props;
  const [attendance, setAttendanceRows] = useState<Attendance[]>(props.initialAttendance);
  const [lastSync, setLastSync] = useState<Date | null>(new Date());
  const [offline, setOffline] = useState(false);

  // --- Tableau en direct : relecture régulière (la RLS s'applique).
  const poll = useCallback(async () => {
    const { data, error } = await createClient()
      .from("attendance")
      .select("student_id, status, source, recorded_at, flags")
      .eq("session_id", sessionId);
    if (error || !data) {
      setOffline(true);
      return;
    }
    setAttendanceRows(data);
    setOffline(false);
    setLastSync(new Date());
  }, [sessionId]);

  // Données rafraîchies par le serveur (après une correction) : on les reprend.
  const [prevInitial, setPrevInitial] = useState(props.initialAttendance);
  if (props.initialAttendance !== prevInitial) {
    setPrevInitial(props.initialAttendance);
    setAttendanceRows(props.initialAttendance);
  }

  useEffect(() => {
    if (status !== "open") return;
    const id = setInterval(() => void poll().catch(() => setOffline(true)), POLL_MS);
    return () => clearInterval(id);
  }, [status, poll]);

  const byStudent = useMemo(() => new Map(attendance.map((a) => [a.student_id, a])), [attendance]);
  const presentCount = attendance.filter((a) => a.status === "present").length;
  const flagged = attendance.filter((a) => a.flags.includes("appareil_partage")).length;

  return (
    <>
      {status === "open" && isOwner && (
        <QrPanel
          sessionId={sessionId}
          publicCode={props.publicCode}
          fallbackCode={props.fallbackCode}
          checkinClosesAt={props.checkinClosesAt}
          siteHost={props.siteHost}
        />
      )}

      {offline && (
        <p role="alert" className="form-error">
          Connexion perdue — dernière mise à jour à {lastSync ? formatTime(lastSync) : "—"}. Les étudiants qui ont du
          réseau peuvent continuer à pointer. Sinon : <Link href={props.sheetUrl}>feuille d&apos;émargement</Link> ou appel
          manuel ci-dessous.
        </p>
      )}

      <h2>
        Présents : {presentCount} / {roster.length}
      </h2>
      {flagged > 0 && (
        <p className="form-error">
          ⚠ {flagged} présence(s) enregistrée(s) depuis un même téléphone pour plusieurs matricules : à vérifier en salle.
        </p>
      )}
      <p>
        <Link href={props.sheetUrl}>Feuille d&apos;émargement imprimable (secours)</Link>
      </p>

      {isOwner && status === "open" && (
        <div className="row-actions">
          <ActionForm
            action={closeSession.bind(null, sessionId)}
            submitLabel="Clôturer la séance"
            pendingLabel="Clôture…"
            confirmMessage="Clôturer la séance ? Les étudiants non pointés seront marqués absents."
            className="inline-form"
            buttonClassName="danger-button"
          />
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Matricule</th>
              <th>Nom</th>
              {roster.some((s) => s.group) && <th>Groupe</th>}
              <th>État</th>
              {isOwner && <th>Modifier</th>}
            </tr>
          </thead>
          <tbody>
            {roster.map((s) => {
              const a = byStudent.get(s.id);
              return (
                <tr key={s.id}>
                  <td>{s.matricule}</td>
                  <td>{s.name}</td>
                  {roster.some((x) => x.group) && <td>{s.group}</td>}
                  <td>
                    {a ? (
                      <>
                        {STATUS_LABELS[a.status] ?? a.status}{" "}
                        <span className="muted small">
                          ({SOURCE_LABELS[a.source] ?? a.source}
                          {a.status === "present" ? `, ${formatTime(a.recorded_at)}` : ""})
                        </span>
                        {a.flags.includes("appareil_partage") && <span title="Même téléphone que d'autres"> ⚠</span>}
                      </>
                    ) : (
                      <span className="muted">non pointé</span>
                    )}
                  </td>
                  {isOwner && (
                    <td>
                      <details>
                        <summary className="small">Modifier</summary>
                        <ActionForm
                          action={setAttendance.bind(null, sessionId, s.id)}
                          submitLabel="Enregistrer"
                          className="form compact"
                        >
                          <select name="status" defaultValue={a?.status === "present" ? "absent" : "present"} aria-label="Nouvel état">
                            <option value="present">Présent</option>
                            <option value="absent">Absent</option>
                            <option value="excuse">Excusé</option>
                          </select>
                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={500}
                            aria-label="Justification"
                            placeholder="Justification (obligatoire)"
                            defaultValue={status === "open" ? "Appel manuel" : ""}
                          />
                        </ActionForm>
                      </details>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function QrPanel({
  sessionId,
  publicCode,
  fallbackCode,
  checkinClosesAt,
  siteHost,
}: {
  sessionId: string;
  publicCode: string;
  fallbackCode: string | null;
  checkinClosesAt: string | null;
  siteHost: string;
}) {
  const [qr, setQr] = useState<Extract<QrPayload, { ok: true }> | null>(null);
  const [problem, setProblem] = useState<string>("");
  const [ended, setEnded] = useState(false);
  // null tant que la page n'est pas chargée dans le navigateur : le compte à
  // rebours dépend de l'horloge et n'est donc pas calculé côté serveur.
  const [now, setNow] = useState<number | null>(null);
  const [clockOffset, setClockOffset] = useState(0); // écart horloge serveur / appareil
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const result = await nextQr(sessionId, publicCode);
      if (result.ok) {
        setQr(result);
        setEnded(false);
        setProblem("");
        setClockOffset(new Date(result.serverNow).getTime() - Date.now());
      } else {
        setEnded(result.ended);
        setProblem(result.ended ? "" : result.error);
        if (result.ended) setQr(null);
      }
    } catch {
      setProblem("Connexion perdue : le QR code ne peut plus être renouvelé. Utilisez le code de secours ci-dessous.");
    }
  }, [sessionId, publicCode]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), QR_REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load, checkinClosesAt]);

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const closesAt = qr?.closesAt ?? checkinClosesAt;
  const serverNow = now === null ? null : now + clockOffset;
  const remainingMs = closesAt && serverNow !== null ? new Date(closesAt).getTime() - serverNow : null;
  const remaining = remainingMs === null ? null : Math.max(0, Math.round(remainingMs / 1000));
  const qrExpired = qr && serverNow !== null ? new Date(qr.expiresAt).getTime() < serverNow : true;
  const isOver = ended || (remainingMs !== null && remainingMs <= 0);

  return (
    <div className="card qr-panel" ref={panel}>
      {isOver ? (
        <p className="checkin-result error">Le pointage est terminé. Vous pouvez le prolonger ou clôturer la séance.</p>
      ) : (
        <>
          <p className="qr-timer" aria-live="polite">
            {remaining === null
              ? "Pointage ouvert"
              : `Pointage : ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} restantes`}
          </p>
          {qr && !qrExpired ? (
            <div
              className="qr-image"
              role="img"
              aria-label="QR code de pointage"
              data-checkin-url={qr.url}
              dangerouslySetInnerHTML={{ __html: qr.svg }}
            />
          ) : (
            <p className="muted">Chargement du QR code…</p>
          )}
        </>
      )}
      {problem && (
        <p role="alert" className="form-error">
          {problem}
        </p>
      )}
      {fallbackCode && !isOver && (
        <p className="fallback">
          Sans QR : aller sur <strong>{siteHost}/code</strong> et saisir
          le code <strong className="code">{fallbackCode}</strong>
        </p>
      )}
      <div className="row-actions">
        <ActionForm
          action={extendCheckin.bind(null, sessionId)}
          submitLabel="Prolonger de 5 minutes"
          pendingLabel="…"
          className="inline-form"
        />
        <button type="button" onClick={() => void panel.current?.requestFullscreen?.()}>
          Plein écran
        </button>
      </div>
    </div>
  );
}
