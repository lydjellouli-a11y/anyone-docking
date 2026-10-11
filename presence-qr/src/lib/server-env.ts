// Variables d'environnement SECRÈTES — serveur uniquement.
// `server-only` fait échouer la compilation si ce fichier est importé par
// un composant exécuté dans le navigateur.
import "server-only";

function required(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(
      `Variable d'environnement serveur manquante ou trop courte : ${name} (voir .env.example)`,
    );
  }
  return value;
}

export const serverEnv = {
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  /** Sert à signer les passages de scan et à « hacher » IP et appareils. */
  get checkinSecret() {
    return required("CHECKIN_SECRET", 32);
  },
  /** Adresse publique du site (ex. https://presence.exemple.dz), pour le QR. */
  get siteUrl() {
    return process.env.SITE_URL?.replace(/\/$/, "") || null;
  },
};
