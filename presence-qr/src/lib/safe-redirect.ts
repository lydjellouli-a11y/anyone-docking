/**
 * N'accepte qu'un chemin interne (« /espace/... ») comme destination de
 * redirection, pour éviter qu'un lien piégé renvoie vers un site externe
 * (« //site-malveillant.example » ou « https://... »).
 */
export function safeNextPath(value: string | null | undefined, fallback = "/espace"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
