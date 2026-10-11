import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Créer un compte — Présence QR" };

export default function InscriptionPage() {
  return (
    <main className="container narrow">
      <h1>Créer un compte enseignant</h1>
      <SignupForm />
      <p className="muted">
        Déjà un compte ? <Link href="/connexion">Se connecter</Link>
      </p>
    </main>
  );
}
