import type { Metadata } from "next";
import Link from "next/link";
import { FormMessage } from "@/components/FormMessage";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion — Présence QR" };

export default async function ConnexionPage({ searchParams }: PageProps<"/connexion">) {
  const { erreur } = await searchParams;
  return (
    <main className="container narrow">
      <h1>Connexion enseignant</h1>
      {erreur === "lien" && (
        <FormMessage error="Ce lien est invalide ou a expiré. Demandez-en un nouveau." />
      )}
      <LoginForm />
      <p>
        <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
      </p>
      <p className="muted">
        Pas encore de compte ? <Link href="/inscription">Créer un compte</Link>
      </p>
    </main>
  );
}
