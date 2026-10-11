import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <h1>Page introuvable</h1>
      <p>Cette page n&apos;existe pas, ou vous n&apos;avez pas l&apos;autorisation de la consulter.</p>
      <p>
        <Link href="/espace">Retour à mes espaces</Link>
      </p>
    </main>
  );
}
