// Rafraîchit la session Supabase à chaque requête (appelé par src/proxy.ts).
// Les jetons de connexion expirent régulièrement : ce code les renouvelle et
// met à jour les cookies avant que la page ne soit rendue.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Ne rien placer entre la création du client et cet appel : c'est lui qui
  // déclenche le renouvellement de session.
  const { data } = await supabase.auth.getUser();

  // Vérification « optimiste » : sans session, l'espace enseignant renvoie
  // vers la connexion. La VRAIE protection reste la vérification dans chaque
  // page (requireUser) et la RLS dans la base.
  if (!data.user && request.nextUrl.pathname.startsWith("/espace")) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
