import { randomUUID, createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Tests d'API : uniquement la clé PUBLIQUE, comme un navigateur (ou un attaquant).
export const API_URL = process.env.SUPABASE_TEST_URL ?? "";
export const PUBLISHABLE_KEY = process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? "";

export function newClient(): SupabaseClient<Database> {
  return createClient<Database>(API_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Crée un compte fictif et renvoie un client connecté avec ce compte. */
export async function signUpFictiveUser(label: string) {
  const client = newClient();
  const email = `${label}.${randomUUID().slice(0, 8)}@exemple.test`;
  const { data, error } = await client.auth.signUp({
    email,
    password: "Fictif2026Test",
    options: { data: { full_name: `Utilisateur fictif ${label}` } },
  });
  if (error || !data.session || !data.user) {
    throw new Error(`Inscription impossible pour ${label} : ${error?.message ?? "pas de session"}`);
  }
  return { client, user: data.user, accessToken: data.session.access_token };
}

/** Jeton JWT forgé, signé avec une clé qui n'est PAS celle du projet. */
export function forgeJwt(sub: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ sub, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 });
  const signature = createHmac("sha256", "cle-falsifiee-par-un-attaquant-0123456789")
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function fictiveMatricule(prefix: string): string {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
