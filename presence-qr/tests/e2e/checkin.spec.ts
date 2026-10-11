// Phase 5 dans de vrais navigateurs : séance ouverte par l'enseignante,
// pointage par des étudiants sur d'autres « téléphones », corrections et
// clôture. Données 100 % fictives.
import { expect, test, type Browser } from "@playwright/test";
import { createWorkspace, signUp } from "./helpers/account";
import { seedTdSession } from "./helpers/data";

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function studentPage(browser: Browser) {
  return (await browser.newContext(PHONE)).newPage();
}

test("séance complète : QR, code de secours, doublon, correction justifiée, clôture", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const teacherErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && teacherErrors.push(m.text()));
  page.on("pageerror", (e) => teacherErrors.push(e.message));
  const email = await signUp(page, "Prof");
  const instId = await createWorkspace(page, "Université fictive — Pointage");
  const { sessionId } = await seedTdSession(email, instId);
  const sessionUrl = `/espace/${instId}/seances/${sessionId}`;

  // --- L'enseignante ouvre la séance : QR, compte à rebours, code de secours
  await page.goto(sessionUrl);
  await page.getByRole("button", { name: "Ouvrir la séance et afficher le QR code" }).click();
  const qr = page.getByRole("img", { name: "QR code de pointage" });
  await expect(qr).toBeVisible();
  await expect(page.getByText(/Pointage : 1[45]:\d\d restantes/)).toBeVisible();
  const qrUrl = (await qr.getAttribute("data-checkin-url"))!;
  expect(qrUrl).toMatch(/\/p\/[A-Za-z0-9_-]{12}\?t=/);
  const fallbackCode = (await page.locator(".fallback .code").textContent())!;
  expect(fallbackCode).toMatch(/^\d{6}$/);
  await expect(page.getByRole("heading", { name: "Présents : 0 / 2" })).toBeVisible();

  // --- Étudiant 1 : scan du QR puis matricule (avec espaces)
  const s1 = await studentPage(browser);
  const studentErrors: string[] = [];
  s1.on("console", (m) => m.type() === "error" && studentErrors.push(m.text()));
  s1.on("pageerror", (e) => studentErrors.push(e.message));
  await s1.goto(qrUrl);
  await s1.getByLabel("Votre matricule").fill("2026 0001");
  await s1.getByRole("button", { name: "Valider ma présence" }).click();
  await expect(s1.getByRole("status")).toContainText(/Présence enregistrée à \d\d:\d\d \(A\. F\*\*\*\)/);
  expect(studentErrors).toEqual([]);

  // --- Le même étudiant recommence : doublon détecté
  await s1.goto(qrUrl);
  await s1.getByLabel("Votre matricule").fill("20260001");
  await s1.getByRole("button", { name: "Valider ma présence" }).click();
  await expect(s1.getByRole("status")).toContainText("déjà enregistrée");

  // --- Un étudiant d'un autre groupe : refusé
  const s3 = await studentPage(browser);
  await s3.goto(qrUrl);
  await s3.getByLabel("Votre matricule").fill("20260003");
  await s3.getByRole("button", { name: "Valider ma présence" }).click();
  await expect(s3.locator("p[role=alert]")).toContainText("Matricule non reconnu");

  // --- QR falsifié : refusé dès l'ouverture de la page
  await s3.goto(qrUrl.replace(/t=[^&]+/, "t=jeton-invente"));
  await expect(s3.locator("p[role=alert]")).toContainText("expiré");
  await expect(s3.getByLabel("Votre matricule")).toHaveCount(0);

  // --- Étudiant 2 : procédure de secours avec le code à 6 chiffres
  const s2 = await studentPage(browser);
  await s2.goto("/code");
  await s2.getByLabel(/Code de la séance/).fill(fallbackCode);
  await s2.getByLabel("Votre matricule").fill("20260002");
  await s2.getByRole("button", { name: "Valider ma présence" }).click();
  await expect(s2.getByRole("status")).toContainText("Présence enregistrée");

  // --- Tableau en direct de l'enseignante (mise à jour automatique)
  await expect(page.getByRole("heading", { name: "Présents : 2 / 2" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("row", { name: /20260002/ })).toContainText("code");

  // --- Le QR change toutes les 20 secondes
  await expect.poll(async () => qr.getAttribute("data-checkin-url"), { timeout: 30_000 }).not.toBe(qrUrl);

  // --- Prolongation d'un clic
  await page.getByRole("button", { name: "Prolonger de 5 minutes" }).click();
  await expect(page.getByText("Pointage prolongé de 5 minutes.")).toBeVisible();

  // --- Correction justifiée : Bilal n'est pas en salle
  const row = page.getByRole("row", { name: /20260002/ });
  await row.getByText("Modifier", { exact: true }).click();
  await row.getByLabel("Nouvel état").selectOption("absent");
  await row.getByLabel("Justification").fill("Absent en salle lors de la vérification");
  await row.getByRole("button", { name: "Enregistrer" }).click();
  await expect(row).toContainText("Absent", { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Présents : 1 / 2" })).toBeVisible();

  // --- Clôture
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clôturer la séance" }).click();
  await expect(page.getByText("Clôturée")).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code de pointage" })).toHaveCount(0);

  // --- Après la clôture, l'ancien QR ne fonctionne plus
  await s3.goto(qrUrl);
  await expect(s3.locator("p[role=alert]")).toContainText("terminé");

  // --- Feuille d'émargement (secours)
  await page.goto(`${sessionUrl}/feuille`);
  await expect(page.getByRole("heading", { name: "Feuille d'émargement" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "20260001" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "20260003" })).toHaveCount(0);

  // --- Aucune erreur dans la console de l'enseignante (hydratation, JS…)
  expect(teacherErrors).toEqual([]);

  // --- Un autre compte ne peut pas ouvrir la séance
  const intruder = await (await browser.newContext()).newPage();
  await signUp(intruder, "Intrus");
  await intruder.goto(sessionUrl);
  await expect(intruder.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
});

test("la page étudiante et la page « code » ne produisent aucune erreur console", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/code");
  await page.goto("/p/AAAAAAAAAAAA?t=x");
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});
