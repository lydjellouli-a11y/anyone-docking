import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "./dates";

describe("dates (Africa/Algiers, JJ/MM/AAAA)", () => {
  it("formate au format JJ/MM/AAAA", () => {
    expect(formatDate("2027-03-05T10:00:00Z")).toBe("05/03/2027");
  });

  it("convertit UTC vers l'heure d'Alger (UTC+1)", () => {
    expect(formatTime("2027-03-05T07:30:00Z")).toBe("08:30");
  });

  it("change de jour correctement autour de minuit", () => {
    // 23:30 UTC le 31/12 = 00:30 à Alger le 01/01
    expect(formatDateTime("2026-12-31T23:30:00Z")).toBe("01/01/2027 00:30");
  });

  it("n'applique pas d'heure d'été (UTC+1 toute l'année)", () => {
    expect(formatTime("2027-07-15T12:00:00Z")).toBe("13:00");
    expect(formatTime("2027-01-15T12:00:00Z")).toBe("13:00");
  });
});
