// Variables d'environnement SECRÈTES — serveur uniquement.
// `server-only` fait échouer la compilation si ce fichier est importé par
// un composant exécuté dans le navigateur.
import "server-only";
import { createHmac } from "node:crypto";

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
  /**
   * Sert à signer les passages de scan et à « hacher » IP et appareils.
   * Si CHECKIN_SECRET n'est pas défini, il est dérivé de la clé secrète
   * Supabase (déjà aléatoire et réservée au serveur) : une variable de moins
   * à configurer.
   */
  get checkinSecret() {
    const explicit = process.env.CHECKIN_SECRET;
    if (explicit) return required("CHECKIN_SECRET", 32);
    return createHmac("sha256", required("SUPABASE_SECRET_KEY", 20)).update("presence-qr:checkin").digest("hex");
  },
  /** Adresse publique du site (ex. https://presence.exemple.dz), pour le QR. */
  get siteUrl() {
    return process.env.SITE_URL?.replace(/\/$/, "") || null;
  },
};
