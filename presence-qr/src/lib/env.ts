// Variables d'environnement PUBLIQUES (visibles dans le navigateur, c'est normal :
// la clé « publishable » ne donne accès qu'à ce que la RLS autorise).
// La clé secrète Supabase n'est JAMAIS lue ici : elle ne sera utilisée que
// dans un module serveur dédié (phase 5), marqué `server-only`.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
};
