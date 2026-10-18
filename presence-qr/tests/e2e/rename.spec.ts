// Correction des noms d'étudiants : réimport d'un fichier corrigé, puis
// correction manuelle. Données 100 % fictives.
import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, signUp } from "./helpers/account";
import { teacherClient } from "./helpers/data";

async function importCsv(page: Page, csv: string) {
  await page.getByLabel("Fichier").setInputFiles({ name: "liste.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Vérifier le fichier" }).click();
  await page.getByRole("button", { name: /^Importer/ }).click();
  await expect(page.getByText("Importation terminée")).toBeVisible();
}

test("corriger les noms : réimport avec « Remplacer par les noms du fichier », puis « Modifier »", async ({ page }) => {
  const email = await signUp(page, "Noms");
  const instId = await createWorkspace(page, "Université fictive — Noms");
  const { client } = await teacherClient(email);
  const { data: sem } = await client
    .from("semesters")
    .insert({ institution_id: instId, label: "S1", start_date: "2026-09-01", end_date: "2027-01-31" })
    .select("id")
    .single();
  const { data: g } = await client
    .from("groups")
    .insert({ institution_id: instId, semester_id: sem!.id, name: "G1" })
    .select("id")
    .single();

  await page.goto(`/espace/${instId}/groupes/${g!.id}`);
  await importCsv(page, "Matricule;Nom;Prénom\n20260001;Fictiff;Amina\n20260002;Fictif;Bilal\n");
  await expect(page.getByRole("cell", { name: "Fictiff" })).toBeVisible();

  // Réimport du fichier corrigé : la différence est signalée, rien n'est écrasé…
  await importCsv(page, "Matricule;Nom;Prénom\n20260001;Fictif;Amina\n20260002;Fictif;Bilal\n");
  await expect(page.getByText("20260001 : enregistré « Fictiff Amina », fichier « Fictif Amina »")).toBeVisible();
  // … jusqu'à ce que l'admin valide le remplacement.
  await page.getByRole("button", { name: "Remplacer par les noms du fichier (1)" }).click();
  await expect(page.getByText("1 nom(s) corrigé(s).")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Fictiff" })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /20260001/ })).toContainText("Fictif");

  // Correction manuelle d'un seul étudiant.
  const row = page.getByRole("row", { name: /20260002/ });
  await row.getByText("Modifier", { exact: true }).click();
  await row.getByLabel("Prénom").fill("Bilel");
  await row.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("cell", { name: "Bilel" })).toBeVisible();

  // La correction est inscrite au journal d'audit (ancien et nouveau nom).
  const { data: audit } = await client
    .from("audit_log")
    .select("old_values, new_values")
    .eq("table_name", "students")
    .eq("action", "UPDATE");
  expect(audit?.some((a) => (a.old_values as { first_name: string }).first_name === "Bilal" && (a.new_values as { first_name: string }).first_name === "Bilel")).toBe(true);
});
