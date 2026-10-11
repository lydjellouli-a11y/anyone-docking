"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { firstError, workspaceSchema } from "@/lib/validation/auth";

export type ActionState = { error?: string };

export async function createWorkspace(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = workspaceSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: firstError(parsed.error) };
  }

  // Appel avec l'identité de l'enseignante : la fonction SQL vérifie elle-même
  // qu'elle est connectée et applique la limite de 3 espaces.
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_workspace", { p_name: parsed.data.name });
  if (error || !data) {
    if (error?.message.includes("Nombre maximal")) {
      return { error: "Vous avez atteint le nombre maximal d'espaces de travail (3)." };
    }
    return { error: "Impossible de créer l'espace de travail. Réessayez dans un instant." };
  }

  redirect(`/espace/${data}`);
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/connexion");
}
