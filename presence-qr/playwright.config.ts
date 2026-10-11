import { defineConfig } from "@playwright/test";

// Tests de bout en bout dans un vrai navigateur, contre Supabase LOCAL.
// Prérequis : `npx supabase start` et un fichier .env.local (voir .env.example).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    locale: "fr-FR",
    timezoneId: "Africa/Algiers",
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
