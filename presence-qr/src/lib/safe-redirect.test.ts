import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("accepte un chemin interne", () => {
    expect(safeNextPath("/espace/abc")).toBe("/espace/abc");
  });

  it.each([null, undefined, "", "https://exemple.test", "//exemple.test", "/\\exemple.test", "espace"])(
    "refuse %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/espace");
    },
  );
});
