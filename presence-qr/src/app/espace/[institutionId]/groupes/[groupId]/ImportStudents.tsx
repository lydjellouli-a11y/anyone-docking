"use client";

import { useState, useTransition } from "react";
import type { StudentListResult } from "@/lib/import/student-list";
import { FormMessage } from "@/components/FormMessage";
import { confirmImport, previewImport, type ImportSummary } from "../../actions";

// Importation en deux étapes : 1) vérification du fichier (aperçu, erreurs),
// 2) confirmation. Rien n'est enregistré avant la confirmation.
export function ImportStudents({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [preview, setPreview] = useState<StudentListResult | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [networkError, setNetworkError] = useState("");
  const [pending, startTransition] = useTransition();

  function onPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setSummary(null);
    setNetworkError("");
    startTransition(async () => {
      try {
        setPreview(await previewImport(fd));
      } catch {
        setNetworkError("Envoi impossible. Vérifiez votre connexion et réessayez.");
      }
    });
  }

  function onConfirm() {
    if (!preview) return;
    const rows = preview.students.map(({ matricule, nom, prenom }) => ({ matricule, nom, prenom }));
    startTransition(async () => {
      try {
        const result = await confirmImport(groupId, rows);
        setSummary(result);
        if (!result.error) setPreview(null);
      } catch {
        setNetworkError("Envoi impossible. Vérifiez votre connexion et réessayez : rien n'a été enregistré.");
      }
    });
  }

  const blocking = preview && preview.errors.length > 0;

  return (
    <div className="card">
      <h3>Importer une liste dans « {groupName} »</h3>
      <p className="muted">
        Fichier .xlsx ou .csv avec une ligne d&apos;en-tête contenant <strong>Matricule</strong>, <strong>Nom</strong>{" "}
        et <strong>Prénom</strong> (les autres colonnes sont ignorées). 2 Mo et 2000 étudiants maximum.
      </p>
      <form onSubmit={onPreview} className="form">
        <label>
          Fichier
          <input name="file" type="file" accept=".xlsx,.csv,.txt" required />
        </label>
        <button type="submit" disabled={pending}>
          {pending && !preview ? "Vérification…" : "Vérifier le fichier"}
        </button>
      </form>
      <FormMessage error={networkError} />

      {preview && (
        <div>
          {preview.errors.length > 0 && (
            <div role="alert" className="form-error">
              <p>
                <strong>{preview.errors.length} problème(s) à corriger dans le fichier</strong> (rien n&apos;a été
                importé) :
              </p>
              <ul>
                {preview.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    {e.line ? `Ligne ${e.line} : ` : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.students.length > 0 && (
            <>
              <p>
                {preview.students.length} étudiant(s) lu(s). Aperçu des premières lignes :
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Matricule</th>
                      <th>Nom</th>
                      <th>Prénom</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.students.slice(0, 10).map((s) => (
                      <tr key={s.matricule}>
                        <td>{s.line}</td>
                        <td>{s.matricule}</td>
                        <td>{s.nom}</td>
                        <td>{s.prenom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!blocking && (
                <button type="button" onClick={onConfirm} disabled={pending}>
                  {pending ? "Importation…" : `Importer ${preview.students.length} étudiant(s)`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {summary &&
        (summary.error ? (
          <FormMessage error={summary.error} />
        ) : (
          <div role="status" className="form-success">
            <p>
              Importation terminée : {summary.ajoutes} ajouté(s) au groupe (dont {summary.crees} nouveau(x)),{" "}
              {summary.deja_presents} déjà présent(s).
            </p>
            {summary.noms_differents && summary.noms_differents.length > 0 && (
              <div className="form-error">
                <p>
                  {summary.noms_differents.length} matricule(s) existaient déjà avec un autre nom. Le nom enregistré a
                  été conservé ; vérifiez :
                </p>
                <ul>
                  {summary.noms_differents.map((d) => (
                    <li key={d.matricule}>
                      {d.matricule} : enregistré « {d.enregistre} », fichier « {d.fichier} »
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
