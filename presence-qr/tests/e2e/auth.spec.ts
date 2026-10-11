// Parcours enseignant dans un vrai navigateur. Données 100 % fictives.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "Fictif2026Test";

async function signUp(page: Page, name: string) {
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

async function createWorkspace(page: Page, name: string): Promise<string> {
  await page.getByLabel(/Nom de l'espace/).fill(name);
  await page.getByRole("button", { name: "Créer l'espace de travail" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return page.url().split("/espace/")[1];
}

test("sans session, l'espace enseignant redirige vers la connexion", async ({ page }) => {
  await page.goto("/espace");
  await expect(page).toHaveURL(/\/connexion$/);
});

test("les en-têtes de sécurité sont présents", async ({ request }) => {
  const res = await request.get("/connexion");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});

test("un mot de passe faible est refusé à l'inscription", async ({ page }) => {
  await page.goto("/inscription");
  await page.getByLabel("Nom complet").fill("Faible Fictif");
  await page.getByLabel("Adresse e-mail").fill("faible@exemple.test");
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse");
  await page.getByLabel("Confirmer le mot de passe").fill("motdepasse");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Le mot de passe doit contenir");
});

test("inscription, espace de travail, déconnexion, reconnexion et isolation", async ({ browser }) => {
  // --- Alice : inscription et création de son espace
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const aliceEmail = await signUp(alice, "Alice");
  const instA = await createWorkspace(alice, "Université fictive A (E2E)");
  await expect(alice.getByText("Vos rôles : Admin, Enseignant(e)")).toBeVisible();

  // --- Déconnexion puis mauvais mot de passe
  await alice.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(alice).toHaveURL(/\/connexion$/);
  await alice.getByLabel("Adresse e-mail").fill(aliceEmail);
  await alice.getByLabel("Mot de passe").fill("MauvaisMotDePasse1");
  await alice.getByRole("button", { name: "Se connecter" }).click();
  await expect(alice.locator("p[role=alert]")).toHaveText("E-mail ou mot de passe incorrect.");

  // --- Reconnexion correcte : l'espace est listé
  await alice.getByLabel("Mot de passe").fill(PASSWORD);
  await alice.getByRole("button", { name: "Se connecter" }).click();
  await expect(alice).toHaveURL(/\/espace$/);
  await expect(alice.getByRole("link", { name: "Université fictive A (E2E)" })).toBeVisible();

  // --- Bob : autre compte, autre espace ; il tente d'ouvrir l'espace d'Alice
  const bobCtx = await browser.newContext();
  const bob = await bobCtx.newPage();
  await signUp(bob, "Bob");
  await createWorkspace(bob, "Université fictive B (E2E)");
  await bob.goto(`/espace/${instA}`);
  await expect(bob.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await expect(bob.getByText("Université fictive A (E2E)")).toHaveCount(0);

  await aliceCtx.close();
  await bobCtx.close();
});

// Mailpit (inclus dans Supabase local) intercepte les e-mails envoyés.
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function lastEmailLink(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json()) as {
        HTML: string;
      };
      const href = msg.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
      if (href) return href.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Aucun e-mail reçu pour ${to}`);
}

test("mot de passe oublié : lien reçu par e-mail, nouveau mot de passe, reconnexion", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await signUp(page, "Oubli");
  await page.getByRole("button", { name: "Se déconnecter" }).click();

  await page.goto("/mot-de-passe-oublie");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir un lien de réinitialisation" }).click();
  await expect(page.locator("p[role=status]")).toContainText("Si un compte existe");

  // Le lien est ouvert dans un AUTRE navigateur (comme sur un autre appareil).
  const link = await lastEmailLink(email);
  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await expect(other).toHaveURL(/\/compte\/nouveau-mot-de-passe$/);
  const newPassword = "NouveauFictif2027";
  await other.getByLabel("Nouveau mot de passe").fill(newPassword);
  await other.getByLabel("Confirmer le mot de passe").fill(newPassword);
  await other.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
  await expect(other).toHaveURL(/\/espace$/);

  // L'ancien mot de passe ne fonctionne plus, le nouveau oui.
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("E-mail ou mot de passe incorrect.");
  await page.getByLabel("Mot de passe").fill(newPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/espace$/);

  // Un lien déjà utilisé ne fonctionne plus.
  const reused = await (await browser.newContext()).newPage();
  await reused.goto(link);
  await expect(reused).toHaveURL(/\/connexion\?erreur=lien$/);
});

test("un lien de confirmation falsifié est refusé", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=faux&type=recovery&next=https://exemple.test");
  await expect(page).toHaveURL(/\/connexion\?erreur=lien$/);
  await expect(page.locator("p[role=alert]")).toContainText("lien est invalide");
});
