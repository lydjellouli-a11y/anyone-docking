// Outils cryptographiques du pointage (sans dépendance à Next.js, testables).
import { createHmac, timingSafeEqual } from "node:crypto";

export type ScanTicket = { sessionId: string; source: "qr" | "code_secours"; issuedAt: number };

export const TICKET_MAX_AGE_MS = 3 * 60 * 1000; // 3 minutes pour saisir son matricule

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** « Passage » signé délivré quand le QR scanné est valide. */
export function signTicket(secret: string, ticket: ScanTicket): string {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

/** Vérifie la signature et l'âge du passage. Renvoie null s'il est invalide ou expiré. */
export function verifyTicket(secret: string, value: string, now = Date.now()): ScanTicket | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(payload, "base64url").toString()) as ScanTicket;
    if (typeof ticket.issuedAt !== "number" || now - ticket.issuedAt > TICKET_MAX_AGE_MS || ticket.issuedAt > now + 5000) {
      return null;
    }
    if (ticket.source !== "qr" && ticket.source !== "code_secours") return null;
    return ticket;
  } catch {
    return null;
  }
}

/**
 * Empreinte non réversible d'une adresse IP ou d'un identifiant d'appareil :
 * permet de limiter les abus sans conserver la donnée en clair.
 */
export function pseudonymize(secret: string, kind: "ip" | "appareil", value: string): string {
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex").slice(0, 32);
}

/** Adresse IP du client, telle que transmise par l'hébergeur (Vercel). */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || null;
  return headers.get("x-real-ip");
}
