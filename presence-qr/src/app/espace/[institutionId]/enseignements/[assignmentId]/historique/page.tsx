import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getInstitutionContext } from "@/lib/institution";
import { formatDate } from "@/lib/dates";
import { SESSION_TYPE_LABELS } from "@/lib/labels";
import { ABSENCE_THRESHOLD, CELL_LABELS, formatPercent } from "@/lib/history/core";
import { loadAssignmentHistory } from "@/lib/history/load";

export const metadata: Metadata = { title: "Historique — Présence QR" };

export default async function HistoryPage({
  params,
}: PageProps<"/espace/[institutionId]/enseignements/[assignmentId]/historique">) {
  const { institutionId, assignmentId } = await params;
  if (!z.uuid().safeParse(assignmentId).success) notFound();
  const { supabase, institution } = await getInstitutionContext(institutionId);
  const result = await loadAssignmentHistory(supabase, institution.id, assignmentId);
  if (!result) notFound();
  const { meta, history } = result;
  const base = `/espace/${institution.id}/enseignements/${assignmentId}`;
  const withGroup = history.students.some((s) => s.group);

  return (
    <main>
      <p>
        <Link href={base}>← Séances de cet enseignement</Link>
      </p>
      <h1>
        Historique — {meta.module} — {SESSION_TYPE_LABELS[meta.sessionType]} — {meta.group}
      </h1>
      <p className="muted">
        {history.sessions.length} séance(s) clôturée(s) — taux de présence global : {formatPercent(history.presenceRate)}
      </p>

      <div className="row-actions left">
        <a className="button-link" href={`${base}/export?format=xlsx`} download>
          Télécharger (Excel .xlsx)
        </a>
        <a className="button-link secondary" href={`${base}/export?format=csv`} download>
          Télécharger (CSV)
        </a>
      </div>

      {history.overThresholdCount > 0 ? (
        <p role="alert" className="form-error">
          ⚠ {history.overThresholdCount} étudiant(s) ont atteint le seuil de {ABSENCE_THRESHOLD} absences non
          justifiées (lignes en rouge).
        </p>
      ) : (
        <p className="muted">Aucun étudiant n&apos;atteint le seuil de {ABSENCE_THRESHOLD} absences non justifiées.</p>
      )}
      <p className="muted small">P = présent, A = absent (non justifié), E = excusé, vide = pas encore inscrit.</p>

      {history.sessions.length === 0 ? (
        <p>Aucune séance clôturée pour l&apos;instant.</p>
      ) : (
        <div className="table-wrap">
          <table className="table history-table">
            <thead>
              <tr>
                <th>Matricule</th>
                <th>Nom</th>
                {withGroup && <th>Groupe</th>}
                {history.sessions.map((s) => (
                  <th key={s.id} title={formatDate(s.scheduled_at)}>
                    {formatDate(s.scheduled_at).slice(0, 5)}
                  </th>
                ))}
                <th>P</th>
                <th>A</th>
                <th>E</th>
                <th>Taux d&apos;absence</th>
              </tr>
            </thead>
            <tbody>
              {history.students.map((s) => (
                <tr key={s.id} className={s.overThreshold ? "over-threshold" : undefined}>
                  <td>{s.matricule}</td>
                  <td>
                    {s.last_name} {s.first_name}
                    {s.overThreshold && <span title="Seuil atteint"> ⚠</span>}
                  </td>
                  {withGroup && <td>{s.group}</td>}
                  {s.cells.map((c, i) => (
                    <td key={i} className={`cell ${c ?? "none"}`}>
                      {c ? CELL_LABELS[c] ?? c : ""}
                    </td>
                  ))}
                  <td>{s.present}</td>
                  <td>{s.absent}</td>
                  <td>{s.excuse}</td>
                  <td>{formatPercent(s.absenceRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
