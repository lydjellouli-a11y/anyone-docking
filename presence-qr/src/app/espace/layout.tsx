import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { signOut } from "./actions";

export default async function EspaceLayout({ children }: LayoutProps<"/espace">) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <>
      <header className="topbar">
        <Link href="/espace" className="brand">
          Présence QR
        </Link>
        <span className="muted">{profile?.full_name || user.email}</span>
        <form action={signOut}>
          <button type="submit" className="link-button">
            Se déconnecter
          </button>
        </form>
      </header>
      {children}
    </>
  );
}
