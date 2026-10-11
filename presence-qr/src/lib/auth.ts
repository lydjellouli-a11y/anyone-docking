import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Renvoie l'utilisateur connecté, ou redirige vers la page de connexion.
 * `getUser()` interroge le serveur d'authentification : on ne se fie pas
 * seulement au cookie, qui pourrait être falsifié.
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    redirect("/connexion");
  }
  return { supabase, user: data.user };
}
