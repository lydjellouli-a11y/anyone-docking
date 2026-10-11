import type { Metadata } from "next";
import { submitFallbackCode } from "../p/actions";
import { CheckinForm } from "../p/CheckinForm";

export const metadata: Metadata = { title: "Code de séance — Présence QR", robots: { index: false, follow: false } };

// Procédure de secours : si le QR code ne peut pas être scanné, l'étudiant
// tape l'adresse courte /code et le code à 6 chiffres affiché au tableau.
export default function CodePage() {
  return (
    <main className="container narrow">
      <h1>Pointage avec le code de séance</h1>
      <CheckinForm action={submitFallbackCode} withCode />
    </main>
  );
}
