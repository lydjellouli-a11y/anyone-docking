// Client Supabase pour le NAVIGATEUR (composants "use client").
// Il agit avec l'identité de l'utilisateur connecté : la RLS s'applique.
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey);
}
