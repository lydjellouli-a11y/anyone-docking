import { describe, expect, it } from "vitest";
import { algiersToUtcIso, weeklyDates } from "./schedule";
import { formatDateTime } from "./dates";

describe("algiersToUtcIso", () => {
  it("convertit l'heure d'Alger en UTC (UTC+1)", () => {
    expect(algiersToUtcIso("2026-10-12", "08:30")).toBe("2026-10-12T07:30:00.000Z");
  });

  it("gère minuit (jour précédent en UTC)", () => {
    expect(algiersToUtcIso("2027-01-01", "00:15")).toBe("2026-12-31T23:15:00.000Z");
  });

  it("aller-retour : la séance s'affiche à l'heure saisie", () => {
    expect(formatDateTime(algiersToUtcIso("2026-10-14", "10:00"))).toBe("14/10/2026 10:00");
  });

  it.each([
    ["2026-02-30", "08:00"],
    ["2026-13-01", "08:00"],
    ["12/10/2026", "08:00"],
    ["2026-10-12", "24:00"],
    ["2026-10-12", "8h30"],
  ])("refuse %s %s", (d, t) => {
    expect(() => algiersToUtcIso(d, t)).toThrow();
  });
});

describe("weeklyDates", () => {
  it("donne tous les lundis d'une période", () => {
    // 12/10/2026 est un lundi
    expect(weeklyDates("2026-10-11", "2026-11-02", 1)).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
    ]);
  });

  it("donne tous les mercredis (bornes incluses)", () => {
    expect(weeklyDates("2026-10-14", "2026-10-28", 3)).toEqual(["2026-10-14", "2026-10-21", "2026-10-28"]);
  });

  it("refuse une période inversée", () => {
    expect(() => weeklyDates("2026-11-01", "2026-10-01", 1)).toThrow();
  });
});
