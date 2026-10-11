// Point d'arrivée des liens envoyés par e-mail (confirmation de compte,
// réinitialisation de mot de passe). Le jeton est vérifié auprès de Supabase,
// puis l'utilisatrice est redirigée vers une page INTERNE uniquement.
import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

const ALLOWED_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "email_change"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // 1) Liens de nos modèles d'e-mails (token_hash) : fonctionnent sur tout appareil.
  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // 2) Liens des e-mails par défaut de Supabase (flux « PKCE », paramètre code) :
  //    fonctionnent dans le navigateur où la demande a été faite.
  if (code && code.length <= 200) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  const url = new URL("/connexion", request.url);
  url.searchParams.set("erreur", "lien");
  return NextResponse.redirect(url);
}
