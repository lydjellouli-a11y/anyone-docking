// Client Supabase « serveur privilégié » (clé secrète) : il CONTOURNE la RLS.
// Usage strictement limité au pointage étudiant (étudiants sans compte), et
// uniquement pour appeler les deux fonctions SQL prévues à cet effet :
// validate_scan et record_checkin. Ne jamais l'utiliser pour lire ou
// modifier des tables directement.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import type { Database } from "./database.types";

export function createAdminClient() {
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
