// Les pages publiques ne doivent produire aucune erreur dans la console du
// navigateur (erreurs JavaScript, problèmes d'hydratation React…).
import { expect, test } from "@playwright/test";

for (const path of ["/", "/connexion", "/inscription", "/mot-de-passe-oublie"]) {
  test(`aucune erreur console sur ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
}
