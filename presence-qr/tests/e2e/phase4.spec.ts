// Phase 4 dans un vrai navigateur : organisation pédagogique, importation des
// listes et planification des séances. Reproduit un cas réel avec des
// données 100 % FICTIVES : section L1 (cours de cytologie) avec TD G1 et G3,
// séances hebdomadaires le mercredi.
import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, signUp } from "./helpers/account";

test.describe.configure({ mode: "serial" });

async function addViaForm(page: Page, summary: string, fill: () => Promise<void>, submit: string, success: string) {
  const details = page.locator("details", { has: page.locator("summary", { hasText: summary }) });
  if ((await details.getAttribute("open")) === null) {
    await details.locator("summary").click();
  }
  await fill();
  await details.getByRole("button", { name: submit }).click();
  // Le message doit être VISIBLE (le bloc ne doit pas se refermer après l'ajout).
  await expect(details.locator("p[role=status]")).toHaveText(success);
  await expect(details.locator("p[role=status]")).toBeVisible();
}

async function xlsxBuffer(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Liste");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("organisation, import et planification (cas L1 cytologie)", async ({ page, browser }) => {
  await signUp(page, "Enseignante");
  const instId = await createWorkspace(page, "Université fictive — Biologie");
  const base = `/espace/${instId}`;

  // --- Semestre et modules
  await page.getByRole("link", { name: "Semestres et modules" }).first().click();
  await addViaForm(
    page,
    "Ajouter un semestre",
    async () => {
      await page.getByLabel("Libellé").fill("2026-2027 S1");
      await page.getByLabel("Date de début").fill("2026-09-20");
      await page.getByLabel("Date de fin").fill("2027-01-15");
    },
    "Ajouter le semestre",
    "Semestre ajouté.",
  );
  await expect(page.getByRole("cell", { name: "20/09/2026" })).toBeVisible();
  await addViaForm(
    page,
    "Ajouter un module",
    async () => {
      await page.getByLabel("Code").fill("cyto");
      await page.getByLabel("Intitulé").fill("Cytologie");
    },
    "Ajouter le module",
    "Module ajouté.",
  );
  await expect(page.getByRole("cell", { name: "CYTO", exact: true })).toBeVisible();

  // --- Section L1 et groupes G1, G3
  await page.goto(`${base}/groupes`);
  await addViaForm(
    page,
    "Créer une section ou un groupe",
    async () => {
      await page.getByLabel("Section (pour les cours)").check();
      await page.getByLabel("Nom", { exact: true }).fill("L1 Biologie — Section 1");
      await page.getByLabel("Niveau (facultatif)").fill("L1");
    },
    "Créer",
    "Section créée.",
  );
  for (const g of ["G1", "G3"]) {
    await addViaForm(
      page,
      "Créer une section ou un groupe",
      async () => {
        await page.getByLabel("Groupe (TD / TP)").check();
        await page.getByLabel("Nom", { exact: true }).fill(g);
        await page.getByLabel("Section de rattachement (pour un groupe)").selectOption({ label: "L1 Biologie — Section 1 (2026-2027 S1)" });
      },
      "Créer",
      "Groupe créé.",
    );
  }

  // --- Import CSV « Excel français » (;) avec lignes de titre dans G1
  await page.goto(`${base}/groupes`);
  await page.getByRole("link", { name: "G1", exact: true }).click();
  const csv = "﻿Université fictive;;\nListe L1 G1;;\nMatricule;Nom;Prénom\n2026 0001;Fictif;Amina\n20260002;Fictif;Bilal\n";
  await page.getByLabel("Fichier").setInputFiles({ name: "g1.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Vérifier le fichier" }).click();
  await expect(page.getByText("2 étudiant(s) lu(s)")).toBeVisible();
  await page.getByRole("button", { name: "Importer 2 étudiant(s)" }).click();
  await expect(page.getByText("Importation terminée : 2 ajouté(s) au groupe (dont 2 nouveau(x))")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Liste des étudiants (2)" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "20260001" })).toBeVisible();

  // --- Fichier avec erreurs : rien n'est importé
  const bad = "Matricule;Nom;Prénom\n20260009;Fictif;Ok\n20260009;Fictif;Doublon\n";
  await page.getByLabel("Fichier").setInputFiles({ name: "erreurs.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
  await page.getByRole("button", { name: "Vérifier le fichier" }).click();
  await expect(page.getByText("Ligne 3 : Matricule 20260009 en double")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Importer/ })).toHaveCount(0);

  // --- Import XLSX dans G3 (matricules numériques)
  await page.goto(`${base}/groupes`);
  await page.getByRole("link", { name: "G3", exact: true }).click();
  const xlsx = await xlsxBuffer([
    ["Matricule", "Nom", "Prénom"],
    [20260003, "Fictif", "Chahinez"],
    [20260004, "Fictif", "Djamel"],
    [20260005, "Fictif", "Elias"],
  ]);
  await page.getByLabel("Fichier").setInputFiles({
    name: "g3.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: xlsx,
  });
  await page.getByRole("button", { name: "Vérifier le fichier" }).click();
  await page.getByRole("button", { name: "Importer 3 étudiant(s)" }).click();
  await expect(page.getByRole("heading", { name: "Liste des étudiants (3)" })).toBeVisible();

  // --- La section réunit les deux groupes
  await page.getByRole("link", { name: "L1 Biologie — Section 1" }).click();
  await expect(page.getByRole("heading", { name: "Liste des étudiants (5)" })).toBeVisible();

  // --- Enseignements : cours (section) et TD G1
  await page.goto(`${base}/enseignements`);
  await addViaForm(
    page,
    "Ajouter un enseignement",
    async () => {
      await page.getByLabel("Section ou groupe").selectOption({ label: "Section L1 Biologie — Section 1 (2026-2027 S1)" });
      await page.getByLabel("Type").selectOption("cours");
    },
    "Ajouter",
    "Enseignement ajouté.",
  );
  await page.getByRole("link", { name: "Cytologie — Cours — L1 Biologie — Section 1" }).click();

  // --- Séances hebdomadaires le mercredi à 10:00 (heure d'Alger)
  await addViaForm(
    page,
    "Planifier des séances chaque semaine",
    async () => {
      await page.getByLabel("Jour").selectOption({ label: "Mercredi" });
      await page.getByLabel("Heure de début (heure d'Alger)").fill("10:00");
      await page.getByLabel("Du").fill("2026-10-12");
      await page.getByLabel("Au").fill("2026-11-01");
    },
    "Planifier les séances",
    "3 séance(s) planifiée(s).",
  );
  for (const d of ["14/10/2026 10:00", "21/10/2026 10:00", "28/10/2026 10:00"]) {
    await expect(page.getByRole("cell", { name: d })).toBeVisible();
  }

  // --- Annulation d'une séance
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("row", { name: /21\/10\/2026/ }).getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("row", { name: /21\/10\/2026/ })).toContainText("Annulée");

  // --- Un autre compte ne peut pas ouvrir ces pages
  const other = await (await browser.newContext()).newPage();
  await signUp(other, "Intrus");
  for (const path of [base, `${base}/groupes`, `${base}/enseignements`, `${base}/parametres`]) {
    await other.goto(path);
    await expect(other.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  }
});
