import { describe, expect, it } from "vitest";
import { TICKET_MAX_AGE_MS, clientIp, pseudonymize, signTicket, verifyTicket } from "./crypto";

const SECRET = "secret-de-test-fictif-0123456789abcdef";
const ticket = { sessionId: "a0000000-0000-4000-8000-0000000000d1", source: "qr" as const, issuedAt: 1_000_000 };

describe("passage de scan signé", () => {
  it("est accepté s'il est intact et récent", () => {
    expect(verifyTicket(SECRET, signTicket(SECRET, ticket), ticket.issuedAt + 60_000)).toEqual(ticket);
  });

  it("est refusé après 3 minutes", () => {
    expect(verifyTicket(SECRET, signTicket(SECRET, ticket), ticket.issuedAt + TICKET_MAX_AGE_MS + 1)).toBeNull();
  });

  it("est refusé si on modifie la séance", () => {
    const [, sig] = signTicket(SECRET, ticket).split(".");
    const forged = Buffer.from(JSON.stringify({ ...ticket, sessionId: "autre" })).toString("base64url");
    expect(verifyTicket(SECRET, `${forged}.${sig}`, ticket.issuedAt)).toBeNull();
  });

  it("est refusé s'il est signé avec une autre clé", () => {
    expect(verifyTicket(SECRET, signTicket("autre-cle-fictive-0123456789abcdef", ticket), ticket.issuedAt)).toBeNull();
  });

  it.each(["", "abc", "a.b.c", "....", "%%%.%%%"])("refuse une valeur malformée « %s »", (v) => {
    expect(verifyTicket(SECRET, v, ticket.issuedAt)).toBeNull();
  });
});

describe("pseudonymisation", () => {
  it("ne contient pas la donnée d'origine et reste stable", () => {
    const h = pseudonymize(SECRET, "ip", "192.0.2.10");
    expect(h).not.toContain("192");
    expect(h).toBe(pseudonymize(SECRET, "ip", "192.0.2.10"));
    expect(h).not.toBe(pseudonymize(SECRET, "appareil", "192.0.2.10"));
  });
});

describe("clientIp", () => {
  it("prend la première adresse de x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }))).toBe("198.51.100.7");
  });
  it("renvoie null sans en-tête", () => {
    expect(clientIp(new Headers())).toBeNull();
  });
});
