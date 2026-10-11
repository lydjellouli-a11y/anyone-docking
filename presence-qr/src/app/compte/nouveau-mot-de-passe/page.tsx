import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: "Nouveau mot de passe — Présence QR" };

export default async function NouveauMotDePassePage() {
  // On arrive ici après avoir cliqué sur le lien reçu par e-mail : la
  // session de récupération doit être active.
  await requireUser();
  return (
    <main className="container narrow">
      <h1>Choisir un nouveau mot de passe</h1>
      <NewPasswordForm />
    </main>
  );
}
