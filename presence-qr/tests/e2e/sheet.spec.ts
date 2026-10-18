// Feuille d'émargement pré-remplie, imprimable AVANT l'ouverture de la séance.
// Données 100 % fictives.
import { expect, test } from "@playwright/test";
import { createWorkspace, signUp } from "./helpers/account";
import { seedTdSession, teacherClient } from "./helpers/data";

test("feuille d'émargement d'une séance planifiée, pré-remplie et imprimable", async ({ page }) => {
  const email = await signUp(page, "Feuille");
  const instId = await createWorkspace(page, "Université fictive — Feuille");
  const { assignmentId } = await seedTdSession(email, instId);
  const { client } = await teacherClient(email);
  // Séance planifiée le 21/10/2026 à 10:00 (heure d'Alger), salle B12.
  await client
    .from("class_sessions")
    .insert({ institution_id: instId, assignment_id: assignmentId, scheduled_at: "2026-10-21T09:00:00Z", room: "B12" })
    .throwOnError();

  // Depuis la liste des séances : lien « Feuille » sur la séance planifiée.
  await page.goto(`/espace/${instId}/enseignements/${assignmentId}`);
  await page.getByRole("row", { name: /21\/10\/2026 10:00/ }).getByRole("link", { name: "Feuille" }).click();

  await expect(page.getByRole("heading", { name: "Feuille d'émargement" })).toBeVisible();
  await expect(page.getByText("Cytologie (TD) — G1")).toBeVisible();
  await expect(page.getByText("Séance du 21/10/2026 10:00 — salle B12")).toBeVisible();
  await expect(page.getByRole("cell", { name: "20260001" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Amina" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "20260003" })).toHaveCount(0); // autre groupe
  await expect(page.getByRole("button", { name: "Imprimer" })).toBeVisible();

  // Aperçu d'impression : menus et bouton masqués, liste visible.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Imprimer" })).toBeHidden();
  await expect(page.locator(".topbar")).toBeHidden();
  await expect(page.getByRole("cell", { name: "20260002" })).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  // Depuis la page de la séance planifiée : lien visible avant l'ouverture.
  await page.goBack();
  await page.getByRole("link", { name: "21/10/2026 10:00" }).click();
  await expect(page.getByRole("link", { name: /Feuille d'émargement de cette séance/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ouvrir la séance et afficher le QR code" })).toBeVisible();
});
