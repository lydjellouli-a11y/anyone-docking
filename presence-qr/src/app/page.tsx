import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <h1>Présence QR</h1>
      <p>Gestion de l&apos;assiduité universitaire par QR code.</p>
      <p>
        <Link href="/connexion">Connexion enseignant</Link> ·{" "}
        <Link href="/inscription">Créer un compte</Link>
      </p>
    </main>
  );
}
