import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Mot de passe oublié — Présence QR" };

export default function MotDePasseOubliePage() {
  return (
    <main className="container narrow">
      <h1>Mot de passe oublié</h1>
      <ForgotPasswordForm />
      <p>
        <Link href="/connexion">Retour à la connexion</Link>
      </p>
    </main>
  );
}
