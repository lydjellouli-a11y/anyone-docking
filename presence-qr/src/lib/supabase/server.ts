// Client Supabase pour le SERVEUR (Server Components, Server Actions, Route Handlers).
// Il lit la session de l'utilisateur dans les cookies : la RLS s'applique
// exactement comme dans le navigateur. Ce n'est PAS un client « admin ».
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un Server Component : l'écriture de cookies y est
          // impossible. Le rafraîchissement de session sera fait par le proxy (phase 3).
        }
      },
    },
  });
}
