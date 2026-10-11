import "server-only";
import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { serverEnv } from "@/lib/server-env";
import { clientIp, pseudonymize, signTicket } from "./crypto";

const DEVICE_COOKIE = "pqr_appareil";

/**
 * Empreintes de l'IP et de l'appareil pour la limitation des abus.
 * L'appareil est repéré par un identifiant aléatoire posé en cookie (aucune
 * « empreinte » du téléphone n'est calculée). `create` n'est possible que
 * dans une Server Action (écriture de cookie).
 */
export async function requestFingerprints({ create }: { create: boolean }) {
  const secret = serverEnv.checkinSecret;
  const jar = await cookies();
  let device = jar.get(DEVICE_COOKIE)?.value;
  if (!device && create) {
    device = randomUUID();
    jar.set(DEVICE_COOKIE, device, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
    });
  }
  const ip = clientIp(await headers());
  return {
    ipHash: ip ? pseudonymize(secret, "ip", ip) : null,
    deviceRef: device ? pseudonymize(secret, "appareil", device) : null,
  };
}

/**
 * Les fonctions SQL acceptent NULL pour ces paramètres, mais les types
 * générés par Supabase les déclarent comme `string` obligatoires.
 */
export function sqlNullable(value: string | null | undefined): string {
  return (value ?? null) as unknown as string;
}

/** Délivre le passage signé au moment où un scan valide est constaté. */
export function issueScanTicket(sessionId: string, source: "qr" | "code_secours"): string {
  return signTicket(serverEnv.checkinSecret, { sessionId, source, issuedAt: Date.now() });
}
