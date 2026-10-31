import { describe, expect, it } from "vitest";
import { es, t } from "./index";
import { PLATFORM_NAV, platformNavLeaves } from "../platformNav";
import { NAV_GROUPS, navLeaves } from "../nav";

describe("catálogo es", () => {
  it("no tiene mensajes vacíos", () => {
    const empty = Object.entries(es).filter(([, value]) => value.trim() === "");
    expect(empty).toEqual([]);
  });

  it("interpola variables", () => {
    expect(t("nav.item.tenants")).toBe("Organizaciones");
  });

  it("todo texto de los menús sale del catálogo", () => {
    const catalog = new Set<string>(Object.values(es));
    const hardcoded = [
      ...PLATFORM_NAV.map((group) => group.label),
      ...platformNavLeaves().map((item) => item.label),
      ...NAV_GROUPS.map((group) => group.label).filter(
        (label): label is string => Boolean(label),
      ),
      ...NAV_GROUPS.flatMap(navLeaves).map((item) => item.label),
    ].filter((label) => !catalog.has(label));
    expect(hardcoded).toEqual([]);
  });
});
