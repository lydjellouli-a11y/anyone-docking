// Client Supabase pour le NAVIGATEUR (composants "use client").
// Il agit avec l'identité de l'utilisateur connecté : la RLS s'applique.
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

export function createClient() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey);
}
