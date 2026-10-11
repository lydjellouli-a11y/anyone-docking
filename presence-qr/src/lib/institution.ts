import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

/**
 * Contexte d'un établissement pour l'utilisatrice connectée.
 * Si elle n'en est pas membre active, la RLS ne renvoie rien → 404.
 * (cache() évite de refaire les requêtes entre la mise en page et la page.)
 */
export const getInstitutionContext = cache(async (institutionId: string) => {
  if (!z.uuid().safeParse(institutionId).success) notFound();
  const { supabase, user } = await requireUser();

  const { data: institution } = await supabase
    .from("institutions")
    .select("id, name")
    .eq("id", institutionId)
    .maybeSingle();
  if (!institution) notFound();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role")
    .eq("institution_id", institutionId)
    .eq("user_id", user.id)
    .eq("status", "active");
  const roles = (memberships ?? []).map((m) => m.role);

  return { supabase, user, institution, roles, isAdmin: roles.includes("admin") };
});
