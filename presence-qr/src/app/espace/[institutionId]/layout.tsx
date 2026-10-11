import Link from "next/link";
import { getInstitutionContext } from "@/lib/institution";

export default async function InstitutionLayout({ children, params }: LayoutProps<"/espace/[institutionId]">) {
  const { institutionId } = await params;
  const { institution, isAdmin } = await getInstitutionContext(institutionId);
  const base = `/espace/${institution.id}`;

  return (
    <div className="container">
      <p className="muted breadcrumb">
        <Link href="/espace">Mes espaces</Link> › {institution.name}
      </p>
      <nav className="subnav" aria-label="Navigation de l'espace">
        <Link href={base}>Tableau de bord</Link>
        <Link href={`${base}/enseignements`}>Enseignements</Link>
        <Link href={`${base}/groupes`}>Sections et groupes</Link>
        {isAdmin && <Link href={`${base}/parametres`}>Semestres et modules</Link>}
      </nav>
      {children}
    </div>
  );
}
