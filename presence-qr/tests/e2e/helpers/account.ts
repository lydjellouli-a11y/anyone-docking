import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Fictif2026Test";

export async function signUp(page: Page, name: string) {
  const email = `${name.toLowerCase()}.${randomUUID().slice(0, 8)}@exemple.test`;
  await page.goto("/inscription");
  await page.getByLabel("Nom complet").fill(`${name} Fictif`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmer le mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/espace$/);
  return email;
}

export async function createWorkspace(page: Page, name: string): Promise<string> {
  await page.getByLabel(/Nom de l'espace/).fill(name);
  await page.getByRole("button", { name: "Créer l'espace de travail" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return page.url().split("/espace/")[1];
}

