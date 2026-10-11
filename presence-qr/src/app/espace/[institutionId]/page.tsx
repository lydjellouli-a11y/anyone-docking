import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { roleLabel } from "@/lib/roles";

export const metadata: Metadata = { title: "Espace de travail — Présence QR" };

export default async function InstitutionPage({ params }: PageProps<"/espace/[institutionId]">) {
  const { institutionId } = await params;
  if (!z.uuid().safeParse(institutionId).success) notFound();

  const { supabase, user } = await requireUser();

  // Si l'utilisatrice n'est pas membre, la RLS ne renvoie rien → page 404.
  // On ne révèle même pas que l'établissement existe.
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
  const roles = (memberships ?? []).map((m) => roleLabel(m.role));

  return (
    <main className="container">
      <p>
        <Link href="/espace">← Mes espaces</Link>
      </p>
      <h1>{institution.name}</h1>
      <p className="muted">Vos rôles : {roles.join(", ") || "aucun"}</p>
      <p>
        Prochaines étapes (phase 4) : semestres, modules, groupes, importation des listes
        d&apos;étudiants et création des séances.
      </p>
    </main>
  );
}
