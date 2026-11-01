// Correction d'un matricule et ajout manuel d'un étudiant. Données 100 % fictives.
import { expect, test } from "@playwright/test";
import { createWorkspace, signUp } from "./helpers/account";
import { seedTdSession, teacherClient } from "./helpers/data";

test("corriger un matricule (historique conservé) et ajouter un étudiant à la main", async ({ page }) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Matricule");
  const instId = await createWorkspace(page, "Université fictive — Matricules");
  const { assignmentId, sessionId } = await seedTdSession(email, instId);
  const { client } = await teacherClient(email);
  // Une séance clôturée : Amina (20260001) présente, Bilal absent.
  const { data: amina } = await client.from("students").select("id").eq("matricule", "20260001").single();
  await client.rpc("open_session", { p_session_id: sessionId, p_minutes: 15 }).throwOnError();
  await client
    .rpc("set_attendance", { p_session_id: sessionId, p_student_id: amina!.id, p_status: "present", p_reason: "Appel manuel" })
    .throwOnError();
  await client.rpc("close_session", { p_session_id: sessionId }).throwOnError();
  const { data: g1 } = await client.from("groups").select("id").eq("name", "G1").single();

  // --- Correction du matricule d'Amina (mal saisi) : 20260001 → 20269991
  await page.goto(`/espace/${instId}/groupes/${g1!.id}`);
  const row = page.getByRole("row", { name: /20260001/ });
  await row.getByText("Modifier", { exact: true }).click();
  await row.getByLabel("Matricule").fill(" 2026 9991 ");
  await row.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("cell", { name: "20269991" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "20260001" })).toHaveCount(0);

  // L'historique suit l'étudiante : sa présence est toujours là.
  await page.goto(`/espace/${instId}/enseignements/${assignmentId}/historique`);
  await expect(page.getByRole("row", { name: /20269991/ })).toContainText("P");

  // --- Matricule déjà attribué à un autre étudiant : refusé
  await page.goto(`/espace/${instId}/groupes/${g1!.id}`);
  const bilal = page.getByRole("row", { name: /20260002/ });
  await bilal.getByText("Modifier", { exact: true }).click();
  await bilal.getByLabel("Matricule").fill("20269991");
  await bilal.getByRole("button", { name: "Enregistrer" }).click();
  await expect(bilal.locator("p[role=alert]")).toHaveText("Ce matricule est déjà attribué à un autre étudiant.");

  // --- Ajout manuel d'un étudiant
  await page.goto(`/espace/${instId}/groupes/${g1!.id}`);
  await page.getByText("Ajouter un étudiant (sans fichier)").click();
  const addForm = page.locator("details", { has: page.getByText("Ajouter un étudiant (sans fichier)") });
  await addForm.getByLabel("Matricule", { exact: true }).fill("20260077");
  await addForm.getByLabel("Nom", { exact: true }).fill("Nouveau");
  await addForm.getByLabel("Prénom", { exact: true }).fill("Yacine");
  await addForm.getByRole("button", { name: "Ajouter l'étudiant" }).click();
  await expect(page.getByText("Nouveau Yacine ajouté(e) au groupe.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Liste des étudiants (3)" })).toBeVisible();

  // --- Même matricule une seconde fois : signalé, pas de doublon
  await addForm.getByLabel("Matricule", { exact: true }).fill("20260077");
  await addForm.getByLabel("Nom", { exact: true }).fill("Nouveau");
  await addForm.getByLabel("Prénom", { exact: true }).fill("Yacine");
  await addForm.getByRole("button", { name: "Ajouter l'étudiant" }).click();
  await expect(page.getByText("Le matricule 20260077 est déjà dans ce groupe.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Liste des étudiants (3)" })).toBeVisible();

  // --- Matricule invalide : message clair
  await addForm.getByLabel("Matricule", { exact: true }).fill("#?");
  await addForm.getByLabel("Nom", { exact: true }).fill("Test");
  await addForm.getByLabel("Prénom", { exact: true }).fill("Invalide");
  await addForm.getByRole("button", { name: "Ajouter l'étudiant" }).click();
  await expect(page.getByText(/Matricule invalide/)).toBeVisible();
});
