// Phase 6 dans un vrai navigateur : historique cumulé, seuil de 3 absences
// non justifiées, exports Excel et CSV. Données 100 % fictives.
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import { createWorkspace, signUp } from "./helpers/account";
import { seedTdSession, teacherClient } from "./helpers/data";

test("historique : seuil atteint, export Excel et CSV, accès refusé à un autre compte", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Historique");
  const instId = await createWorkspace(page, "Université fictive — Historique");
  const { assignmentId, sessionId } = await seedTdSession(email, instId);
  const { client } = await teacherClient(email);

  // 3 séances clôturées : Amina présente (puis excusée la 3e), Bilal jamais là.
  const { data: extra } = await client
    .from("class_sessions")
    .insert(
      ["2026-10-05T08:00:00Z", "2026-10-12T08:00:00Z"].map((d) => ({
        institution_id: instId,
        assignment_id: assignmentId,
        scheduled_at: d,
      })),
    )
    .select("id");
  const { data: amina } = await client.from("students").select("id").eq("matricule", "20260001").single();
  const ids = [...extra!.map((s) => s.id), sessionId];
  for (const [i, id] of ids.entries()) {
    expect((await client.rpc("open_session", { p_session_id: id, p_minutes: 15 })).error).toBeNull();
    const status = i === 2 ? "excuse" : "present";
    expect(
      (await client.rpc("set_attendance", { p_session_id: id, p_student_id: amina!.id, p_status: status, p_reason: "Appel manuel" }))
        .error,
    ).toBeNull();
    expect((await client.rpc("close_session", { p_session_id: id })).error).toBeNull();
  }

  // --- Page historique
  await page.goto(`/espace/${instId}/enseignements/${assignmentId}/historique`);
  await expect(page.getByText("3 séance(s) clôturée(s)")).toBeVisible();
  await expect(page.locator("p[role=alert]")).toContainText("1 étudiant(s) ont atteint le seuil de 3 absences non justifiées");
  const bilalRow = page.getByRole("row", { name: /20260002/ });
  await expect(bilalRow).toHaveClass(/over-threshold/);
  await expect(bilalRow).toContainText("100 %");
  const aminaRow = page.getByRole("row", { name: /20260001/ });
  await expect(aminaRow).not.toHaveClass(/over-threshold/);
  await expect(page.getByRole("columnheader", { name: "05/10" })).toBeVisible();

  // --- Tableau de bord : indicateur de seuil
  await page.goto(`/espace/${instId}`);
  await expect(page.getByText(/3 séance\(s\) clôturée\(s\) — présence 33 %/)).toBeVisible();
  await expect(page.getByText("⚠ 1 étudiant(s) à 3 absences ou plus")).toBeVisible();

  // --- Export Excel : téléchargement puis relecture du fichier
  await page.goto(`/espace/${instId}/enseignements/${assignmentId}/historique`);
  const [xlsxDl] = await Promise.all([page.waitForEvent("download"), page.getByText("Télécharger (Excel .xlsx)").click()]);
  expect(xlsxDl.suggestedFilename()).toMatch(/^assiduite_Cytologie_td_G1_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync((await xlsxDl.path())!).buffer as ArrayBuffer);
  const ws = wb.getWorksheet("Assiduité")!;
  expect(ws.getRow(8).values).toContain("05/10/2026");
  const rows = [9, 10].map((n) => ws.getRow(n));
  const bilal = rows.find((r) => r.getCell(1).value === "20260002")!;
  expect(bilal.getCell(8).value).toBe(3); // colonne « Absences non justifiées »
  expect(bilal.getCell(11).value).toBe("ATTEINT"); // colonne « Seuil »

  // --- Export CSV
  const [csvDl] = await Promise.all([page.waitForEvent("download"), page.getByText("Télécharger (CSV)").click()]);
  const csv = readFileSync((await csvDl.path())!, "utf8");
  expect(csv.startsWith("\uFEFFMatricule;Nom;Prénom;05/10/2026;")).toBe(true);
  const aminaLine = csv.split("\r\n").find((l) => l.startsWith("20260001;Fictif;Amina;"))!;
  expect(aminaLine.endsWith(";2;0;1;33;")).toBe(true); // 2 présences, 1 excusée
  expect(csv).toContain(";A;A;A;0;3;0;100;ATTEINT");

  // --- Un autre compte : page et export refusés (404)
  const other = await (await browser.newContext()).newPage();
  await signUp(other, "Curieux");
  await other.goto(`/espace/${instId}/enseignements/${assignmentId}/historique`);
  await expect(other.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  const res = await other.request.get(`/espace/${instId}/enseignements/${assignmentId}/export?format=csv`);
  expect(res.status()).toBe(404);
  expect(await res.text()).not.toContain("20260001");
  // Sans être connecté : redirection vers la connexion, aucune donnée.
  const anon = await browser.newContext();
  const anonRes = await anon.request.get(`/espace/${instId}/enseignements/${assignmentId}/export?format=csv`);
  expect(await anonRes.text()).not.toContain("20260001");
});
