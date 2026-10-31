import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORG_SECTION,
  ORG_SECTIONS,
  parseOrgSection,
  sectionLabel,
} from "./orgSections";

describe("secciones del Nivel 2", () => {
  it("arranca en resumen cuando no hay parámetro o es inválido", () => {
    expect(parseOrgSection(null)).toBe(DEFAULT_ORG_SECTION);
    expect(parseOrgSection("no-existe")).toBe("resumen");
  });

  it("acepta las secciones declaradas", () => {
    for (const section of ORG_SECTIONS) {
      expect(parseOrgSection(section.id)).toBe(section.id);
      expect(sectionLabel(section.id)).toBe(section.label);
    }
  });

  it("cae al primer label si la sección no existe", () => {
    expect(sectionLabel("otra")).toBe(ORG_SECTIONS[0].label);
  });
});
