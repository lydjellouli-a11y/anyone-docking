// Annulation de séances d'essai déjà clôturées : les fausses absences
// disparaissent de l'historique. Données 100 % fictives.
import { expect, test } from "@playwright/test";
import { createWorkspace, signUp } from "./helpers/account";
import { seedTdSession, teacherClient } from "./helpers/data";

test("annuler une séance d'essai clôturée retire les fausses absences", async ({ page }) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Essais");
  const instId = await createWorkspace(page, "Université fictive — Essais");
  const { assignmentId, sessionId } = await seedTdSession(email, instId);
  const { client } = await teacherClient(email);

  // 3 séances d'essai clôturées sans pointage : tout le monde « absent ».
  const { data: extra } = await client
    .from("class_sessions")
    .insert(["2026-10-05T08:00:00Z", "2026-10-06T08:00:00Z"].map((d) => ({ institution_id: instId, assignment_id: assignmentId, scheduled_at: d })))
    .select("id");
  for (const id of [...extra!.map((s) => s.id), sessionId]) {
    expect((await client.rpc("open_session", { p_session_id: id, p_minutes: 15 })).error).toBeNull();
    expect((await client.rpc("close_session", { p_session_id: id })).error).toBeNull();
  }
  const historyUrl = `/espace/${instId}/enseignements/${assignmentId}/historique`;
  await page.goto(historyUrl);
  await expect(page.locator("p[role=alert]")).toContainText("2 étudiant(s) ont atteint le seuil");

  // Annulation d'une séance d'essai depuis sa page.
  await page.goto(`/espace/${instId}/seances/${sessionId}`);
  await page.getByText("Annuler cette séance (essai ou erreur)").click();
  await page.getByLabel("Justification de l'annulation").fill("Séance d'essai");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Annuler définitivement cette séance" }).click();
  await expect(page.getByText("Cette séance a été annulée")).toBeVisible();

  // L'historique ne compte plus que 2 séances : plus personne au seuil.
  await page.goto(historyUrl);
  await expect(page.getByText("2 séance(s) clôturée(s)")).toBeVisible();
  await expect(page.getByText("Aucun étudiant n'atteint le seuil")).toBeVisible();

  // Les 2 autres séances d'essai : annulées aussi → historique vide.
  for (const s of extra!) {
    await page.goto(`/espace/${instId}/seances/${s.id}`);
    await page.getByText("Annuler cette séance (essai ou erreur)").click();
    await page.getByLabel("Justification de l'annulation").fill("Séance d'essai");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Annuler définitivement cette séance" }).click();
    await expect(page.getByText("Cette séance a été annulée")).toBeVisible();
  }
  await page.goto(historyUrl);
  await expect(page.getByText("Aucune séance clôturée pour l'instant.")).toBeVisible();
});
